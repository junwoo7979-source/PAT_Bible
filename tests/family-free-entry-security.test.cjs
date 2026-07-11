'use strict';
// ★ 2026-07-11: 자유입장 가족방(교회코드 불필요) — 핵심 보안 불변식 검증
//   신규 시스템의 비밀번호 해시는 familyId를 HMAC 메시지에 포함해 생성한다.
//   → 가족방마다 완전히 독립된 해시가 생성되어, 코드 레벨에서 구조적으로
//     "A 가족방 비밀번호로 B 가족방에 들어가는" 시나리오 자체가 불가능함을 증명한다.
//   (functions/index.js의 createFamily/findFamilyByCode/loginFamily/changeFamilyPasswordV2는
//    이 password.js 유틸을 familyId 기준으로 호출한다 — 실제 Cloud Function 코드와 동일한 방식)

const assert = require('node:assert/strict');
const {
  hashFamilyPassword,
  verifyFamilyPassword,
  publicFamily,
} = require('../functions/password');

const PEPPER = 'test-pepper-2026';

// ── 가짜 Firestore(자유입장 families 컬렉션) — in-memory Map ─────
// createFamily/findFamilyByCode/loginFamily/changeFamilyPasswordV2 의 핵심 로직을
// 그대로 재현해 실제 Cloud Function과 동일한 분기를 검증한다(라이브 배포 없이).
const db = new Map(); // familyId -> { familyCode, roomName, leaderName, members, familyPasswordHash }
let _idSeq = 0;
const FAMILY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function fakeGenerateFamilyCode(seed) {
  // 테스트용 결정적 코드 생성(실제는 crypto.randomBytes 사용)
  let code = '';
  for (let i = 0; i < 8; i++) code += FAMILY_CODE_ALPHABET[(seed + i * 7) % FAMILY_CODE_ALPHABET.length];
  return code;
}

function createFamily(familyName, password, leaderName, codeSeed) {
  const roomName = String(familyName || '').trim();
  const leader = String(leaderName || '').trim();
  const pw = String(password || '');
  if (!roomName) return { ok: false, error: '가족방 이름을 입력하세요' };
  if (!leader) return { ok: false, error: '이름을 입력하세요' };
  if (pw.length < 4) return { ok: false, error: '비밀번호는 4자 이상이어야 합니다' };

  // familyCode 중복 검사(실제 코드의 재시도 루프와 동일한 개념)
  let familyCode = fakeGenerateFamilyCode(codeSeed);
  let tries = 0;
  while ([...db.values()].some(f => f.familyCode === familyCode) && tries < 5) {
    familyCode = fakeGenerateFamilyCode(codeSeed + (++tries) * 100);
  }

  const familyId = 'fam_' + (++_idSeq);
  const passwordHash = hashFamilyPassword(familyId, pw, PEPPER); // ★ familyId 기준 해시
  db.set(familyId, {
    familyCode, roomName, leaderName: leader,
    members: [leader], familyPasswordHash: passwordHash,
  });
  return { ok: true, familyId, familyCode, roomName, leaderName: leader };
}

function findFamilyByCode(familyCode) {
  const code = String(familyCode || '').trim().toUpperCase();
  for (const [familyId, data] of db.entries()) {
    if (data.familyCode === code) return { found: true, familyId, roomName: data.roomName };
  }
  return { found: false, error: '가족방을 찾을 수 없습니다. 코드를 다시 확인해주세요' };
}

function loginFamily(familyId, password) {
  const data = db.get(familyId);
  if (!data) return { ok: false, error: '가족방을 찾을 수 없습니다' };
  if (!verifyFamilyPassword(familyId, String(password || ''), data.familyPasswordHash, PEPPER)) {
    return { ok: false, error: '비밀번호가 일치하지 않습니다' };
  }
  return { ok: true, family: publicFamily(familyId, data) };
}

