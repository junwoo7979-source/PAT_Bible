const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { applyCors, assertChurchCode, assertToken, validChurchCode } = require('./security');
const {
  hashFamilyPassword,
  verifyFamilyPassword,
  sanitizeFamilyDataForSave,
  publicFamily,
} = require('./password');

initializeApp();
const db = getFirestore();

// Groq(클라우드 Whisper) API 키 — Firebase Secret으로 관리(코드/깃에 노출 안 됨)
const GROQ_API_KEY = defineSecret('GROQ_API_KEY');
// 개발자(플랫폼 운영자) 전용 통계 토큰 — Firebase Secret(앱/코드에 노출 없음)
const PAT_DEV_TOKEN = defineSecret('PAT_DEV_TOKEN');

function begin(req, res) {
  if (!applyCors(req, res)) return false;
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return false;
  }
  return true;
}

function errRes(res, e, code = 500) {
  console.error('[PAT Functions]', e.message);
  res.status(code).json({ error: e.message || 'Internal server error' });
}

// 교구별 집계 + 시상 순위 — 별도 모듈(테스트 가능)
const { countParishMembers, countCompletedMembersByParish, rankFamilies } = require('./aggregate');

function requireClientWrite(req, res) {
  return assertToken(req, res, {
    envName: 'PAT_CLIENT_TOKEN',
    headerName: 'x-pat-client-token',
  });
}

function requireAdminWrite(req, res) {
  return assertToken(req, res, {
    envName: 'PAT_ADMIN_TOKEN',
    headerName: 'x-pat-admin-token',
    credentialHeaders: {
      id: 'x-pat-admin-id',
      password: 'x-pat-admin-password',
    },
    credentialEnv: {
      id: 'PAT_ADMIN_ID',
      password: 'PAT_ADMIN_PASSWORD',
    },
  });
}

exports.ping = onRequest({ cors: true, region: 'us-central1' }, (req, res) => {
  if (!begin(req, res)) return;
  res.json({ status: 'ok', message: 'PAT Bible API connected', timestamp: new Date().toISOString() });
});

// ════════════════════════════════════════════════════════
// 멀티 교회 — 교회 등록 / 관리자 로그인 / 코드 확인
// ════════════════════════════════════════════════════════
function hdr(req, name) {
  const h = req.headers || {};
  return h[name] || h[name.toLowerCase()] || '';
}
// 신규 교회 코드 형식: 앞에 특수문자 1개(# @ * ! - _) + 숫자 6자리 (예: #482913)
const NEW_CHURCH_CODE_RE = /^[#@*!_-]\d{6}$/;
// 관리자 아이디: 영문 시작 + 영문/숫자, 3~20자
const ADMIN_ID_RE = /^[A-Za-z][A-Za-z0-9]{2,19}$/;
// 관리자 비번: 특수문자 → 영문 → 숫자 순서, 8자 이상 (예: #grace2026)
const ADMIN_PW_RE = /^(?=.{8,}$)[^A-Za-z0-9]+[A-Za-z]+[0-9]+$/;

// 교회별 관리자 검증: 그 교회의 admin/cred 와 헤더(id/pw) 대조.
// admin 문서가 없으면(레거시 세광 11111 등) 기존 전역 검증으로 폴백 → 호환 유지.
async function assertChurchAdmin(req, res, churchCode) {
  const credSnap = await db.doc(`churches/${churchCode}/admin/cred`).get();
  if (credSnap.exists) {
    const cred = credSnap.data();
    const id = hdr(req, 'x-pat-admin-id');
    const pw = hdr(req, 'x-pat-admin-password');
    if (id && pw && id === cred.adminId && verifyFamilyPassword(churchCode, pw, cred.adminPwHash)) return true;
    res.status(401).json({ error: 'Unauthorized (church admin)' });
    return false;
  }
  return requireAdminWrite(req, res); // 레거시 전역 검증
}

// 교회 신규 등록 — 누구나 가능(오픈 셀프 등록). 기존 교회 덮어쓰기 차단.
exports.registerChurch = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
  try {
    const { code, name, adminId, adminPw } = req.body || {};
    if (!NEW_CHURCH_CODE_RE.test(String(code || ''))) {
      res.status(400).json({ error: '교회 코드는 특수문자 1개 + 숫자 6자리여야 합니다 (예: #482913)' }); return;
    }
    if (!name || !String(name).trim()) { res.status(400).json({ error: '교회 이름을 입력하세요' }); return; }
    if (!ADMIN_ID_RE.test(String(adminId || ''))) {
      res.status(400).json({ error: '관리자 아이디는 영문으로 시작하는 3~20자여야 합니다' }); return;
    }
    if (!ADMIN_PW_RE.test(String(adminPw || ''))) {
      res.status(400).json({ error: '관리자 비밀번호는 특수문자 → 영문 → 숫자 순서로 8자 이상이어야 합니다 (예: #grace2026)' }); return;
    }
    // 기존 교회 보호: 코드가 이미 쓰이면(설정/관리자/루트 문서 존재) 거부
    const [rootDoc, credDoc, cfgDoc] = await Promise.all([
      db.doc(`churches/${code}`).get(),
      db.doc(`churches/${code}/admin/cred`).get(),
      db.doc(`churches/${code}/config/current`).get(),
    ]);
    if (rootDoc.exists || credDoc.exists || cfgDoc.exists) {
      res.status(409).json({ error: '이미 사용 중인 교회 코드입니다. 다른 코드를 입력하세요.' }); return;
    }
    await db.doc(`churches/${code}`).set({ name: String(name).trim(), createdAt: FieldValue.serverTimestamp() });
    await db.doc(`churches/${code}/admin/cred`).set({
      adminId: String(adminId), adminPwHash: hashFamilyPassword(code, adminPw), createdAt: FieldValue.serverTimestamp(),
    });
    // 초기 설정 문서(교회 이름) 생성 → 코드 점유 표시 + 성도 화면 제목
    await db.doc(`churches/${code}/config/current`).set({
      appTitle: String(name).trim(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ ok: true, code, name: String(name).trim() });
  } catch (e) { errRes(res, e); }
});

