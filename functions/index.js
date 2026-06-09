const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

/** 공통 에러 응답 */
function errRes(res, e, code = 500) {
  console.error('[PAT Functions]', e.message);
  res.status(code).json({ error: e.message || 'Internal server error' });
}

/** churchCode 유효성 검사 (영문/숫자/하이픈 1~30자) */
function validChurchCode(code) {
  return typeof code === 'string' && /^[a-zA-Z0-9_-]{1,30}$/.test(code);
}

// ── 연결 확인 ─────────────────────────────────────────────
exports.ping = onRequest({ cors: true, region: 'us-central1' }, (req, res) => {
  res.json({ status: 'ok', message: 'PAT Bible API 연결 성공', timestamp: new Date().toISOString() });
});

// ── 구절 ──────────────────────────────────────────────────

exports.getVerse = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const { churchCode } = req.query;
    if (!validChurchCode(churchCode)) { res.status(400).json({ error: 'churchCode required' }); return; }
    const snap = await db.collection(`churches/${churchCode}/verses`)
      .orderBy('createdAt', 'desc').limit(1).get();
    if (snap.empty) { res.json({ verse: null }); return; }
    const doc = snap.docs[0];
    res.json({ verse: { id: doc.id, ...doc.data() } });
  } catch (e) { errRes(res, e); }
});

exports.saveVerse = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const { churchCode, ref, text, weekOf } = req.body;
    if (!churchCode || !ref || !text) { res.status(400).json({ error: 'churchCode, ref, text required' }); return; }
    const docRef = await db.collection(`churches/${churchCode}/verses`).add({
      ref, text, weekOf: weekOf || '', createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ id: docRef.id });
  } catch (e) { errRes(res, e); }
});

// ── 가족방 ────────────────────────────────────────────────

exports.saveFamily = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const { churchCode, familyId, ...data } = req.body;
    if (!churchCode) { res.status(400).json({ error: 'churchCode required' }); return; }
    const col = db.collection(`churches/${churchCode}/families`);
    if (familyId) {
      await col.doc(familyId).set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      res.json({ familyId });
    } else {
      const ref = await col.add({ ...data, createdAt: FieldValue.serverTimestamp() });
      res.json({ familyId: ref.id });
    }
  } catch (e) { errRes(res, e); }
});

exports.findFamily = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const { churchCode, familyPassword } = req.query;
    if (!churchCode || !familyPassword) { res.status(400).json({ error: 'churchCode, familyPassword required' }); return; }
    const snap = await db.collection(`churches/${churchCode}/families`)
      .where('familyPassword', '==', familyPassword).limit(1).get();
    if (snap.empty) { res.json({ family: null }); return; }
    const doc = snap.docs[0];
    res.json({ family: { id: doc.id, ...doc.data() } });
  } catch (e) { errRes(res, e); }
});

exports.joinFamily = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const { churchCode, familyId, deviceId, displayName } = req.body;
    if (!churchCode || !familyId || !deviceId) { res.status(400).json({ error: 'churchCode, familyId, deviceId required' }); return; }
    await db.doc(`churches/${churchCode}/families/${familyId}/members/${deviceId}`).set({
      displayName: displayName || '성도', deviceId, joinedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ ok: true });
  } catch (e) { errRes(res, e); }
});

exports.getFamilyProgress = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const { churchCode, familyId, verseRef } = req.query;
    if (!churchCode || !familyId) { res.status(400).json({ error: 'churchCode, familyId required' }); return; }
    const memberSnap = await db.collection(`churches/${churchCode}/families/${familyId}/members`).get();
    const members = memberSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    let doneIds = new Set();
    if (verseRef) {
      const recSnap = await db.collection(`churches/${churchCode}/records`)
        .where('familyId', '==', familyId).where('verseRef', '==', verseRef).get();
      recSnap.docs.forEach(d => doneIds.add(d.data().deviceId));
    }
    res.json({ members: members.map(m => ({ ...m, done: doneIds.has(m.deviceId) })) });
  } catch (e) { errRes(res, e); }
});

// ── 암송 기록 ─────────────────────────────────────────────

exports.saveRecord = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const { churchCode, ...record } = req.body;
    if (!churchCode || !record.verseRef) { res.status(400).json({ error: 'churchCode, verseRef required' }); return; }
    const ref = await db.collection(`churches/${churchCode}/records`).add({
      ...record, createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ id: ref.id });
  } catch (e) { errRes(res, e); }
});

exports.hasRecord = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const { churchCode, verseRef, deviceId } = req.query;
    if (!churchCode || !verseRef || !deviceId) { res.status(400).json({ error: 'churchCode, verseRef, deviceId required' }); return; }
    const snap = await db.collection(`churches/${churchCode}/records`)
      .where('deviceId', '==', deviceId).where('verseRef', '==', verseRef).limit(1).get();
    res.json({ exists: !snap.empty });
  } catch (e) { errRes(res, e); }
});

// ── 대시보드 ──────────────────────────────────────────────

exports.getDashboard = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const { churchCode, verseRef } = req.query;
    if (!churchCode || !verseRef) { res.status(400).json({ error: 'churchCode, verseRef required' }); return; }
    const snap = await db.collection(`churches/${churchCode}/records`)
      .where('verseRef', '==', verseRef).get();
    const byParish = {};
    const seen = new Set();
    snap.docs.forEach(d => {
      const r = d.data();
      const key = r.deviceId + '_' + r.verseRef;
      if (seen.has(key)) return;
      seen.add(key);
      const p = r.parish || '미지정';
      byParish[p] = (byParish[p] || 0) + 1;
    });
    res.json({ total: seen.size, byParish });
  } catch (e) { errRes(res, e); }
});
