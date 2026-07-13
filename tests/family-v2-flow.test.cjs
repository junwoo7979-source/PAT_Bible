'use strict';

// ============================================================
// PAT Bible — 가족 초대 v2 전체 플로우 테스트 (in-memory Firestore 모킹)
// createFamily → inviteMembers → acceptInvite → loginWithPhone
// 실행: node tests/family-v2-flow.test.cjs
// ============================================================

const assert = require('assert/strict');
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
} = require('../functions/family-v2');

const PEPPER = 'test-pepper-flow';
let pass = 0;
function test(name, fn) { fn(); console.log('  ✓', name); pass++; }

// ── in-memory 저장소 (실제 API 로직 미러) ─────────────────
// families/{id} = { ...meta, members: Map, invites: Map }
// phoneIndex/{hash} = { userId, familyId }
function makeStore() {
  return { families: new Map(), phoneIndex: new Map(), _seq: 0 };
}

// createFamily 로직 미러
function createFamily(store, { familyName, creatorName, phoneNumber }) {
  if (!validName(familyName, 30)) return { status: 400, error: '가족방 이름' };
  if (!validName(creatorName, 20)) return { status: 400, error: '대표 이름' };
  const phone = normalizePhone(phoneNumber);
  if (!validPhone(phone)) return { status: 400, error: '폰번호' };

  const userId = phoneToUserId(phone, PEPPER);
  const phoneHash = hashPhone(phone, PEPPER);

  if (store.phoneIndex.has(phoneHash)) {
    return { status: 409, error: 'ALREADY_JOINED', familyId: store.phoneIndex.get(phoneHash).familyId };
  }

  // 유니크 inviteCode
  let inviteCode;
  do { inviteCode = generateInviteCode(); }
  while ([...store.families.values()].some(f => f.inviteCode === inviteCode));

  const familyId = 'fam_' + (++store._seq);
  store.families.set(familyId, {
    familyName: familyName.trim(),
    creatorUserId: userId,
    creatorName: creatorName.trim(),
    inviteCode,
    memberIds: [userId],
    memberCount: 1,
    authVersion: 2,
    members: new Map([[userId, { userId, name: creatorName.trim(), phoneNumber: phone, role: 'creator', status: 'active' }]]),
    invites: new Map(),
  });
  store.phoneIndex.set(phoneHash, { userId, familyId });
  return { status: 200, ok: true, familyId, inviteCode, userId };
}

// inviteMembers 로직 미러
function inviteMembers(store, { familyId, inviterUserId, phoneNumbers }) {
  if (!familyId) return { status: 400 };
  if (!Array.isArray(phoneNumbers) || !phoneNumbers.length) return { status: 400 };
  const fam = store.families.get(familyId);
  if (!fam) return { status: 404 };
  if (inviterUserId && !fam.memberIds.includes(inviterUserId)) return { status: 403 };

  const invited = [];
  for (const raw of phoneNumbers) {
    const phone = normalizePhone(raw);
    if (!validPhone(phone)) continue;
    const targetUserId = phoneToUserId(phone, PEPPER);
    if (fam.memberIds.includes(targetUserId)) continue;
    const inviteToken = generateInviteToken();
    const inviteId = 'inv_' + (++store._seq);
    fam.invites.set(inviteId, { phoneNumber: phone, inviteToken, status: 'pending' });
    invited.push({ phoneNumber: phone, inviteToken, inviteId });
  }
  return { status: 200, ok: true, invited };
}

// acceptInvite 로직 미러
function acceptInvite(store, { familyId, inviteToken, inviteCode, name, phoneNumber }) {
  if (!validName(name, 20)) return { status: 400 };
  const phone = normalizePhone(phoneNumber);
  if (!validPhone(phone)) return { status: 400 };

  const userId = phoneToUserId(phone, PEPPER);
  const phoneHash = hashPhone(phone, PEPPER);

  let fam, realFamilyId;
  if (familyId) { fam = store.families.get(familyId); realFamilyId = familyId; }
  else if (validInviteCodeFormat(inviteCode)) {
    for (const [id, f] of store.families) if (f.inviteCode === inviteCode) { fam = f; realFamilyId = id; break; }
  }
  if (!fam) return { status: 404 };

  if (fam.memberIds.includes(userId)) {
    return { status: 200, ok: true, familyId: realFamilyId, userId, already: true };
  }

  if (familyId && inviteToken) {
    const inv = [...fam.invites.values()].find(i => i.inviteToken === inviteToken && i.status === 'pending');
    if (!inv) return { status: 401, error: '유효하지 않은 초대' };
    inv.status = 'accepted';
  }

  fam.members.set(userId, { userId, name: name.trim(), phoneNumber: phone, role: 'member', status: 'active' });
  fam.memberIds.push(userId);
  fam.memberCount++;
  store.phoneIndex.set(phoneHash, { userId, familyId: realFamilyId });
  return { status: 200, ok: true, familyId: realFamilyId, userId, family: publicFamilyV2(realFamilyId, fam) };
}