// 관리자 로그인(신규 교회) — 교회코드+아이디+비번 대조
exports.adminLogin = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
  try {
    const { code, adminId, adminPw } = req.body || {};
    if (!assertChurchCode(code, res)) return;
    const credSnap = await db.doc(`churches/${code}/admin/cred`).get();
    if (!credSnap.exists) { res.status(404).json({ ok: false, error: '등록되지 않은 교회 코드입니다' }); return; }
    const cred = credSnap.data();
    if (String(adminId) !== cred.adminId || !verifyFamilyPassword(code, adminPw, cred.adminPwHash)) {
      res.status(401).json({ ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다' }); return;
    }
    const nameDoc = await db.doc(`churches/${code}`).get();
    res.json({ ok: true, code, name: (nameDoc.exists && nameDoc.data().name) || '' });
  } catch (e) { errRes(res, e); }
});

// ════════════════════════════════════════════════════════
// 개발자(플랫폼 운영자) 전용 — 전 교회 사용 현황 통계
// ════════════════════════════════════════════════════════
exports.getPlatformStats = onRequest({ cors: true, region: 'us-central1', secrets: [PAT_DEV_TOKEN] }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const token = hdr(req, 'x-pat-dev-token') || (req.query && req.query.token) || '';
    if (!token || token !== PAT_DEV_TOKEN.value()) { res.status(401).json({ error: 'Unauthorized' }); return; }

    // 서브컬렉션만 있는 레거시(세광 11111 등)도 포함하려면 listDocuments() 사용
    const churchRefs = await db.collection('churches').listDocuments();
    let totalFamilies = 0, totalMembers = 0;
    const churches = [];
    for (const cref of churchRefs) {
      const code = cref.id;
      const [rootSnap, famSnap] = await Promise.all([cref.get(), cref.collection('families').get()]);
      let name = (rootSnap.exists && rootSnap.data().name) || '';
      if (!name) {
        const cfg = await cref.collection('config').doc('current').get();
        name = (cfg.exists && cfg.data().appTitle) || '';
      }
      let memberCount = 0;
      for (const fdoc of famSnap.docs) {
        const data = fdoc.data();
        const names = new Set();
        if (Array.isArray(data.members)) data.members.forEach(m => {
          const n = String(typeof m === 'string' ? m : (m && (m.displayName || m.name)) || '').trim();
          if (n) names.add(n);
        });
        const subs = await fdoc.ref.collection('members').get();
        subs.docs.forEach(d => { const n = String((d.data().displayName || d.data().name) || '').trim(); if (n) names.add(n); });
        memberCount += names.size;
      }
      const familyCount = famSnap.size;
      totalFamilies += familyCount;
      totalMembers += memberCount;
      let createdAt = null;
      try { const ca = rootSnap.exists && rootSnap.data().createdAt; if (ca && ca.toDate) createdAt = ca.toDate().toISOString(); } catch (e) {}
      churches.push({ code, name, familyCount, memberCount, createdAt });
    }
    churches.sort((a, b) => (b.memberCount - a.memberCount) || (b.familyCount - a.familyCount));
    res.json({ totalChurches: churches.length, totalFamilies, totalMembers, churches });
  } catch (e) { errRes(res, e); }
});

