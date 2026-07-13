'use strict';

// ============================================================
// PAT Bible — 가족 초대 기반 로그인 (v2) Cloud Functions API
// ------------------------------------------------------------
// createFamily / inviteMembers / acceptInvite / loginWithPhone
// 스키마: SCHEMA.md 참조. 기존 churchCode 시스템과 완전 병렬 운영.
// ============================================================

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const {
  generateInviteCode,
  validInviteCodeFormat,
  generateInviteToken,
  normalizePhone,
  validPhone,
  hashPhone,
  phoneToUserId,
  validName,
  publicFamilyV2,
} = require('./family-v2');

// pepper 주입 함수는 index.js에서 넘겨받는다(중앙화 일관성)
function makeFamilyV2Api(getPepper) {
  const db = getFirestore();

  // CORS/preflight 공통 처리
  function begin(req, res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return false; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return false; }
    return true;
  }
  function errRes(res, e, code = 500) {
    console.error('[PAT v2]', e && e.message);
    res.status(code).json({ error: (e && e.message) || 'Internal server error' });
  }

  // ── 유니크 inviteCode 생성 (충돌 시 재시도) ──────────────
  async function generateUniqueInviteCode(maxTries = 5) {
    for (let i = 0; i < maxTries; i++) {
      const code = generateInviteCode();
      const snap = await db.collection('families').where('inviteCode', '==', code).limit(1).get();
      if (snap.empty) return code;
      console.warn('[PAT v2] inviteCode 충돌, 재시도:', code);
    }
    throw new Error('inviteCode 생성 실패(충돌 과다)');
  }

  // ========================================================
  // 6.1 createFamily — 가족방 생성 (방장)
  // ========================================================
  const createFamily = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
    if (!begin(req, res)) return;
    try {
      const { familyName, creatorName, phoneNumber } = req.body || {};

      // 검증
      if (!validName(familyName, 30)) { res.status(400).json({ error: '가족방 이름을 입력하세요 (1~30자)' }); return; }
      if (!validName(creatorName, 20)) { res.status(400).json({ error: '대표 이름을 입력하세요 (1~20자)' }); return; }
      const phone = normalizePhone(phoneNumber);
      if (!validPhone(phone)) { res.status(400).json({ error: '올바른 휴대폰 번호를 입력하세요' }); return; }

      const pepper = getPepper();
      const userId = phoneToUserId(phone, pepper);
      const phoneHash = hashPhone(phone, pepper);

      // ★ 이미 이 폰번호로 가입된 가족방이 있으면 거부(중복 방장 방지)
      const existingIdx = await db.doc(`phoneIndex/${phoneHash}`).get();
      if (existingIdx.exists) {
        const idxData = existingIdx.data();
        res.status(409).json({
          error: 'ALREADY_JOINED',
          message: '이미 가족방에 소속되어 있습니다. 폰번호로 로그인하세요.',
          familyId: idxData.familyId,
        });
        return;
      }

      const inviteCode = await generateUniqueInviteCode();

      // familyId 사전 확보 (문서 생성 전 id 필요)
      const ref = db.collection('families').doc();
      const familyId = ref.id;

      // 가족방 본체 생성
      await ref.set({
        familyName: String(familyName).trim(),
        creatorUserId: userId,
        creatorName: String(creatorName).trim(),
        inviteCode,
        memberIds: [userId],
        memberCount: 1,
        authVersion: 2,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 방장 멤버 등록
      await ref.collection('members').doc(userId).set({
        userId,
        name: String(creatorName).trim(),
        phoneNumber: phone,
        role: 'creator',
        status: 'active',
        joinedAt: FieldValue.serverTimestamp(),
      });

      // 폰 역인덱스 등록
      await db.doc(`phoneIndex/${phoneHash}`).set({
        userId,
        familyId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log('[PAT v2] 가족방 생성:', familyId, inviteCode);
      res.json({ ok: true, familyId, inviteCode, userId });
    } catch (e) { errRes(res, e); }
  });

  // ========================================================
  // 6.2 inviteMembers — 멤버 초대 (방장)
  // ========================================================
  const inviteMembers = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
    if (!begin(req, res)) return;
    try {
      const { familyId, inviterUserId, phoneNumbers } = req.body || {};
      if (!familyId) { res.status(400).json({ error: 'familyId required' }); return; }
      if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
        res.status(400).json({ error: '초대할 휴대폰 번호를 입력하세요' }); return;
      }

      const famRef = db.doc(`families/${familyId}`);
      const famDoc = await famRef.get();
      if (!famDoc.exists) { res.status(404).json({ error: '가족방을 찾을 수 없습니다' }); return; }

      const fam = famDoc.data();
      // 방장 또는 멤버만 초대 가능
      if (inviterUserId && !(fam.memberIds || []).includes(inviterUserId)) {
        res.status(403).json({ error: '가족 구성원만 초대할 수 있습니다' }); return;
      }

      const pepper = getPepper();
      const invited = [];
      const now = Date.now();
      const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000; // 7일

      for (const raw of phoneNumbers) {
        const phone = normalizePhone(raw);
        if (!validPhone(phone)) continue; // 잘못된 번호는 스킵

        // 이미 이 가족 멤버면 스킵
        const targetUserId = phoneToUserId(phone, pepper);
        if ((fam.memberIds || []).includes(targetUserId)) continue;

        const inviteToken = generateInviteToken();
        const inviteRef = famRef.collection('invites').doc();
        await inviteRef.set({
          phoneNumber: phone,
          inviterUserId: inviterUserId || fam.creatorUserId,
          inviteToken,
          status: 'pending',
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: new Date(now + EXPIRE_MS),
        });
        invited.push({ phoneNumber: phone, inviteToken, inviteId: inviteRef.id });
      }

      console.log('[PAT v2] 초대 생성:', familyId, invited.length, '건');
      res.json({ ok: true, invited });
    } catch (e) { errRes(res, e); }
  });

  // ========================================================
  // 6.3 acceptInvite — 초대 수락 (멤버)
  // ========================================================
  const acceptInvite = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
    if (!begin(req, res)) return;
    try {
      const { familyId, inviteToken, inviteCode, name, phoneNumber } = req.body || {};
      if (!validName(name, 20)) { res.status(400).json({ error: '이름을 입력하세요 (1~20자)' }); return; }
      const phone = normalizePhone(phoneNumber);
      if (!validPhone(phone)) { res.status(400).json({ error: '올바른 휴대폰 번호를 입력하세요' }); return; }

      const pepper = getPepper();
      const userId = phoneToUserId(phone, pepper);
      const phoneHash = hashPhone(phone, pepper);

      // 가족방 찾기: familyId+token 또는 inviteCode
      let famRef, famDoc;
      if (familyId) {
        famRef = db.doc(`families/${familyId}`);
        famDoc = await famRef.get();
      } else if (validInviteCodeFormat(inviteCode)) {
        const snap = await db.collection('families').where('inviteCode', '==', inviteCode).limit(1).get();
        if (!snap.empty) { famRef = snap.docs[0].ref; famDoc = snap.docs[0]; }
      }
      if (!famRef || !famDoc || !famDoc.exists) {
        res.status(404).json({ error: '가족방을 찾을 수 없습니다' }); return;
      }

      const fam = famDoc.data();
      const realFamilyId = famDoc.id;

      // 이미 멤버면 그대로 통과(멱등)
      if ((fam.memberIds || []).includes(userId)) {
        res.json({ ok: true, familyId: realFamilyId, userId, family: publicFamilyV2(realFamilyId, fam), already: true });
        return;
      }

      // 토큰 검증 (familyId 경로일 때만 — inviteCode는 코드 자체가 인증)
      if (familyId && inviteToken) {
        const invSnap = await famRef.collection('invites')
          .where('inviteToken', '==', inviteToken)
          .where('status', '==', 'pending')
          .limit(1).get();
        if (invSnap.empty) { res.status(401).json({ error: '유효하지 않은 초대입니다' }); return; }
        // 초대 상태 → accepted
        await invSnap.docs[0].ref.set({ status: 'accepted', acceptedAt: FieldValue.serverTimestamp() }, { merge: true });
      }

      // 멤버 등록
      await famRef.collection('members').doc(userId).set({
        userId,
        name: String(name).trim(),
        phoneNumber: phone,
        role: 'member',
        status: 'active',
        joinedAt: FieldValue.serverTimestamp(),
      });

      // memberIds/memberCount 갱신
      await famRef.set({
        memberIds: FieldValue.arrayUnion(userId),
        memberCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // 폰 역인덱스 등록
      await db.doc(`phoneIndex/${phoneHash}`).set({
        userId, familyId: realFamilyId, updatedAt: FieldValue.serverTimestamp(),
      });

      const fresh = await famRef.get();
      console.log('[PAT v2] 초대 수락:', realFamilyId, userId);
      res.json({ ok: true, familyId: realFamilyId, userId, family: publicFamilyV2(realFamilyId, fresh.data()) });
    } catch (e) { errRes(res, e); }
  });

  // ========================================================
  // 6.4 loginWithPhone — 폰번호 로그인 (재접속)
  // ========================================================
  const loginWithPhone = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
    if (!begin(req, res)) return;
    try {
      const { phoneNumber } = req.body || {};
      const phone = normalizePhone(phoneNumber);
      if (!validPhone(phone)) { res.status(400).json({ error: '올바른 휴대폰 번호를 입력하세요' }); return; }

      const pepper = getPepper();
      const phoneHash = hashPhone(phone, pepper);

      const idxDoc = await db.doc(`phoneIndex/${phoneHash}`).get();
      if (!idxDoc.exists) {
        res.json({ ok: false, notFound: true, message: '가입된 가족방이 없습니다. 가족방을 만들거나 초대를 받으세요.' });
        return;
      }

      const { userId, familyId } = idxDoc.data();
      const famDoc = await db.doc(`families/${familyId}`).get();
      if (!famDoc.exists) {
        // 인덱스는 있지만 가족방이 삭제됨 → 정리
        res.json({ ok: false, notFound: true, message: '가족방이 존재하지 않습니다.' });
        return;
      }

      console.log('[PAT v2] 폰 로그인:', familyId, userId);
      res.json({ ok: true, familyId, userId, family: publicFamilyV2(familyId, famDoc.data()) });
    } catch (e) { errRes(res, e); }
  });

  return { createFamily, inviteMembers, acceptInvite, loginWithPhone };
}

module.exports = { makeFamilyV2Api };
