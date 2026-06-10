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
  });
}

exports.ping = onRequest({ cors: true, region: 'us-central1' }, (req, res) => {
  if (!begin(req, res)) return;
  res.json({ status: 'ok', message: 'PAT Bible API connected', timestamp: new Date().toISOString() });
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
  if (!requireAdminWrite(req, res)) return;
  try {
    const { churchCode, ref, text, weekOf } = req.body;
    if (!assertChurchCode(churchCode, res)) return;
    if (!ref || !text) { res.status(400).json({ error: 'ref, text required' }); return; }
    const docRef = await db.collection(`churches/${churchCode}/verses`).add({
      ref, text, weekOf: weekOf || '', createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ id: docRef.id });
  } catch (e) { errRes(res, e); }
});

exports.saveFamily = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  if (!requireClientWrite(req, res)) return;
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
  return publicFamily(doc.id, doc.data());
}

exports.findFamily = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
  if (!requireClientWrite(req, res)) return;
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
  if (!requireClientWrite(req, res)) return;
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
    const memberSnap = await db.collection(`churches/${churchCode}/families/${familyId}/members`).get();
    const members = memberSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const doneIds = new Set();
    if (verseRef) {
      const recSnap = await db.collection(`churches/${churchCode}/records`)
        .where('familyId', '==', familyId).where('verseRef', '==', verseRef).get();
      recSnap.docs.forEach(d => doneIds.add(d.data().deviceId));
    }
    res.json({ members: members.map(m => ({ ...m, done: doneIds.has(m.deviceId) })) });
  } catch (e) { errRes(res, e); }
});

exports.saveRecord = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (!begin(req, res)) return;
  if (!requireClientWrite(req, res)) return;
  try {
    const { churchCode, verseRef, deviceId, familyId, parish, district,
            leaderName, voiceScore1, voiceScore2, typeScore1, typeScore2, badge } = req.body;
    if (!assertChurchCode(churchCode, res)) return;
    if (!verseRef) { res.status(400).json({ error: 'verseRef required' }); return; }
    const ref = await db.collection(`churches/${churchCode}/records`).add({
      verseRef, deviceId, familyId, parish, district,
      leaderName, voiceScore1, voiceScore2, typeScore1, typeScore2, badge,
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
    const snap = await db.collection(`churches/${churchCode}/records`)
      .where('verseRef', '==', verseRef).get();
    const byParish = {};
    const seen = new Set();
    snap.docs.forEach(d => {
      const r = d.data();
      const key = r.deviceId + '_' + r.verseRef;
      if (seen.has(key)) return;
      seen.add(key);
      const p = r.parish || 'unknown';
      byParish[p] = (byParish[p] || 0) + 1;
    });
    res.json({ total: seen.size, byParish });
  } catch (e) { errRes(res, e); }
});