// 개발자 전용 — 교회 전체 삭제(테스트/스팸 정리). 하위 전부 재귀 삭제.
exports.deleteChurch = onRequest({ cors: true, region: 'us-central1', secrets: [PAT_DEV_TOKEN] }, async (req, res) => {
  if (!begin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
  try {
    const token = hdr(req, 'x-pat-dev-token');
    if (!token || token !== PAT_DEV_TOKEN.value()) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { code } = req.body || {};
    if (!validChurchCode(code)) { res.status(400).json({ error: 'Valid code required' }); return; }
    await db.recursiveDelete(db.doc(`churches/${code}`)); // 문서 + 모든 하위 컬렉션 삭제
    res.json({ ok: true, code });
  } catch (e) { errRes(res, e); }
});

// 교회 코드 사용 가능 여부(등록 화면 중복확인)
exports.checkChurchCode = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const { code } = req.query;
    if (!validChurchCode(code)) { res.json({ valid: false, available: false }); return; }
    const [rootDoc, credDoc, cfgDoc] = await Promise.all([
      db.doc(`churches/${code}`).get(),
      db.doc(`churches/${code}/admin/cred`).get(),
      db.doc(`churches/${code}/config/current`).get(),
    ]);
    const used = rootDoc.exists || credDoc.exists || cfgDoc.exists;
    res.json({ valid: true, available: !used });
  } catch (e) { errRes(res, e); }
});

// ── 교회 설정 조회 (구절, 앱제목 등) ──
exports.getConfig = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const { churchCode } = req.query;
    if (!assertChurchCode(churchCode, res)) return;
    const doc = await db.doc(`churches/${churchCode}/config/current`).get();
    if (!doc.exists) {
      const verseSnap = await db.collection(`churches/${churchCode}/verses`)
        .orderBy('createdAt', 'desc').limit(1).get();
      if (verseSnap.empty) {
        res.json({ config: null });
        return;
      }
      const verseDoc = verseSnap.docs[0];
      res.json({
        config: {
          appTitle: '',
          verse: { id: verseDoc.id, ...verseDoc.data() },
        }
      });
      return;
    }
    const data = doc.data();
    res.json({
      config: {
        appTitle: data.appTitle || '',
        verse: data.verse || null,
        parishTotals: data.parishTotals || null,
      }
    });
  } catch (e) {
    errRes(res, e);
  }
});

// ── 교회 설정 저장 (Admin만) ──
exports.saveConfig = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  console.log('[PAT] saveConfig 요청 시작');
  try {
    const { churchCode, appTitle, verse, parishTotals } = req.body;
    console.log('[PAT] saveConfig 수신:', { churchCode, appTitle, verseRef: verse?.ref, parishTotals });
    if (!assertChurchCode(churchCode, res)) return;
    // ★ 교회별 관리자 검증(레거시 11111은 전역 폴백) — 멀티 교회 격리
    if (!(await assertChurchAdmin(req, res, churchCode))) { console.error('[PAT] Admin 검증 실패'); return; }
    // 부분 업데이트: 전달된 필드만 갱신 (교구 인원만 저장 시 verse/제목 보존)
    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (appTitle !== undefined) update.appTitle = appTitle || '';
    if (verse !== undefined) update.verse = verse || null;
    if (parishTotals && typeof parishTotals === 'object') {
      update.parishTotals = parishTotals;
    }
    await db.doc(`churches/${churchCode}/config/current`).set(update, { merge: true });
    console.log('[PAT] saveConfig 저장 성공');
    res.json({ ok: true });
  } catch (e) {
    console.error('[PAT] saveConfig 에러:', e.message);
    errRes(res, e);
  }
});

