// ====== PAT Bible — admin-password.test.cjs ======
// 최초 관리자(admin/1234) 서버 이관 + 비밀번호 변경 회귀 테스트 (2026-07-18)
//  핵심: 하드코딩 자격증명이 클라이언트에 남아 있으면, 비밀번호를 변경해도
//  옛 비밀번호가 영원히 통하는 구멍이 된다. 아래를 고정한다.

const assert = require('node:assert/strict');
const fs = require('node:fs');

const appCore = fs.readFileSync('app/js/app-core.js', 'utf8');
const adminJs = fs.readFileSync('app/js/admin.js', 'utf8');
const dbJs = fs.readFileSync('app/firebase-db.js', 'utf8');
const fnIndex = fs.readFileSync('functions/index.js', 'utf8');
const html = fs.readFileSync('app/index.html', 'utf8');

// 1) 클라이언트 하드코딩 자격증명 제거 (app-core 로그인 경로)
assert.ok(!/ADMIN\s*=\s*\{\s*id:/.test(appCore), 'app-core에 하드코딩 관리자 상수 금지');
assert.ok(!appCore.includes("pw:'1234'") && !appCore.includes("pw: '1234'"), 'app-core에 1234 하드코딩 금지');
assert.ok(!appCore.includes('fbde1052ecb6da2b9720c096ba8ea047'), 'app-core에 하드코딩 전역 토큰 금지');

// 2) 서버: 멱등 시드 + 비밀번호 변경 엔드포인트
assert.ok(fnIndex.includes('exports.seedLegacyAdmin'), 'seedLegacyAdmin 엔드포인트 필요');
const seedBlock = fnIndex.slice(fnIndex.indexOf('seedLegacyAdmin'), fnIndex.indexOf('updateAdminPassword'));
assert.ok(/idx\.exists\s*\|\|\s*cred\.exists/.test(seedBlock), '시드는 기존 계정이 있으면 no-op(덮어쓰기 금지)이어야 함');
assert.ok(fnIndex.includes('exports.updateAdminPassword'), 'updateAdminPassword 엔드포인트 필요');
const updBlock = fnIndex.slice(fnIndex.indexOf('exports.updateAdminPassword'));
assert.ok(/verifyFamilyPassword\(code,\s*String\(oldPw/.test(updBlock), '변경 전 현재 비밀번호 검증 필수');
assert.ok(/\^\(\?=\.\{8,\}\$\)/.test(updBlock), '새 비밀번호 규칙(8자+) 서버 강제 필요');

// 3) 클라이언트: 변경 UI + 래퍼
assert.ok(html.includes('id="adminMyPwNew"'), '관리자 비번 변경 입력 필드 필요');
assert.ok(adminJs.includes('doAdminChangeMyPassword'), 'admin.js 변경 핸들러 필요');
assert.ok(dbJs.includes('updateAdminPassword'), 'firebase-db 래퍼 필요');
assert.ok(adminJs.includes("removeItem('pat_admin_token')"), '변경 성공 시 레거시 전역 토큰 폐기');

console.log('admin password: PASS');
