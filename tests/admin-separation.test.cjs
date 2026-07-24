// ====== PAT Bible — admin-separation.test.cjs ======
// 관리자 모드 완전 분리 회귀 테스트 (2026-07-17, AUTH_REBUILD 지시)
//  1) 일반 사용자 로그인 화면(s-login)에 관리자 진입 버튼이 없어야 한다.
//     - 교회 관리자 로그인(s-adminlogin), 교회 등록(s-church-register),
//       관리자 초기화(s-reset-pw), 플랫폼 관리자(s-admin-login) 어느 것도 노출 금지.
//  2) 관리자 화면들은 URL 라우트로만 접근 가능해야 한다.
//     - #/admin/church-login → s-adminlogin
//     - #/church-register    → s-church-register
//     - #/forgot-password    → s-reset-pw
//     - #/admin/login        → s-admin-login
//  3) 관리자 로그인 화면(s-adminlogin)에는 교회 등록·비번 초기화 진입이 있어야 한다.

const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('app/index.html', 'utf8');
const routerSrc = fs.readFileSync('app/js/router.js', 'utf8');

// ── s-login 섹션만 추출 (다음 <section 시작 전까지) ──
function extractSection(id) {
  const re = new RegExp(`<section[^>]*id="${id}"`);
  const m = re.exec(html);
  assert.ok(m, `${id} 섹션이 존재해야 함`);
  const start = m.index;
  const end = html.indexOf('<section', start + 10);
  return html.slice(start, end > 0 ? end : html.length);
}

const loginSection = extractSection('s-login');

// 1) 로그인 화면에 관리자 진입 없음
['s-adminlogin', 's-church-register', 's-reset-pw', 's-admin-login', 'adminLogin('].forEach((needle) => {
  assert.ok(
    !loginSection.includes(needle),
    `s-login 화면에 관리자 진입(${needle})이 노출되면 안 됨`
  );
});

// 2) 라우터에 관리자 접근 경로 존재
assert.match(routerSrc, /'\/admin\/church-login':\s*'s-adminlogin'/, '#/admin/church-login 라우트 필요');
assert.match(routerSrc, /'\/church-register':\s*'s-church-register'/, '#/church-register 라우트 필요');
assert.match(routerSrc, /'\/forgot-password':\s*'s-reset-pw'/, '#/forgot-password 라우트 필요');
assert.match(routerSrc, /'\/admin\/login':\s*'s-admin-login'/, '#/admin/login 라우트 필요');

// 3) 관리자 로그인 화면에서 교회 등록·비번 초기화 접근 가능
const adminLoginSection = extractSection('s-adminlogin');
assert.ok(adminLoginSection.includes('s-church-register'), 's-adminlogin에서 교회 등록 진입 필요');
assert.ok(adminLoginSection.includes('s-reset-pw'), 's-adminlogin에서 비번 초기화 진입 필요');

// 4) 회원가입 진입은 로그인 화면에 유지 (이메일 등록 경로)
assert.ok(
  loginSection.includes("'/signup'") || loginSection.includes('s-signup'),
  's-login 화면에 이메일 회원가입 진입이 있어야 함'
);

// 5) ⚠️ 2026-07-24 임시: 플랫폼 관리자 로그인을 하드코딩(admin/1234) 로컬 모드로 다운그레이드(사용자 요청).
//    임시 구현이 온전한지(로컬 모드 + Firebase 폴백 공존)를 고정한다.
//    ※ 정식 Firebase Auth 복귀 시 이 블록을 "잔재 없음" 가드(42b7342 형태)로 되돌릴 것.
const adminAuthSrc = fs.readFileSync('app/js/admin-auth.js', 'utf8');
['LOCAL_ADMIN', 'isLocalMode', 'pat_admin_local'].forEach((needle) => {
  assert.ok(
    adminAuthSrc.includes(needle),
    `admin-auth.js 임시 로컬 로그인 구성요소(${needle}) 필요`
  );
});
assert.ok(
  adminAuthSrc.includes('signInWithEmailAndPassword'),
  '정식 복귀용 Firebase Auth 경로가 유지되어야 함'
);

console.log('admin separation: PASS');