function changeFamilyPasswordV2(familyId, oldPassword, newPassword) {
  const data = db.get(familyId);
  if (!data) return { ok: false, error: '가족방을 찾을 수 없습니다' };
  if (String(newPassword || '').length < 4) return { ok: false, error: '새 비밀번호는 4자 이상이어야 합니다' };
  if (!verifyFamilyPassword(familyId, String(oldPassword || ''), data.familyPasswordHash, PEPPER)) {
    return { ok: false, error: '현재 비밀번호가 일치하지 않습니다' };
  }
  data.familyPasswordHash = hashFamilyPassword(familyId, String(newPassword), PEPPER);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// 테스트 1: 가족방 생성 시 familyCode가 생성되고, 서로 다른 가족방은
//           절대 같은 familyCode를 갖지 않는다.
// ════════════════════════════════════════════════════════════════
(function testFamilyCodeUniqueness(){
  const a = createFamily('김민수네 가족', '1234', '김민수', 1);
  const b = createFamily('박지현네 가족', '5678', '박지현', 2);
  const c = createFamily('이수정네 가족', '9999', '이수정', 3);

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(c.ok, true);
  assert.ok(a.familyCode && a.familyCode.length >= 4);
  assert.ok(b.familyCode && b.familyCode.length >= 4);
  assert.notEqual(a.familyCode, b.familyCode, 'A/B familyCode가 겹치면 안 됨');
  assert.notEqual(a.familyCode, c.familyCode, 'A/C familyCode가 겹치면 안 됨');
  assert.notEqual(b.familyCode, c.familyCode, 'B/C familyCode가 겹치면 안 됨');
  assert.notEqual(a.familyId, b.familyId, 'familyId도 서로 달라야 함');
  console.log('  ✓ 가족방 생성 시 familyCode 자동 생성 + 서로 다른 방끼리 중복 없음');

  global.__ROOM_A = a; global.__ROOM_B = b; global.__ROOM_C = c;
})();

// ════════════════════════════════════════════════════════════════
// 테스트 2: 가족비밀번호는 familyId별로 완전히 분리 저장된다
//           (같은 평문 비번이라도 다른 가족방이면 해시가 다르다)
// ════════════════════════════════════════════════════════════════
(function testPasswordHashIsolatedByFamilyId(){
  const same1 = createFamily('같은비번1', 'sameSecret1', '대표1', 10);
  const same2 = createFamily('같은비번2', 'sameSecret1', '대표2', 20); // ★ 동일한 평문 비번
  assert.equal(same1.ok, true);
  assert.equal(same2.ok, true);

  const hash1 = db.get(same1.familyId).familyPasswordHash;
  const hash2 = db.get(same2.familyId).familyPasswordHash;
  assert.notEqual(hash1, hash2, '같은 비번이어도 familyId가 다르면 해시가 달라야 함(HMAC이 familyId를 포함하므로)');
  console.log('  ✓ 동일한 평문 비밀번호라도 familyId가 다르면 저장 해시가 서로 다름 (완전 분리)');
})();

// ════════════════════════════════════════════════════════════════
// 테스트 3(필수): A 가족방 비밀번호로 B 가족방에 들어갈 수 없다
// ════════════════════════════════════════════════════════════════
(function testCrossFamilyPasswordFails(){
  const A = global.__ROOM_A, B = global.__ROOM_B;

  // A 비번(1234)으로 B(familyId=B.familyId)에 로그인 시도 → 실패해야 함
  const crossResult = loginFamily(B.familyId, '1234');
  assert.equal(crossResult.ok, false, 'A 비번으로 B 방에 로그인 → 반드시 실패');
  assert.match(crossResult.error, /비밀번호가 일치하지 않습니다/);

  // 반대 방향도 확인: B 비번(5678)으로 A에 로그인 시도 → 실패
  const crossResult2 = loginFamily(A.familyId, '5678');
  assert.equal(crossResult2.ok, false, 'B 비번으로 A 방에 로그인 → 반드시 실패');

  // 각자 자기 비번으로는 성공
  assert.equal(loginFamily(A.familyId, '1234').ok, true, 'A는 자기 비번으로 성공해야 함');
  assert.equal(loginFamily(B.familyId, '5678').ok, true, 'B는 자기 비번으로 성공해야 함');
  console.log('  ✓ A 가족방 비밀번호로 B 가족방 로그인 불가 (familyId 기준 정확히 분리)');
})();

// ════════════════════════════════════════════════════════════════
// 테스트 4(필수): 가족코드만으로는 활동 화면(가족 정보)에 접근할 수 없다
//           — findFamilyByCode는 familyId/roomName만 반환, 민감정보(해시/구성원) 없음
// ════════════════════════════════════════════════════════════════
(function testFamilyCodeAloneCannotEnter(){
  const A = global.__ROOM_A;
  const lookup = findFamilyByCode(A.familyCode);
  assert.equal(lookup.found, true);
  assert.equal(lookup.familyId, A.familyId);
  // ★ familyPasswordHash, members 등 민감 정보는 반환되지 않아야 함
  assert.equal(lookup.familyPasswordHash, undefined, '가족코드 조회 결과에 비밀번호 해시가 있으면 안 됨');
  assert.equal(lookup.members, undefined, '가족코드 조회 결과에 구성원 명단이 있으면 안 됨');

  // 존재하지 않는 코드
  const notFound = findFamilyByCode('ZZZZZZZZ');
  assert.equal(notFound.found, false);
  assert.match(notFound.error, /찾을 수 없습니다/);
  console.log('  ✓ 가족코드만으로는 민감정보(비밀번호 해시/구성원) 접근 불가 — 비밀번호 검증 필수');
})();

// ════════════════════════════════════════════════════════════════
// 테스트 5(필수): 가족비밀번호 변경 시 해당 familyId만 바뀌고
//           다른 가족방은 전혀 영향받지 않는다
// ════════════════════════════════════════════════════════════════
(function testPasswordChangeIsolated(){
  const A = global.__ROOM_A, B = global.__ROOM_B;
  const bHashBefore = db.get(B.familyId).familyPasswordHash;

  // A 비밀번호 변경(1234 → newpass9999)
  const changeResult = changeFamilyPasswordV2(A.familyId, '1234', 'newpass9999');
  assert.equal(changeResult.ok, true, 'A 비밀번호 변경 성공해야 함');

  // A: 새 비번으로 로그인 성공, 옛 비번으로는 실패
  assert.equal(loginFamily(A.familyId, 'newpass9999').ok, true, 'A 새 비번으로 로그인 성공');
  assert.equal(loginFamily(A.familyId, '1234').ok, false, 'A 옛 비번으로는 로그인 실패해야 함');

  // B: 전혀 영향받지 않음 (해시 그대로, 기존 비번 그대로 로그인 가능)
  const bHashAfter = db.get(B.familyId).familyPasswordHash;
  assert.equal(bHashAfter, bHashBefore, 'B 가족방 해시는 A 비번 변경과 무관하게 그대로여야 함');
  assert.equal(loginFamily(B.familyId, '5678').ok, true, 'B는 여전히 기존 비번으로 로그인 가능해야 함');

  // 현재 비밀번호가 틀리면 변경 자체가 거부됨(탈취된 세션 남용 방지)
  const wrongOldResult = changeFamilyPasswordV2(B.familyId, 'wrong-old-pw', 'irrelevant999');
  assert.equal(wrongOldResult.ok, false, '현재 비번이 틀리면 변경 거부되어야 함');
  console.log('  ✓ 비밀번호 변경은 해당 familyId만 영향 — 다른 가족방은 완전히 보존됨');
})();

// ════════════════════════════════════════════════════════════════
// 테스트 6: 잘못된 입력에 대한 안전한 오류 처리
// ════════════════════════════════════════════════════════════════
(function testInputValidation(){
  assert.equal(createFamily('', '1234', '대표', 99).ok, false, '이름 없으면 실패');
  assert.equal(createFamily('방이름', '123', '대표', 99).ok, false, '비번 4자 미만이면 실패'); // 3자
  assert.equal(createFamily('방이름', '1234', '', 99).ok, false, '대표자 이름 없으면 실패');
  assert.equal(loginFamily('존재하지않는ID', '아무거나').ok, false, '존재하지 않는 familyId → 실패');
  console.log('  ✓ 잘못된 입력(빈 값/짧은 비번/존재하지 않는 방) 안전하게 거부됨');
})();

console.log('\n✅ family-free-entry-security: 모든 테스트 통과 (6/6)');
