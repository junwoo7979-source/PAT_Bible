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
// 예약된 관리자 아이디 (세광 레거시 'admin' 등 — 신규 교회가 못 쓰게)
const RESERVED_ADMIN_IDS = ['admin'];

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
    const adminIdKey = String(adminId).toLowerCase();
    if (RESERVED_ADMIN_IDS.includes(adminIdKey)) {
      res.status(409).json({ error: '사용할 수 없는 관리자 아이디입니다. 다른 아이디를 입력하세요.' }); return;
    }
    // 기존 교회 코드 / 관리자 아이디 중복 보호
    const [rootDoc, credDoc, cfgDoc, idxDoc] = await Promise.all([
      db.doc(`churches/${code}`).get(),
      db.doc(`churches/${code}/admin/cred`).get(),
      db.doc(`churches/${code}/config/current`).get(),
      db.doc(`adminIds/${adminIdKey}`).get(),
    ]);
    if (rootDoc.exists || credDoc.exists || cfgDoc.exists) {
      res.status(409).json({ error: '이미 사용 중인 교회 코드입니다. 다른 코드를 입력하세요.' }); return;
    }
    if (idxDoc.exists) {
      res.status(409).json({ error: '이미 사용 중인 관리자 아이디입니다. 다른 아이디를 입력하세요.' }); return;
    }
    await db.doc(`churches/${code}`).set({ name: String(name).trim(), createdAt: FieldValue.serverTimestamp() });
    await db.doc(`churches/${code}/admin/cred`).set({
      adminId: String(adminId), adminPwHash: hashFamilyPassword(code, adminPw), createdAt: FieldValue.serverTimestamp(),
    });
    // ★ 관리자 아이디 전역 유일 인덱스 → 로그인 시 아이디만으로 교회 식별 (코드 불필요)
    await db.doc(`adminIds/${adminIdKey}`).set({ churchCode: code, adminId: String(adminId), createdAt: FieldValue.serverTimestamp() });
    // 초기 설정 문서(교회 이름) 생성 → 코드 점유 표시 + 성도 화면 제목
    await db.doc(`churches/${code}/config/current`).set({
      appTitle: String(name).trim(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ ok: true, code, name: String(name).trim() });
  } catch (e) { errRes(res, e); }
});

// 관리자 로그인(신규 교회) — 아이디+비번만 (아이디 전역 유일 → 교회 자동 식별)
exports.adminLogin = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
  try {
    const { adminId, adminPw } = req.body || {};
    if (!ADMIN_ID_RE.test(String(adminId || ''))) { res.status(400).json({ ok: false, error: '아이디 형식이 올바르지 않습니다' }); return; }
    const idxSnap = await db.doc(`adminIds/${String(adminId).toLowerCase()}`).get();
    if (!idxSnap.exists) { res.status(404).json({ ok: false, error: '등록되지 않은 관리자 아이디입니다' }); return; }
    const code = idxSnap.data().churchCode;
    const credSnap = await db.doc(`churches/${code}/admin/cred`).get();
    if (!credSnap.exists || !verifyFamilyPassword(code, adminPw, credSnap.data().adminPwHash)) {
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
    // 이 교회를 가리키는 관리자 아이디 인덱스도 정리 (아이디 영구 점유 방지 + 고아 정리)
    const idxSnap = await db.collection('adminIds').where('churchCode', '==', code).get();
    await Promise.all(idxSnap.docs.map(d => d.ref.delete()));
    await db.recursiveDelete(db.doc(`churches/${code}`)); // 문서 + 모든 하위 컬렉션 삭제
    res.json({ ok: true, code, adminIdsCleaned: idxSnap.size });
  } catch (e) { errRes(res, e); }
});

// ════════════════════════════════════════════════════════
// 문의·오류 신고 (교회 → 개발자)
// ════════════════════════════════════════════════════════
// 신고 접수 — 공개(교인/관리자 누구나). 수동 문의 + 자동 오류수집 공용.
exports.submitReport = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
  try {
    const { churchCode, churchName, type, message, screen, ua } = req.body || {};
    const msg = String(message || '').slice(0, 1000).trim();
    if (!msg) { res.status(400).json({ error: 'message required' }); return; }
    await db.collection('reports').add({
      churchCode: String(churchCode || '').slice(0, 40),
      churchName: String(churchName || '').slice(0, 80),
      type: (type === 'auto' ? 'auto' : 'manual'),
      message: msg,
      screen: String(screen || '').slice(0, 40),
      ua: String(ua || '').slice(0, 300),
      createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (e) { errRes(res, e); }
});

// 신고 목록 조회 — 개발자 전용
exports.getReports = onRequest({ cors: true, region: 'us-central1', secrets: [PAT_DEV_TOKEN] }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const token = hdr(req, 'x-pat-dev-token') || (req.query && req.query.token) || '';
    if (!token || token !== PAT_DEV_TOKEN.value()) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const snap = await db.collection('reports').orderBy('createdAt', 'desc').limit(100).get();
    const reports = snap.docs.map(d => {
      const r = d.data();
      let at = null; try { if (r.createdAt && r.createdAt.toDate) at = r.createdAt.toDate().toISOString(); } catch (e) {}
      return { id: d.id, churchCode: r.churchCode || '', churchName: r.churchName || '', type: r.type || 'manual', message: r.message || '', screen: r.screen || '', ua: r.ua || '', createdAt: at };
    });
    res.json({ reports, total: reports.length });
  } catch (e) { errRes(res, e); }
});