exports.getVerse = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const { churchCode } = req.query;
    if (!assertChurchCode(churchCode, res)) return;
    const snap = await db.collection(`churches/${churchCode}/verses`)
      .orderBy('createdAt', 'desc').limit(1).get();
    if (snap.empty) { res.json({ verse: null }); return; }
    const doc = snap.docs[0];
    res.json({ verse: { id: doc.id, ...doc.data() } });
  } catch (e) { errRes(res, e); }
});

exports.saveVerse = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  console.log('[PAT] saveVerse 요청 시작');
  try {
    const { churchCode, ref, text, weekOf } = req.body;
    console.log('[PAT] saveVerse 파라미터:', { churchCode, ref });
    if (!assertChurchCode(churchCode, res)) {
      console.error('[PAT] churchCode 검증 실패:', churchCode);
      return;
    }
    // ★ 교회별 관리자 검증(레거시 11111은 전역 폴백) — 멀티 교회 격리
    if (!(await assertChurchAdmin(req, res, churchCode))) { console.error('[PAT] Admin 검증 실패'); return; }
    if (!ref || !text) {
      console.error('[PAT] ref 또는 text 없음');
      res.status(400).json({ error: 'ref, text required' });
      return;
    }
    const docRef = await db.collection(`churches/${churchCode}/verses`).add({
      ref, text, weekOf: weekOf || '', createdAt: FieldValue.serverTimestamp(),
    });
    console.log('[PAT] saveVerse 저장 성공:', docRef.id);
    res.json({ id: docRef.id });
  } catch (e) {
    console.error('[PAT] saveVerse 에러:', e.message);
    errRes(res, e);
  }
});

exports.saveFamily = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  // ⚠️ 토큰 검증 제거 — churchCode + familyPassword 조합이 보호 수단
  try {
    const { churchCode, familyId, ...data } = req.body;
    if (!assertChurchCode(churchCode, res)) return;
    const familyData = sanitizeFamilyDataForSave(churchCode, data);
    const col = db.collection(`churches/${churchCode}/families`);
    if (familyId) {
      await col.doc(familyId).set({
        ...familyData,
        familyPassword: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      res.json({ familyId });
    } else {
      if (!data.familyPassword) { res.status(400).json({ error: 'familyPassword required' }); return; }
      // ★ 중복 방지: 같은 (대표+교구)의 기존 가정이 있으면 새로 만들지 않고 그 문서를 갱신.
      //   familyId 분실 상태(인앱브라우저/다기기/이중제출)에서 재등록해도 중복 문서가
      //   쌓이지 않게 — "가족방 초기화 → 중복 누적" 근본 차단. (구역은 최신값으로 갱신)
      const leaderName = String(familyData.leaderName || '').trim();
      const parish = String(familyData.parish || '').trim();
      if (leaderName && parish) {
        const sameLeader = await col.where('leaderName', '==', leaderName).get(); // 단일 equality(인덱스 불필요)
        const dup = sameLeader.docs.find(d => String((d.data().parish) || '').trim() === parish);
        if (dup) {
          const exist = dup.data();
          const names = new Set();   // 멤버는 합집합으로 보존(기존 + 신규)
          [exist.members, familyData.members].forEach(arr => {
            if (Array.isArray(arr)) arr.forEach(m => {
              const n = String(typeof m === 'string' ? m : (m && (m.displayName || m.name)) || '').trim();
              if (n) names.add(n);
            });
          });
          await dup.ref.set({
            ...familyData,
            members: Array.from(names),
            familyPassword: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          res.json({ familyId: dup.id, merged: true });
          return;
        }
      }
      const ref = await col.add({ ...familyData, createdAt: FieldValue.serverTimestamp() });
      res.json({ familyId: ref.id });
    }
  } catch (e) { errRes(res, e); }
});

// 가정 삭제 (관리자 전용) — family 문서 + members 서브컬렉션 + 해당 가정 records 정리.
//   중복 가정 정리/관리자 데이터 관리용. 교회별 admin 인증 필요(레거시 11111 전역 폴백).
exports.deleteFamily = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
  try {
    const { churchCode, familyId } = req.body || {};
    if (!assertChurchCode(churchCode, res)) return;
    if (!familyId) { res.status(400).json({ error: 'familyId required' }); return; }
    if (!(await assertChurchAdmin(req, res, churchCode))) return;
    const subs = await db.collection(`churches/${churchCode}/families/${familyId}/members`).get();
    await Promise.all(subs.docs.map(d => d.ref.delete()));
    const recs = await db.collection(`churches/${churchCode}/records`).where('familyId', '==', familyId).get();
    await Promise.all(recs.docs.map(d => d.ref.delete()));
    await db.doc(`churches/${churchCode}/families/${familyId}`).delete();
    res.json({ ok: true, familyId, deletedMembers: subs.size, deletedRecords: recs.size });
  } catch (e) { errRes(res, e); }
});

