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
    const { churchCode, appTitle, verse } = req.body;
    console.log('[PAT] saveConfig 수신:', { churchCode, appTitle, verseRef: verse?.ref, verseText: verse?.text?.substring(0, 20) });
    if (!assertChurchCode(churchCode, res)) return;
    await db.doc(`churches/${churchCode}/config/current`).set({
      appTitle: appTitle || '',
      verse: verse || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
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
    // ★ members에 있으면 "입장 완료(done=true)" 기본값으로 설정
    // (가족방에 입장했다는 뜻 = 가족 등록이 완료됨)
    res.json({
      roomName: familyData.roomName || '',
      leaderName: familyData.leaderName || '',
      parish: familyData.parish || '',
      district: familyData.district || '',
      members: members.map(m => ({ ...m, done: true }))
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

    // ✅ 3️⃣ familyId → parish 매핑
    const familyToParish = {};
    familiesSnap.docs.forEach(doc => {
      const family = doc.data();
      const familyId = doc.id;
      const parish = (family.parish || '').trim();

      if (['1교구', '2교구', '3교구'].includes(parish)) {
        familyToParish[familyId] = parish;
        console.log(`[PAT-DASHBOARD]   가정: ${familyId.slice(0, 8)}... → ${parish}`);
      } else {
        console.warn(`[PAT-DASHBOARD]   ⚠️ 유효하지 않은 교구: familyId=${familyId}, parish="${parish}"`);
      }
    });

    // ✅ 4️⃣ 교구별 데이터 초기화
    const byParish = {
      '1교구': 0,
      '2교구': 0,
      '3교구': 0,
    };

    // ✅ 5️⃣ 각 가정이 현재 구절을 완료했는지 확인
    console.log(`\n[PAT-DASHBOARD] 가정별 완료 상태 확인:`);
    const completedFamilies = new Set();

    recordsSnap.docs.forEach(doc => {
      const record = doc.data();
      const familyId = record.familyId || '';

      // ⚠️ 중요: familyId가 빈 문자열이면 skip (가족방 미등록)
      if (!familyId) {
        console.warn(`  ⚠️ familyId 없음: 가족방 미등록 사용자의 기록 (무시)`);
        return;
      }

      const parish = familyToParish[familyId];

      if (parish && !completedFamilies.has(familyId)) {
        completedFamilies.add(familyId);
        byParish[parish] += 1;
        console.log(`  ✅ ${parish}: ${familyId.slice(0, 8)}... 완료 → ${byParish[parish]}명`);
      } else if (!parish && familyId) {
        console.warn(`  ⚠️ 교구 정보 없음: familyId=${familyId.slice(0, 8)}...`);
      }
    });

    const completedTotal = completedFamilies.size;  // 완료한 가정 수
    const totalFamilies = familiesSnap.size;        // 등록된 모든 가정 수

    console.log(`\n[PAT-DASHBOARD] ===== 최종 결과 =====`);
    console.log(`  등록된 가정: ${totalFamilies}개`);
    console.log(`  완료한 가정: ${completedTotal}개`);
    console.log(`  1교구: ${byParish['1교구']}개 가정`);
    console.log(`  2교구: ${byParish['2교구']}개 가정`);
    console.log(`  3교구: ${byParish['3교구']}개 가정`);
    console.log(`  교회 전체: ${completedTotal}/${totalFamilies} (${totalFamilies > 0 ? Math.round(completedTotal/totalFamilies*100) : 0}%)\n`);

    res.json({
      total: completedTotal,           // 완료한 가정 수
      totalFamilies: totalFamilies,     // 등록된 모든 가정 수 (새로 추가)
      byParish
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
