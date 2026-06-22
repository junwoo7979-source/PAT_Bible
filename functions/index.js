const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { applyCors, assertChurchCode, assertToken } = require('./security');
const {
  hashFamilyPassword,
  verifyFamilyPassword,
  sanitizeFamilyDataForSave,
  publicFamily,
} = require('./password');

initializeApp();
const db = getFirestore();

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

// 교구별 집계 — 별도 모듈(테스트 가능)
const { countParishMembers, countCompletedMembersByParish } = require('./aggregate');

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
  if (!requireAdminWrite(req, res)) {
    console.error('[PAT] Admin 토큰 검증 실패');
    return;
  }
  try {
    const { churchCode, appTitle, verse, parishTotals } = req.body;
    console.log('[PAT] saveConfig 수신:', { churchCode, appTitle, verseRef: verse?.ref, parishTotals });
    if (!assertChurchCode(churchCode, res)) return;
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
  if (!requireAdminWrite(req, res)) {
    console.error('[PAT] Admin 토큰 검증 실패');
    return;
  }
  try {
    const { churchCode, ref, text, weekOf } = req.body;
    console.log('[PAT] saveVerse 파라미터:', { churchCode, ref });
    if (!assertChurchCode(churchCode, res)) {
      console.error('[PAT] churchCode 검증 실패:', churchCode);
      return;
    }
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
      const ref = await col.add({ ...familyData, createdAt: FieldValue.serverTimestamp() });
      res.json({ familyId: ref.id });
    }
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
    const { totalMembers } = countParishMembers(families);   // 등록 전체 인원(참고용)
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
      byParish                          // 교구별 진도(현재 구절 완료 멤버 수)
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
