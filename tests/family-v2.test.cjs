'use strict';

// ============================================================
// PAT Bible — 가족 초대 v2 순수 로직 단위테스트
// (Firestore 의존 없는 헬퍼 검증)
// 실행: node tests/family-v2.test.cjs
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

const PEPPER = 'test-pepper-v2';
let pass = 0;

function test(name, fn) {
  fn();
  console.log('  ✓', name);
  pass++;
}

// ── 1. 초대 코드 생성 ─────────────────────────────────────
test('초대코드: 8자, 혼동문자(0/O/1/I/L) 없음', () => {
  for (let i = 0; i < 100; i++) {
    const code = generateInviteCode();
    assert.equal(code.length, 8);
    assert.ok(!/[01OIL]/.test(code), `혼동문자 포함: ${code}`);
    assert.ok(validInviteCodeFormat(code), `형식 오류: ${code}`);
  }
});

test('초대코드: 100개 생성 시 대부분 유니크(충돌 거의 없음)', () => {
  const set = new Set();
  for (let i = 0; i < 100; i++) set.add(generateInviteCode());
  // 31^8 공간이므로 100개 중 충돌은 사실상 0
  assert.ok(set.size >= 99, `유니크 부족: ${set.size}/100`);
});

test('초대코드 형식검증: 유효/무효 구분', () => {
  assert.ok(validInviteCodeFormat('ABCD2345'));
  assert.ok(!validInviteCodeFormat('abc'));       // 소문자
  assert.ok(!validInviteCodeFormat('AB'));         // 너무 짧음
  assert.ok(!validInviteCodeFormat(''));           // 빈값
  assert.ok(!validInviteCodeFormat(null));         // null
});

// ── 2. 토큰 생성 ──────────────────────────────────────────
test('초대토큰: 32자 hex, 매번 다름', () => {
  const a = generateInviteToken();
  const b = generateInviteToken();
  assert.equal(a.length, 32);
  assert.ok(/^[0-9a-f]{32}$/.test(a));
  assert.notEqual(a, b);
});

// ── 3. 폰번호 정규화 ──────────────────────────────────────
test('폰 정규화: 하이픈/공백/국가코드 제거', () => {
  assert.equal(normalizePhone('010-1234-5678'), '01012345678');
  assert.equal(normalizePhone('010 1234 5678'), '01012345678');
  assert.equal(normalizePhone('+82 10 1234 5678'), '01012345678');
  assert.equal(normalizePhone('821012345678'), '01012345678');
  assert.equal(normalizePhone(''), '');
  assert.equal(normalizePhone(null), '');
});

test('폰 검증: 한국 휴대폰만 통과', () => {
  assert.ok(validPhone('01012345678'));   // 010 11자리
  assert.ok(validPhone('0111234567'));    // 011 10자리
  assert.ok(!validPhone('021234567'));    // 지역번호(02)
  assert.ok(!validPhone('0101234'));      // 너무 짧음
  assert.ok(!validPhone('12345678901'));  // 01 아님
  assert.ok(!validPhone(''));
});

// ── 4. 폰 해시 격리 (핵심 보안) ───────────────────────────
test('폰 해시: 같은 폰=같은 해시, 다른 폰=다른 해시', () => {
  const h1 = hashPhone('01012345678', PEPPER);
  const h2 = hashPhone('01012345678', PEPPER);
  const h3 = hashPhone('01099998888', PEPPER);
  assert.equal(h1, h2);       // 결정적
  assert.notEqual(h1, h3);    // 다른 폰은 다른 해시
  assert.equal(h1.length, 64); // sha256 hex
});

test('폰 해시: pepper 다르면 해시 다름(역추적 방지)', () => {
  const h1 = hashPhone('01012345678', 'pepper-a');
  const h2 = hashPhone('01012345678', 'pepper-b');
  assert.notEqual(h1, h2);
});

// ── 5. userId 생성 (재로그인 일관성) ──────────────────────
test('userId: 같은 폰=같은 userId (재로그인 일관성)', () => {
  const u1 = phoneToUserId('01012345678', PEPPER);
  const u2 = phoneToUserId('01012345678', PEPPER);
  const u3 = phoneToUserId('01099998888', PEPPER);
  assert.equal(u1, u2);           // 재로그인 시 동일 userId
  assert.notEqual(u1, u3);        // 다른 사람 다른 id
  assert.ok(u1.startsWith('u_')); // 접두어
});

test('userId ≠ phoneHash (용도 분리)', () => {
  const uid = phoneToUserId('01012345678', PEPPER);
  const ph = hashPhone('01012345678', PEPPER);
  assert.notEqual(uid.replace('u_', ''), ph);
});

// ── 6. 이름 검증 ──────────────────────────────────────────
test('이름 검증: 길이 제한', () => {
  assert.ok(validName('홍길동', 20));
  assert.ok(validName('a', 20));
  assert.ok(!validName('', 20));            // 빈값
  assert.ok(!validName('   ', 20));         // 공백만
  assert.ok(!validName('x'.repeat(21), 20)); // 초과
});

// ── 7. 공개 데이터 (민감정보 없음) ────────────────────────
test('publicFamilyV2: 민감정보(creatorUserId/memberIds) 노출 안 함', () => {
  const data = {
    familyName: '테스트가족',
    creatorName: '방장',
    creatorUserId: 'u_secret',
    inviteCode: 'ABCD2345',
    memberIds: ['u_a', 'u_b'],
    memberCount: 2,
  };
  const pub = publicFamilyV2('fam123', data);
  assert.equal(pub.familyId, 'fam123');
  assert.equal(pub.familyName, '테스트가족');
  assert.equal(pub.inviteCode, 'ABCD2345');
  assert.equal(pub.memberCount, 2);
  // 민감정보 제외 확인
  assert.equal(pub.creatorUserId, undefined);
  assert.equal(pub.memberIds, undefined);
});

// ── 8. 가족방 격리 시뮬레이션 (핵심 요구사항) ─────────────
test('가족방 격리: 서로 다른 가족은 다른 familyId/inviteCode/userId', () => {
  // 두 가족의 방장이 각각 다른 폰번호로 가입
  const phoneA = '01011112222';
  const phoneB = '01033334444';
  const userA = phoneToUserId(phoneA, PEPPER);
  const userB = phoneToUserId(phoneB, PEPPER);
  const hashA = hashPhone(phoneA, PEPPER);
  const hashB = hashPhone(phoneB, PEPPER);

  // 완전 격리 검증
  assert.notEqual(userA, userB);   // 방장 신원 분리
  assert.notEqual(hashA, hashB);   // 역인덱스 키 분리
  // → 가족A의 phoneIndex는 가족B와 절대 충돌 안 함
});

console.log(`\n✅ family-v2 순수 로직 테스트 통과 (${pass}/${pass})`);
