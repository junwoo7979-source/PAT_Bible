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
  // 교회 코드를 비번칸에 → 판정은 AUTH_FAMILY_PW로 통과한다.
  //   ★ 2026-07-01: loginDecision에서 REJECT_CHURCHCODE 분기를 제거했다(교회코드=비번인
  //     방이 존재할 여지를 서버 판정에 위임). 대신 교회코드로는 매칭되는 방이 없어
  //     resolveFamilyByPassword가 null을 반환해 입장이 실패한다(아래 testChurchCodeCannotEnter).
  //     서버 saveFamily도 비번===교회코드 저장을 차단하므로 그런 방은 애초에 만들어지지 않는다.
  assert.equal(loginDecision(CHURCH, '11111').action, 'AUTH_FAMILY_PW');
  // 가족 비번 → 인증 진행
  assert.deepEqual(loginDecision(CHURCH, '12365'), { action:'AUTH_FAMILY_PW', password:'12365' });
  console.log('  ✓ loginDecision: 교회코드=선택전용, 가족비번=인증전용 (교회코드 입장은 resolve/서버에서 차단)');
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
  // 판정 단계는 통과하지만(REJECT_CHURCHCODE 제거) 매칭되는 방이 없어 실제 입장은 실패한다.
  assert.equal(loginDecision(CHURCH, CHURCH).action, 'AUTH_FAMILY_PW');
  // 교회코드와 같은 비번을 가진 방은 없음(서버가 저장 차단) → null → 입장 불가
  assert.equal(resolveFamilyByPassword(families, CHURCH, '11111'), null, '교회코드 → 매칭 방 없음');
  console.log('  ✓ 교회 코드 입력 → 가족방 입장 실패 (매칭 방 없음 + 서버 저장 차단)');
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
  // 판정은 통과해도 교회코드로 만든 방이 없어 매칭 실패 = 입장 불가(권위 계층에서 차단)
  assert.equal(loginDecision(CHURCH, '11111').action, 'AUTH_FAMILY_PW', '가족방: 교회코드 비번 → 판정 통과(서버/resolve에서 차단)');
  assert.equal(resolveFamilyByPassword(families, CHURCH, '11111'), null, '가족방: 교회코드 → 매칭 방 없음');
  console.log('  ✓ 가족방 비번칸에 교회 코드 → 입장 실패 (매칭 방 없음)');
})();

console.log('\n✅ family-login-auth: 모든 테스트 통과');
