// ====== PAT Bible — admin-install.test.cjs ======
// 관리자 앱 홈 화면 설치(별도 아이콘·매니페스트) 회귀 테스트 (2026-07-23)
//  - 별도 매니페스트/진입 페이지/아이콘이 존재하고 서로 올바르게 연결돼야 한다.
//  - 관리자 매니페스트는 일반 앱과 다른 id/start_url/아이콘을 가져야 별도 앱으로 설치된다.

const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('app/admin-manifest.json', 'utf8'));
const mainManifest = JSON.parse(fs.readFileSync('app/manifest.json', 'utf8'));
const adminHtml = fs.readFileSync('app/admin.html', 'utf8');
const indexHtml = fs.readFileSync('app/index.html', 'utf8');

// 1) 아이콘 파일 실제 존재 + 비어있지 않음
['app/icons/admin-icon-192.png', 'app/icons/admin-icon-512.png'].forEach((p) => {
  assert.ok(fs.existsSync(p), `${p} 존재해야 함`);
  assert.ok(fs.statSync(p).size > 1000, `${p} 유효한 PNG(>1KB)여야 함`);
});

// 2) 관리자 매니페스트 = 일반 앱과 구분되는 별도 정체성
assert.equal(manifest.id, '/pat-admin', '관리자 매니페스트 id 고정');
assert.notEqual(manifest.id, mainManifest.id, '일반 앱과 다른 id여야 별도 앱으로 설치됨');
assert.match(manifest.start_url, /#\/admin\/church-login$/, 'start_url은 관리자 로그인으로 열려야 함');
assert.equal(manifest.display, 'standalone', 'standalone 설치');
const sizes = manifest.icons.map((i) => i.sizes);
assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), '192/512 아이콘 필요');
manifest.icons.forEach((i) => {
  assert.ok(/admin-icon/.test(i.src), '관리자 전용 아이콘을 써야 함(일반 아이콘 금지)');
  assert.ok(/maskable/.test(i.purpose || ''), 'maskable 지정 필요');
});

// 3) admin.html 진입 페이지 연결
assert.ok(/rel="manifest"\s+href="admin-manifest\.json/.test(adminHtml), 'admin.html은 관리자 매니페스트를 링크');
assert.ok(/apple-touch-icon"\s+href="icons\/admin-icon-192\.png"/.test(adminHtml), 'iOS 아이콘 = 관리자 아이콘');
assert.ok(/apple-mobile-web-app-title"\s+content="PAT 관리자"/.test(adminHtml), 'iOS 홈 이름 = PAT 관리자');
assert.ok(adminHtml.includes('serviceWorker'), '설치 조건 충족 위해 SW 등록 필요');
assert.ok(adminHtml.includes("index.html#/admin/church-login"), '관리자 로그인으로 가는 진입 필요');
assert.ok(adminHtml.includes('beforeinstallprompt'), 'Android 설치 프롬프트 처리 필요');
assert.ok(/display-mode: standalone|navigator\.standalone/.test(adminHtml), '설치 후 로그인 자동 이동(standalone 감지) 필요');

// 4) 관리자 로그인 화면에서 설치 페이지로 가는 진입 존재
assert.ok(/href="admin\.html"/.test(indexHtml), 's-adminlogin에 관리자 앱 설치 진입 필요');

// 5) 일반 사용자 로그인 화면에는 관리자 설치 진입이 노출되면 안 됨
const loginStart = indexHtml.indexOf('id="s-login"');
const loginEnd = indexHtml.indexOf('<section', loginStart + 10);
const loginSection = indexHtml.slice(loginStart, loginEnd);
assert.ok(!loginSection.includes('admin.html'), '일반 로그인 화면에 관리자 설치 진입 노출 금지');

// 6) 부팅 로직: 관리자 딥링크로 열리면 저장된 가족 세션으로 덮어쓰지 않아야 함
//    (관리자 앱 새로고침 시 사용자 화면으로 넘어가던 문제 회귀 방지)
const appCore = fs.readFileSync('app/js/app-core.js', 'utf8');
// determineInitialScreen + completeAppInitialization 두 곳 모두 admin 딥링크 가드 필요
const guardCount = (appCore.match(/indexOf\('#\/admin'\)\s*===\s*0/g) || []).length;
assert.ok(guardCount >= 2, '부팅 로직 2곳(determineInitialScreen·completeAppInitialization)에 관리자 딥링크 가드 필요');
assert.ok(/_adminDeepLink/.test(appCore), 'completeAppInitialization에 관리자 딥링크 분기 필요');

console.log('admin install: PASS');