// 레거시 평문 비밀번호 → 해시로 마이그레이션 후 family 반환
async function migrateAndReturn(doc, passwordHash) {
  await doc.ref.set({
    familyPasswordHash: passwordHash,
    familyPassword: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  // stale 스냅샷 대신 최신 데이터 재조회
  const fresh = await doc.ref.get();
  return publicFamily(fresh.id, fresh.data());
}

exports.findFamily = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
  // ⚠️ 토큰 검증 제거 — 가족 비밀번호 자체가 인증 수단 (새 멤버는 사전 토큰 없음)
  try {
    const { churchCode, familyPassword, familyId } = req.body;
    if (!assertChurchCode(churchCode, res)) return;
    if (!familyPassword) { res.status(400).json({ error: 'familyPassword required' }); return; }

    const col = db.collection(`churches/${churchCode}/families`);
    const passwordHash = hashFamilyPassword(churchCode, familyPassword);

    if (familyId) {
      const doc = await col.doc(familyId).get();
      if (!doc.exists) { res.json({ family: null }); return; }
      const data = doc.data();
      if (verifyFamilyPassword(churchCode, familyPassword, data.familyPasswordHash)) {
        res.json({ family: publicFamily(doc.id, data) });
        return;
      }
      if (data.familyPassword === familyPassword) {
        res.json({ family: await migrateAndReturn(doc, passwordHash) });
        return;
      }
      res.json({ family: null });
      return;
    }

    const hashSnap = await col.where('familyPasswordHash', '==', passwordHash).limit(1).get();
    if (!hashSnap.empty) {
      res.json({ family: publicFamily(hashSnap.docs[0].id, hashSnap.docs[0].data()) });
      return;
    }

    const legacySnap = await col.where('familyPassword', '==', familyPassword).limit(1).get();
    if (legacySnap.empty) { res.json({ family: null }); return; }
    res.json({ family: await migrateAndReturn(legacySnap.docs[0], passwordHash) });
  } catch (e) { errRes(res, e); }
});

exports.joinFamily = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  // ⚠️ 토큰 검증 제거 — findFamily 비번 검증 후 호출되는 후속 단계
  try {
    const { churchCode, familyId, deviceId, displayName } = req.body;
    if (!assertChurchCode(churchCode, res)) return;
    if (!familyId || !deviceId) { res.status(400).json({ error: 'familyId, deviceId required' }); return; }
    await db.doc(`churches/${churchCode}/families/${familyId}/members/${deviceId}`).set({
      displayName: displayName || 'member', deviceId, joinedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ ok: true });
  } catch (e) { errRes(res, e); }
});

// ★ 구성원 삭제 — members 배열 + members 서브컬렉션을 함께 정리.
//   (getFamilyProgress가 배열∪서브컬렉션 합집합이라, 배열에서만 지우면
//    입장기록이 남은 멤버가 폴링에서 다시 살아나는 문제(#2) 방지)
exports.removeFamilyMember = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  // ⚠️ 토큰 검증 제거 — churchCode + familyId 조합으로 보호(가족 비번 검증 후 호출되는 후속 단계)
  try {
    const { churchCode, familyId, name } = req.body;
    if (!assertChurchCode(churchCode, res)) return;
    if (!familyId || !name) { res.status(400).json({ error: 'familyId, name required' }); return; }
    const target = String(name).trim();
    const famRef = db.doc(`churches/${churchCode}/families/${familyId}`);
    const famDoc = await famRef.get();
    if (!famDoc.exists) { res.status(404).json({ error: 'family not found' }); return; }

    // 1) members 배열에서 제거
    const members = Array.isArray(famDoc.data().members) ? famDoc.data().members : [];
    const nextMembers = members.filter(member => {
      const n = (typeof member === 'string' ? member : (member && (member.displayName || member.name)) || '').trim();
      return n !== target;
    });
    await famRef.set({ members: nextMembers, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // 2) members 서브컬렉션에서 같은 이름의 입장기록 삭제 (합집합 재출현 차단)
    const subSnap = await db.collection(`churches/${churchCode}/families/${familyId}/members`).get();
    const deletions = subSnap.docs
      .filter(doc => ((doc.data().displayName || doc.data().name || '').trim() === target))
      .map(doc => doc.ref.delete());
    await Promise.all(deletions);

    res.json({ ok: true, removed: target, deletedDocs: deletions.length });
  } catch (e) { errRes(res, e); }
});