// loginWithPhone 로직 미러
function loginWithPhone(store, { phoneNumber }) {
  const phone = normalizePhone(phoneNumber);
  if (!validPhone(phone)) return { status: 400 };
  const phoneHash = hashPhone(phone, PEPPER);
  const idx = store.phoneIndex.get(phoneHash);
  if (!idx) return { status: 200, ok: false, notFound: true };
  const fam = store.families.get(idx.familyId);
  if (!fam) return { status: 200, ok: false, notFound: true };
  return { status: 200, ok: true, familyId: idx.familyId, userId: idx.userId, family: publicFamilyV2(idx.familyId, fam) };
}

// ══════════════════════════════════════════════════════════
// 테스트 시나리오
// ══════════════════════════════════════════════════════════

test('① 방장 가족방 생성 → familyId+inviteCode 발급', () => {
  const store = makeStore();
  const r = createFamily(store, { familyName: '예운이네', creatorName: '권호택', phoneNumber: '010-1111-2222' });
  assert.equal(r.status, 200);
  assert.ok(r.familyId);
  assert.ok(validInviteCodeFormat(r.inviteCode));
  assert.ok(r.userId.startsWith('u_'));
  assert.equal(store.families.get(r.familyId).memberCount, 1);
});

test('② 같은 폰으로 재생성 → 409 ALREADY_JOINED', () => {
  const store = makeStore();
  createFamily(store, { familyName: '가족A', creatorName: '방장', phoneNumber: '01011112222' });
  const r = createFamily(store, { familyName: '가족B', creatorName: '방장', phoneNumber: '010-1111-2222' });
  assert.equal(r.status, 409);
  assert.equal(r.error, 'ALREADY_JOINED');
});

test('③ 방장이 멤버 초대 → 초대토큰 발급', () => {
  const store = makeStore();
  const c = createFamily(store, { familyName: '가족', creatorName: '방장', phoneNumber: '01011112222' });
  const r = inviteMembers(store, { familyId: c.familyId, inviterUserId: c.userId, phoneNumbers: ['010-3333-4444', '010-5555-6666'] });
  assert.equal(r.status, 200);
  assert.equal(r.invited.length, 2);
  assert.ok(r.invited[0].inviteToken);
});

test('④ 초대 수락(토큰) → 멤버 추가 + memberCount 증가', () => {
  const store = makeStore();
  const c = createFamily(store, { familyName: '가족', creatorName: '방장', phoneNumber: '01011112222' });
  const inv = inviteMembers(store, { familyId: c.familyId, inviterUserId: c.userId, phoneNumbers: ['01033334444'] });
  const r = acceptInvite(store, { familyId: c.familyId, inviteToken: inv.invited[0].inviteToken, name: '아내', phoneNumber: '010-3333-4444' });
  assert.equal(r.status, 200);
  assert.ok(r.ok);
  assert.equal(store.families.get(c.familyId).memberCount, 2);
  assert.ok(store.families.get(c.familyId).memberIds.includes(r.userId));
});

test('⑤ 초대 수락(inviteCode) → 토큰 없이 코드로도 가입', () => {
  const store = makeStore();
  const c = createFamily(store, { familyName: '가족', creatorName: '방장', phoneNumber: '01011112222' });
  const r = acceptInvite(store, { inviteCode: c.inviteCode, name: '자녀', phoneNumber: '010-7777-8888' });
  assert.equal(r.status, 200);
  assert.equal(store.families.get(c.familyId).memberCount, 2);
});

