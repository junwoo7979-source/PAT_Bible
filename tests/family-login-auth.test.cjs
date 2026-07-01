'use strict';
// 가족방/구역 로그인 인증 — 교회코드는 식별용, 가족비번만 인증 수단.
// 요구된 필수 테스트 케이스를 그대로 검증한다.

const assert = require('node:assert/strict');
const { loginDecision, resolveFamilyByPassword } = require('../app/js/login-auth.js');

const CHURCH = '11111';
// 테스트용 가정 (요구사항의 비밀번호)
const families = [
  { id: 'A', churchCode: CHURCH, familyPassword: '12365'  },
  { id: 'B', churchCode: CHURCH, familyPassword: '54789'  },
  { id: 'C', churchCode: CHURCH, familyPassword: '213256' },
];

// ── loginDecision: 판정 규칙 ─────────────────────────────────
(function testDecision(){
  // 교회 미선택
  assert.equal(loginDecision('', '').action, 'NEED_CHURCH_CODE');
  assert.deepEqual(loginDecision('', '11111'), { action:'SELECT_CHURCH', code:'11111' });
  // 교회 선택됨
  assert.equal(loginDecision(CHURCH, '').action, 'NEED_FAMILY_PW');
  // 교회 코드를 비번칸에 → 거부 (교회코드로는 입장 불가)
  assert.equal(loginDecision(CHURCH, '11111').action, 'REJECT_CHURCHCODE');
  // 가족 비번 → 인증 진행
  assert.deepEqual(loginDecision(CHURCH, '12365'), { action:'AUTH_FAMILY_PW', password:'12365' });
  console.log('  ✓ loginDecision: 교회코드=선택전용, 가족비번=인증전용, 교회코드 입장 차단');
})();

// ── 필수 테스트: 각 가정 비번 → 해당 가정 입장 성공 ──────────────
(function testEachFamilyPasswordEnters(){
  assert.equal(resolveFamilyByPassword(families, CHURCH, '12365')?.id,  'A', 'A 12365 → A 성공');
  assert.equal(resolveFamilyByPassword(families, CHURCH, '54789')?.id,  'B', 'B 54789 → B 성공');
  assert.equal(resolveFamilyByPassword(families, CHURCH, '213256')?.id, 'C', 'C 213256 → C 성공');
  console.log('  ✓ A/B/C 각 가정 비밀번호 → 해당 가정 입장 성공');
})();

// ── 필수 테스트: 교회 코드로는 가족방 입장 실패 ─────────────────
(function testChurchCodeCannotEnter(){
  // 판정 단계에서 이미 거부
  assert.equal(loginDecision(CHURCH, CHURCH).action, 'REJECT_CHURCHCODE');
  // 설령 검증까지 가더라도 교회코드와 같은 비번을 가진 방은 없음 → null
  assert.equal(resolveFamilyByPassword(families, CHURCH, '11111'), null, '교회코드 → 매칭 방 없음');
  console.log('  ✓ 교회 코드 입력 → 가족방 입장 실패 (2중 차단)');
})();

// ── 필수 테스트: A 가정에서 B 가정 비번 입력 → 입장 실패 ───────────
(function testOtherFamilyPasswordFails(){
  // A 기기(myFamilyId='A')가 B 비번 입력 → 내 가족 스코프라 실패
  assert.equal(resolveFamilyByPassword(families, CHURCH, '54789', 'A'), null, 'A에서 B비번 → 실패');
  // 반대로 A 기기가 A 비번 → 성공
  assert.equal(resolveFamilyByPassword(families, CHURCH, '12365', 'A')?.id, 'A', 'A에서 A비번 → 성공');
  console.log('  ✓ A 가정에서 B 가정 비밀번호 → 입장 실패 (pat_family_id 스코프)');
})();

// ── 필수 테스트: 비번칸에 교회코드 입력 → 실패 (가족/구역 공통) ─────
(function testChurchCodeInPasswordField(){
  assert.equal(loginDecision(CHURCH, '11111').action, 'REJECT_CHURCHCODE', '가족방: 교회코드 비번 → 거부');
  // 구역 로그인(joinAnotherRoom)도 findFamilyByPasswordGlobal(비번) 검색이라
  // 교회코드로 만든 방이 없으므로 매칭 실패 = 입장 불가
  assert.equal(resolveFamilyByPassword(families, CHURCH, '11111'), null, '구역: 교회코드 → 매칭 방 없음');
  console.log('  ✓ 가족/구역 비번칸에 교회 코드 → 입장 실패');
})();

console.log('\n✅ family-login-auth: 모든 테스트 통과');