exports.getFamilyProgress = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const { churchCode, familyId, verseRef } = req.query;
    if (!assertChurchCode(churchCode, res)) return;
    if (!familyId) { res.status(400).json({ error: 'familyId required' }); return; }
    // ★ 가족방 정보 조회 (roomName, leaderName, parish, district 등)
    const familyDoc = await db.doc(`churches/${churchCode}/families/${familyId}`).get();
    const familyData = familyDoc.exists ? familyDoc.data() : {};
    const declaredMembers = Array.isArray(familyData.members)
      ? familyData.members
          .map(member => (typeof member === 'string' ? member : (member && (member.displayName || member.name)) || ''))
          .map(name => String(name).trim())
          .filter(Boolean)
      : [];
    const memberSnap = await db.collection(`churches/${churchCode}/families/${familyId}/members`).get();
    const memberMap = new Map();
    declaredMembers.forEach(name => memberMap.set(name, { displayName: name, name }));
    memberSnap.docs.forEach(doc => {
      const member = { id: doc.id, ...doc.data() };
      const name = (member.displayName || member.name || '').trim();
      if(name) memberMap.set(name, member);
    });
    const members = Array.from(memberMap.values());
    // ★ done = 현재 구절을 실제로 완료(기록 존재)한 멤버만 true.
    //   등록/입장만으로 done 처리하지 않는다(발생하지 않은 데이터 반영 금지).
    const doneByName = {}, doneByDevice = {};
    if (verseRef) {
      const recSnap = await db.collection(`churches/${churchCode}/records`)
        .where('familyId', '==', familyId).get();
      recSnap.docs.forEach(doc => {
        const r = doc.data();
        if (r.verseRef !== verseRef) return;
        if (r.memberName) doneByName[String(r.memberName).trim()] = true;
        if (r.deviceId) doneByDevice[r.deviceId] = true;
      });
    }
    res.json({
      roomName: familyData.roomName || '',
      leaderName: familyData.leaderName || '',
      parish: familyData.parish || '',
      district: familyData.district || '',
      members: members.map(m => {
        const name = (m.displayName || m.name || '').trim();
        const done = !!(doneByName[name] || (m.deviceId && doneByDevice[m.deviceId]));
        return { ...m, done };
      })
    });
  } catch (e) { errRes(res, e); }
});

exports.saveRecord = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  // ⚠️ 토큰 검증 제거 — 미션 기록은 인증된 구성원이 저장
  try {
    const { churchCode, verseRef, deviceId, familyId, parish, district,
            leaderName, memberName, voiceScore1, voiceScore2, typeScore1, typeScore2, badge } = req.body;
    if (!assertChurchCode(churchCode, res)) return;
    if (!verseRef) { res.status(400).json({ error: 'verseRef required' }); return; }
    const ref = await db.collection(`churches/${churchCode}/records`).add({
      verseRef, deviceId, familyId, parish, district,
      leaderName, memberName, voiceScore1, voiceScore2, typeScore1, typeScore2, badge,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ id: ref.id });
  } catch (e) { errRes(res, e); }
});

exports.hasRecord = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const { churchCode, verseRef, deviceId } = req.query;
    if (!assertChurchCode(churchCode, res)) return;
    if (!verseRef || !deviceId) { res.status(400).json({ error: 'verseRef, deviceId required' }); return; }
    const snap = await db.collection(`churches/${churchCode}/records`)
      .where('deviceId', '==', deviceId).where('verseRef', '==', verseRef).limit(1).get();
    res.json({ exists: !snap.empty });
  } catch (e) { errRes(res, e); }
});