test('⑥ 잘못된 토큰 → 401 거부', () => {
  const store = makeStore();
  const c = createFamily(store, { familyName: '가족', creatorName: '방장', phoneNumber: '01011112222' });
  const r = acceptInvite(store, { familyId: c.familyId, inviteToken: 'wrong-token', name: '침입자', phoneNumber: '010-9999-0000' });
  assert.equal(r.status, 401);
});

test('⑦ 폰번호 로그인 → 내 가족방 자동 복귀', () => {
  const store = makeStore();
  const c = createFamily(store, { familyName: '예운이네', creatorName: '권호택', phoneNumber: '010-1111-2222' });
  const r = loginWithPhone(store, { phoneNumber: '01011112222' });
  assert.equal(r.status, 200);
  assert.ok(r.ok);
  assert.equal(r.familyId, c.familyId);
  assert.equal(r.userId, c.userId);
});

test('⑧ 미가입 폰 로그인 → notFound', () => {
  const store = makeStore();
  const r = loginWithPhone(store, { phoneNumber: '010-0000-0000' });
  assert.equal(r.ok, false);
  assert.ok(r.notFound);
});

test('⑨ ★가족방 완전 격리: 가족A 멤버는 가족B에 없음', () => {
  const store = makeStore();
  const a = createFamily(store, { familyName: '가족A', creatorName: '방장A', phoneNumber: '01011112222' });
  const b = createFamily(store, { familyName: '가족B', creatorName: '방장B', phoneNumber: '01033334444' });
  acceptInvite(store, { inviteCode: a.inviteCode, name: 'A멤버', phoneNumber: '01055556666' });

  const famA = store.families.get(a.familyId);
  const famB = store.families.get(b.familyId);
  // 가족A는 2명, 가족B는 1명 (완전 분리)
  assert.equal(famA.memberCount, 2);
  assert.equal(famB.memberCount, 1);
  // 가족A 멤버 userId가 가족B memberIds에 없음
  const aMemberUserId = phoneToUserId('01055556666', PEPPER);
  assert.ok(famA.memberIds.includes(aMemberUserId));
  assert.ok(!famB.memberIds.includes(aMemberUserId));
});

test('⑩ ★inviteCode 격리: 한 코드로는 한 가족방만 접근', () => {
  const store = makeStore();
  const a = createFamily(store, { familyName: '가족A', creatorName: '방장A', phoneNumber: '01011112222' });
  const b = createFamily(store, { familyName: '가족B', creatorName: '방장B', phoneNumber: '01033334444' });
  assert.notEqual(a.inviteCode, b.inviteCode);
  // A 코드로 수락하면 반드시 가족A로만
  const r = acceptInvite(store, { inviteCode: a.inviteCode, name: '멤버', phoneNumber: '01099998888' });
  assert.equal(r.familyId, a.familyId);
  assert.notEqual(r.familyId, b.familyId);
});

test('⑪ 멱등성: 이미 멤버가 재수락 시 중복 추가 안 됨', () => {
  const store = makeStore();
  const c = createFamily(store, { familyName: '가족', creatorName: '방장', phoneNumber: '01011112222' });
  acceptInvite(store, { inviteCode: c.inviteCode, name: '멤버', phoneNumber: '01033334444' });
  const before = store.families.get(c.familyId).memberCount;
  const r = acceptInvite(store, { inviteCode: c.inviteCode, name: '멤버', phoneNumber: '010-3333-4444' });
  assert.ok(r.already);
  assert.equal(store.families.get(c.familyId).memberCount, before); // 증가 안 함
});

test('⑫ 재로그인 일관성: 초대 수락한 멤버도 폰 로그인으로 복귀', () => {
  const store = makeStore();
  const c = createFamily(store, { familyName: '가족', creatorName: '방장', phoneNumber: '01011112222' });
  const a = acceptInvite(store, { inviteCode: c.inviteCode, name: '멤버', phoneNumber: '010-3333-4444' });
  const login = loginWithPhone(store, { phoneNumber: '01033334444' });
  assert.equal(login.familyId, c.familyId);
  assert.equal(login.userId, a.userId);
});

console.log(`\n✅ family-v2 전체 플로우 테스트 통과 (${pass}/${pass})`);