// 신고 삭제(처리 완료) — 개발자 전용
exports.deleteReport = onRequest({ cors: true, region: 'us-central1', secrets: [PAT_DEV_TOKEN] }, async (req, res) => {
  if (!begin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
  try {
    const token = hdr(req, 'x-pat-dev-token');
    if (!token || token !== PAT_DEV_TOKEN.value()) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { id } = req.body || {};
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    await db.doc('reports/' + id).delete();
    res.json({ ok: true });
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

// 관리자 아이디 사용 가능 여부(등록 화면 중복확인 — 전역 유일)
exports.checkAdminId = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const { adminId } = req.query;
    if (!ADMIN_ID_RE.test(String(adminId || ''))) { res.json({ valid: false, available: false }); return; }
    const key = String(adminId).toLowerCase();
    if (RESERVED_ADMIN_IDS.includes(key)) { res.json({ valid: true, available: false }); return; }
    const idxSnap = await db.doc(`adminIds/${key}`).get();
    res.json({ valid: true, available: !idxSnap.exists });
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
    const { churchCode, appTitle, verse, parishTotals, parishConfig } = req.body;
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
    // 교회별 교구/그룹 설정 {term, groups:[...]} 저장
    if (parishConfig && typeof parishConfig === 'object') {
      update.parishConfig = parishConfig;
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
        // ★ 2단계: 같은 대표+교구라도 방 종류(가정/구역)가 다르면 다른 방으로 취급(병합 금지).
        //   한 사람이 가정 대표이면서 구역장도 될 수 있게 함.
        const newType = (familyData.groupType === '구역') ? '구역' : '가정';
        const dup = sameLeader.docs.find(d => {
          const dd = d.data();
          const dType = (dd.groupType === '구역') ? '구역' : '가정';
          return String((dd.parish) || '').trim() === parish && dType === newType;
        });
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
    // ★ doneToday = '오늘(KST)' 현재 구절을 완료한 멤버. 개인 실천율을 기기 데이터가
    //   비어도 서버 기준으로 복구하기 위함(멀티폰/재설치/캐시초기화 대비). 기존 done은 유지.
    const doneTodayByName = {}, doneTodayByDevice = {};
    const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const kstDate = (ts) => {
      try { return new Date(ts.toDate().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
      catch (e) { return ''; }
    };
    if (verseRef) {
      const recSnap = await db.collection(`churches/${churchCode}/records`)
        .where('familyId', '==', familyId).get();
      recSnap.docs.forEach(doc => {
        const r = doc.data();
        if (r.verseRef !== verseRef) return;
        const nm = r.memberName ? String(r.memberName).trim() : '';
        if (nm) doneByName[nm] = true;
        if (r.deviceId) doneByDevice[r.deviceId] = true;
        if (r.createdAt && kstDate(r.createdAt) === todayKst) {
          if (nm) doneTodayByName[nm] = true;
          if (r.deviceId) doneTodayByDevice[r.deviceId] = true;
        }
      });
    }
    res.json({
      roomName: familyData.roomName || '',
      leaderName: familyData.leaderName || '',
      parish: familyData.parish || '',
      district: familyData.district || '',
      groupType: familyData.groupType || '',
      members: members.map(m => {
        const name = (m.displayName || m.name || '').trim();
        const done = !!(doneByName[name] || (m.deviceId && doneByDevice[m.deviceId]));
        const doneToday = !!(doneTodayByName[name] || (m.deviceId && doneTodayByDevice[m.deviceId]));
        return { ...m, done, doneToday };
      })
    });
  } catch (e) { errRes(res, e); }
});

exports.saveRecord = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  // ⚠️ 토큰 검증 제거 — 미션 기록은 인증된 구성원이 저장
  try {
    const { churchCode, verseRef, deviceId, familyId, parish, district,
            leaderName, memberName, groupType, voiceScore1, voiceScore2, typeScore1, typeScore2, badge } = req.body;
    if (!assertChurchCode(churchCode, res)) return;
    if (!verseRef) { res.status(400).json({ error: 'verseRef required' }); return; }
    const ref = await db.collection(`churches/${churchCode}/records`).add({
      verseRef, deviceId, familyId, parish, district,
      leaderName, memberName, groupType: (groupType === '구역') ? '구역' : '가정',
      voiceScore1, voiceScore2, typeScore1, typeScore2, badge,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ id: ref.id });
  } catch (e) { errRes(res, e); }
});

// ── 가족 기도 나눔 ───────────────────────────────────────────────
// churches/{code}/families/{familyId}/prayers/{date_memberName}
exports.savePrayer = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const { churchCode, familyId, date, memberName, text } = req.body;
    if (!assertChurchCode(churchCode, res)) return;
    if (!familyId || !date || !memberName) {
      res.status(400).json({ error: 'familyId, date, memberName required' }); return;
    }
    const docId = `${date}_${memberName}`.replace(/[\/\.#$\[\]]/g, '-');
    const ref = db.doc(`churches/${churchCode}/families/${familyId}/prayers/${docId}`);
    const clean = (text || '').toString().trim();
    if (clean) {
      await ref.set({
        date, memberName, text: clean.slice(0, 500),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      await ref.delete().catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) { errRes(res, e); }
});

exports.getPrayers = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const { churchCode, familyId, date } = req.query;
    if (!assertChurchCode(churchCode, res)) return;
    if (!familyId) { res.status(400).json({ error: 'familyId required' }); return; }
    const snap = await db.collection(`churches/${churchCode}/families/${familyId}/prayers`).get();
    const prayers = snap.docs.map(d => {
      const x = d.data();
      return {
        memberName: x.memberName || '',
        text: x.text || '',
        date: x.date || '',
        updatedAt: (x.updatedAt && x.updatedAt.toMillis) ? x.updatedAt.toMillis() : 0,
      };
    }).filter(p => !date || p.date === date);
    res.json({ prayers });
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
    // 교회별 교구/그룹 설정 읽기 (없으면 레거시 1/2/3교구로 동작 — 세광 회귀 보호)
    const cfgSnap = await db.doc(`churches/${churchCode}/config/current`).get();
    const parishConfig = (cfgSnap.exists && cfgSnap.data().parishConfig) || null;
    const groups = (parishConfig && Array.isArray(parishConfig.groups) && parishConfig.groups.length)
      ? parishConfig.groups.map(g => String(g).trim()).filter(Boolean) : null;
    const reg = countParishMembers(families, groups);        // {byParish: 교구별 참가인원, totalMembers}
    const totalMembers = reg.totalMembers;
    const familyToParish = {};
    families.forEach(f => { familyToParish[f.id] = f.parish; });

    // ✅ 4️⃣ 교구별 "진도" 집계 — 완료 = 암송(현재 구절 기록) OR 오늘 기도
    //    ★ 기준 통일: 가족 실천(암송 OR 기도)과 동일 기준으로 교구도 집계.
    //      (이전엔 암송 records 만 봐서, 기도만 한 구성원이 가족 실천엔 잡히나
    //       교구 현황엔 0으로 빠져 두 화면 수치가 어긋났음)
    const records = recordsSnap.docs.map(doc => doc.data());
    // 오늘(KST) 기도한 구성원을 완료 레코드로 합산
    const kstToday = (() => { const k = new Date(Date.now() + 9 * 3600 * 1000); return k.toISOString().slice(0, 10); })();
    const prayerRecords = [];
    await Promise.all(familiesSnap.docs.map(async fdoc => {
      const psnap = await fdoc.ref.collection('prayers').get();
      psnap.docs.forEach(p => {
        const pd = p.data();
        if (pd && pd.date === kstToday && pd.memberName && pd.text && String(pd.text).trim()) {
          prayerRecords.push({
            familyId: fdoc.id,
            memberName: String(pd.memberName).trim(),
            parish: (fdoc.data().parish || '').trim(),
          });
        }
      });
    }));
    const completionRecords = records.concat(prayerRecords);  // 암송 ∪ 기도 (멤버 중복은 집계에서 1명 처리)
    const { byParish, completedMembers } = countCompletedMembersByParish(completionRecords, familyToParish, groups);

    // 완료한 가정 수 (교회 전체/블레싱 현황용) — 암송/기도 둘 다 포함
    const completedFamilies = new Set();
    completionRecords.forEach(r => { if (r.familyId) completedFamilies.add(r.familyId); });
    const completedTotal = completedFamilies.size;  // 완료한 가정 수
    const totalFamilies = familiesSnap.size;        // 등록된 모든 가정 수

    console.log(`\n[PAT-DASHBOARD] ===== 최종 결과 =====`);
    console.log(`  등록 가정: ${totalFamilies}개, 등록 인원: ${totalMembers}명`);
    console.log(`  완료 가정: ${completedTotal}개, 완료 멤버: ${completedMembers}명`);
    console.log(`  교구별 진도(완료 멤버) → ${JSON.stringify(byParish)}\n`);

    res.json({
      total: completedTotal,           // 완료한 가정 수 (교회 전체/블레싱용)
      totalFamilies: totalFamilies,     // 등록된 모든 가정 수
      totalMembers: totalMembers,       // 등록된 전체 인원 수(참고)
      completedMembers: completedMembers, // 완료한 전체 멤버 수
      byParish,                         // 교구별 진도(현재 구절 완료 멤버 수)
      registeredByParish: reg.byParish, // 교구별 참가인원(등록 멤버 헤드카운트)
      parishConfig                       // 교회별 교구/그룹 설정 {term, groups} (없으면 null=레거시)
    });
  } catch (e) { errRes(res, e); }
});

// ── 수행 기록(history) 조회 — 날짜 범위로 records(∪ 기도) 반환 ────────────
//   · 가족 단위: GET ?churchCode&familyId&from&to (familyId 보유 = 가족 본인 인증)
//   · 교회 전체(연말 시상): POST {churchCode,from,to} + 관리자 인증 (familyId 없음)
//   ⚠️ 읽기 전용 — 어떤 데이터도 생성/수정/삭제하지 않는다(시상 근거 보존 보장).
//   ⚠️ records 는 add-only 누적 저장소라, 이 조회는 과거 기록을 그대로 반환한다.
exports.getMissionHistory = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  try {
    const src = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const { churchCode, familyId, from, to } = src;
    if (!assertChurchCode(churchCode, res)) return;
    // familyId 없는 전체 조회는 관리자 전용 (무단 교회 전체 덤프 차단)
    if (!familyId) {
      if (!(await assertChurchAdmin(req, res, churchCode))) return;
    }
    const fromD = from || '0000-01-01';
    const toD = to || '9999-12-31';
    const kstDate = (ts) => {
      try { return new Date(ts.toDate().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
      catch (e) { return ''; }
    };

    // 1) 암송 records (읽기/쓰기 체크 포함)
    let q = db.collection(`churches/${churchCode}/records`);
    if (familyId) q = q.where('familyId', '==', familyId); // 단일 equality(인덱스 불필요)
    const snap = await q.get();
    const items = [];
    snap.docs.forEach(doc => {
      const r = doc.data();
      const date = kstDate(r.createdAt);
      if (!date || date < fromD || date > toD) return;
      items.push({
        date,
        familyId: r.familyId || '',
        memberName: String(r.memberName || '').trim(),
        verseRef: r.verseRef || '',
        mission: 'memorize',
        read: !!(r.voiceScore1 || r.voiceScore2),   // 읽기(음성) 체크
        write: !!(r.typeScore1 || r.typeScore2),     // 쓰기(타이핑) 체크
        completed: true,
        parish: r.parish || '',
        leaderName: r.leaderName || '',
      });
    });

    // 2) 가족 단위 조회 시 기도(prayer)도 완료로 합산 (홈/가족 화면 기준과 통일: 암송 ∪ 기도)
    if (familyId) {
      try {
        const psnap = await db.collection(`churches/${churchCode}/families/${familyId}/prayers`).get();
        psnap.docs.forEach(p => {
          const pd = p.data() || {};
          const date = String(pd.date || '').slice(0, 10);
          if (!date || date < fromD || date > toD) return;
          if (pd.memberName && pd.text && String(pd.text).trim()) {
            items.push({
              date, familyId,
              memberName: String(pd.memberName).trim(),
              verseRef: '', mission: 'prayer',
              read: false, write: false, completed: true,
            });
          }
        });
      } catch (e) { /* prayers 없음/오류는 무시 — records 만으로도 동작 */ }
    }

    res.json({ items, count: items.length });
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
        groupType: d.groupType || '',
        memberCount: names.size, memberNames: Array.from(names),
      };
    }));
    families.sort((a, b) => (a.parish || '').localeCompare(b.parish || '') || (a.roomName || '').localeCompare(b.roomName || ''));
    res.json({ total: families.length, families });
  } catch (e) { errRes(res, e); }
});