exports.getDashboard = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const { churchCode, verseRef } = req.query;
    if (!assertChurchCode(churchCode, res)) return;
    if (!verseRef) { res.status(400).json({ error: 'verseRef required' }); return; }

    console.log(`\n[PAT-DASHBOARD] ===== 대시보드 집계 시작 =====`);
    console.log(`  churchCode: ${churchCode}`);
    console.log(`  verseRef: ${verseRef}\n`);

    // ✅ 1️⃣ 모든 등록된 가정(families) 조회
    const familiesSnap = await db.collection(`churches/${churchCode}/families`).get();
    console.log(`[PAT-DASHBOARD] ✅ 등록된 가정 수집: ${familiesSnap.size}개 가정`);

    // ✅ 2️⃣ 해당 구절의 모든 암송 기록(records) 조회
    const recordsSnap = await db.collection(`churches/${churchCode}/records`)
      .where('verseRef', '==', verseRef).get();
    console.log(`[PAT-DASHBOARD] ✅ 암송 기록 수집: ${recordsSnap.size}개 기록\n`);

    // ✅ 3️⃣ 가정별 등록 인원(헤드카운트) + 가정→교구 매핑
    //    각 가정의 인원 = 선언 members + 입장 members(서브컬렉션) 이름 합집합.
    const families = await Promise.all(familiesSnap.docs.map(async doc => {
      const data = doc.data();
      const joinedSnap = await doc.ref.collection('members').get();
      return {
        id: doc.id,
        parish: (data.parish || '').trim(),
        members: data.members,
        joinedMembers: joinedSnap.docs.map(d => d.data()),
      };
    }));
    const reg = countParishMembers(families);                // {byParish: 교구별 참가인원, totalMembers}
    const totalMembers = reg.totalMembers;
    const familyToParish = {};
    families.forEach(f => { familyToParish[f.id] = f.parish; });

    // ✅ 4️⃣ 교구별 "진도" 집계 — 현재 구절을 실제 완료한 멤버 수 (records 기반)
    //    등록만 하고 암송 안 한 사람은 0. 진도가 없으면 byParish 도 0.
    const records = recordsSnap.docs.map(doc => doc.data());
    const { byParish, completedMembers } = countCompletedMembersByParish(records, familyToParish);

    // 완료한 가정 수 (교회 전체/블레싱 현황용)
    const completedFamilies = new Set();
    records.forEach(r => { if (r.familyId) completedFamilies.add(r.familyId); });
    const completedTotal = completedFamilies.size;  // 완료한 가정 수
    const totalFamilies = familiesSnap.size;        // 등록된 모든 가정 수

    console.log(`\n[PAT-DASHBOARD] ===== 최종 결과 =====`);
    console.log(`  등록 가정: ${totalFamilies}개, 등록 인원: ${totalMembers}명`);
    console.log(`  완료 가정: ${completedTotal}개, 완료 멤버: ${completedMembers}명`);
    console.log(`  교구별 진도(완료 멤버) → 1교구:${byParish['1교구']} 2교구:${byParish['2교구']} 3교구:${byParish['3교구']}명\n`);

    res.json({
      total: completedTotal,           // 완료한 가정 수 (교회 전체/블레싱용)
      totalFamilies: totalFamilies,     // 등록된 모든 가정 수
      totalMembers: totalMembers,       // 등록된 전체 인원 수(참고)
      completedMembers: completedMembers, // 완료한 전체 멤버 수
      byParish,                         // 교구별 진도(현재 구절 완료 멤버 수)
      registeredByParish: reg.byParish  // 교구별 참가인원(등록 멤버 헤드카운트)
    });
  } catch (e) { errRes(res, e); }
});

// ── 가족 비밀번호 재설정 (본인 확인: 대표자 이름 + 교구 + 구역) ──
exports.resetFamilyPassword = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
  // ⚠️ 토큰 검증 제거 — leaderName+parish+district 3종 본인 확인이 보호 수단
  try {
    const { churchCode, leaderName, parish, district, newPassword } = req.body;
    if (!assertChurchCode(churchCode, res)) return;
    if (!leaderName || !parish || !district) {
      res.status(400).json({ error: 'leaderName, parish, district required' }); return;
    }
    if (!newPassword || newPassword.length < 4) {
      res.status(400).json({ error: 'newPassword must be at least 4 characters' }); return;
    }
    const col = db.collection(`churches/${churchCode}/families`);
    const snap = await col
      .where('leaderName', '==', leaderName)
      .where('parish', '==', parish)
      .where('district', '==', district)
      .limit(1).get();
    if (snap.empty) {
      res.status(404).json({ error: '일치하는 가족방을 찾을 수 없습니다. 대표자 이름·교구·구역을 확인해주세요.' }); return;
    }
    const newHash = hashFamilyPassword(churchCode, newPassword);
    await snap.docs[0].ref.set({
      familyPasswordHash: newHash,
      familyPassword: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ ok: true, familyId: snap.docs[0].id });
  } catch (e) { errRes(res, e); }
});

// ── 음성 전사 프록시 (Groq Whisper large-v3) — 폰 부담 0, ~1~2초 ──
//    프론트가 녹음 오디오(base64)를 보내면 서버가 Groq로 전사해 텍스트 반환.
//    키는 Secret(GROQ_API_KEY)으로만 보관 → 노출 없음.
exports.transcribeAudio = onRequest({ cors: true, region: 'us-central1', secrets: [GROQ_API_KEY], memory: '512MiB', timeoutSeconds: 60 }, async (req, res) => {
  if (!begin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
  try {
    const { audioBase64, mimeType, language, model } = req.body || {};
    if (!audioBase64) { res.status(400).json({ error: 'audioBase64 required' }); return; }
    const key = GROQ_API_KEY.value();
    if (!key) { res.status(500).json({ error: 'GROQ_API_KEY 미설정' }); return; }

    const buf = Buffer.from(audioBase64, 'base64');
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mimeType || 'audio/webm' }), 'audio.webm');
    form.append('model', model || 'whisper-large-v3-turbo');
    form.append('language', language || 'ko');
    form.append('response_format', 'json');
    form.append('temperature', '0');

    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: form,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[GROQ] 오류:', r.status, JSON.stringify(data).slice(0, 300));
      res.status(502).json({ error: 'groq_failed', status: r.status, detail: data });
      return;
    }
    res.json({ text: ((data.text || '')).replace(/\s+/g, ' ').trim() });
  } catch (e) { errRes(res, e); }
});

// ── 시상관리: 가족별 실천율 순위 (교구별 현황과 동일 Firestore 소스) ──
exports.getAwardRanking = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const { churchCode } = req.query;
    if (!assertChurchCode(churchCode, res)) return;

    // 총 구절 수(분모)
    const versesSnap = await db.collection(`churches/${churchCode}/verses`).get();
    const totalVerses = versesSnap.size;

    // 가족 + 멤버명(선언 members + 입장 members 합집합)
    const familiesSnap = await db.collection(`churches/${churchCode}/families`).get();
    const families = await Promise.all(familiesSnap.docs.map(async doc => {
      const data = doc.data();
      const names = new Set();
      if (Array.isArray(data.members)) {
        data.members.forEach(m => {
          const n = (typeof m === 'string' ? m : (m && (m.displayName || m.name)) || '').trim();
          if (n) names.add(n);
        });
      }
      const joined = await doc.ref.collection('members').get();
      joined.docs.forEach(d => {
        const n = ((d.data().displayName || d.data().name) || '').trim();
        if (n) names.add(n);
      });
      return { id: doc.id, roomName: data.roomName || '', memberNames: Array.from(names) };
    }));

    // 전체 기록
    const recordsSnap = await db.collection(`churches/${churchCode}/records`).get();
    const records = recordsSnap.docs.map(d => d.data());

    const ranking = rankFamilies(families, records, totalVerses);
    res.json({ ranking, totalVerses });
  } catch (e) { errRes(res, e); }
});

// ── 등록가정 목록 (관리자 데이터 관리용) ──
exports.getFamiliesList = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const { churchCode } = req.query;
    if (!assertChurchCode(churchCode, res)) return;
    const snap = await db.collection(`churches/${churchCode}/families`).get();
    const families = await Promise.all(snap.docs.map(async doc => {
      const d = doc.data();
      const names = new Set();
      if (Array.isArray(d.members)) d.members.forEach(m => {
        const n = (typeof m === 'string' ? m : (m && (m.displayName || m.name)) || '').trim();
        if (n) names.add(n);
      });
      const joined = await doc.ref.collection('members').get();
      joined.docs.forEach(j => {
        const n = ((j.data().displayName || j.data().name) || '').trim();
        if (n) names.add(n);
      });
      return {
        familyId: doc.id,
        roomName: d.roomName || '', leaderName: d.leaderName || '',
        parish: d.parish || '', district: d.district || '',
        memberCount: names.size, memberNames: Array.from(names),
      };
    }));
    families.sort((a, b) => (a.parish || '').localeCompare(b.parish || '') || (a.roomName || '').localeCompare(b.roomName || ''));
    res.json({ total: families.length, families });
  } catch (e) { errRes(res, e); }
});
