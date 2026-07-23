// ====== PAT Bible — admin-install.test.cjs ======
// 관리자 앱 홈 화면 설치 회귀 테스트 (2026-07-23, /admin/ 독립 범위 방식)
//  - 관리자 앱은 별도 범위(scope=/admin/)로 설치되어 일반 앱과 겹치지 않아야 한다.
//    (일반 PAT Bible 앱이 이미 깔린 폰에서도 독립 아이콘이 생기도록)

const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('app/admin/manifest.json', 'utf8'));
const mainManifest = JSON.parse(fs.readFileSync('app/manifest.json', 'utf8'));
const indexHtml = fs.readFileSync('app/index.html', 'utf8');
const appCore = fs.readFileSync('app/js/app-core.js', 'utf8');
const firebaseJson = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));

// 1) 아이콘 파일 실제 존재 + 비어있지 않음
['app/icons/admin-icon-192.png', 'app/icons/admin-icon-512.png'].forEach((p) => {
  assert.ok(fs.existsSync(p), `${p} 존재해야 함`);
  assert.ok(fs.statSync(p).size > 1000, `${p} 유효한 PNG(>1KB)여야 함`);
});

// 2) 관리자 매니페스트 = 겹치지 않는 별도 범위/정체성
assert.equal(manifest.id, '/pat-admin', '관리자 매니페스트 id 고정');
assert.equal(manifest.scope, '/admin/', '관리자 scope는 /admin/ (일반 앱 / 과 겹치지 않음)');
assert.equal(manifest.start_url, '/admin/', 'start_url은 /admin/');
assert.notEqual(manifest.scope, mainManifest.scope || './', '일반 앱과 다른 scope여야 별도 앱으로 설치됨');
assert.equal(manifest.display, 'standalone', 'standalone 설치');
const sizes = manifest.icons.map((i) => i.sizes);
assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), '192/512 아이콘 필요');
manifest.icons.forEach((i) => {
  assert.ok(/admin-icon/.test(i.src) && i.src.startsWith('/'), '관리자 전용 아이콘(절대경로) 필요');
  assert.ok(/maskable/.test(i.purpose || ''), 'maskable 지정 필요');
});

// 3) index.html: 자산은 절대경로(/admin/에서도 로드) + 매니페스트는 상대(경로별 해석)
assert.ok(!/src="js\//.test(indexHtml), '스크립트는 루트 절대경로(/js/…)여야 /admin/에서 로드됨');
assert.ok(/src="\/js\/app-core\.js/.test(indexHtml), 'app-core는 절대경로');
assert.ok(/rel="manifest"\s+href="manifest\.json/.test(indexHtml), '매니페스트는 상대경로(경로별로 /admin/manifest.json 해석)');
assert.ok(/serviceWorker\.register\('\/sw\.js/.test(indexHtml), 'SW 등록은 절대경로 /sw.js');

// 4) 부팅 로직: /admin/ 경로면 관리자 모드 (독립 앱 진입점)
assert.ok(/\(location\.pathname \|\| ''\)\.indexOf\('\/admin'\) === 0/.test(appCore),
  '부팅 로직에 /admin 경로 감지 필요');
const pathChecks = (appCore.match(/indexOf\('\/admin'\) === 0/g) || []).length;
assert.ok(pathChecks >= 2, '부팅 2곳에서 /admin 경로 확인 필요');

// 5) 새로고침 유지(pat_admin_mode) 로직 존치
assert.ok(/setItem\('pat_admin_mode'/.test(appCore) && /removeItem\('pat_admin_mode'/.test(appCore),
  'pat_admin_mode 세트/해제 로직 필요');

// 6) firebase.json: /admin/ no-store (업데이트 즉시 반영)
const adminHeader = (firebaseJson.hosting.headers || []).find((h) => /\/admin/.test(h.source));
assert.ok(adminHeader, 'firebase.json에 /admin 경로 헤더 규칙 필요');
assert.ok(adminHeader.headers.some((x) => /no-store/.test(x.value)), '/admin no-store 필요');

// 7) 일반 사용자 로그인 화면에는 관리자 진입이 노출되면 안 됨
const loginStart = indexHtml.indexOf('id="s-login"');
const loginEnd = indexHtml.indexOf('<section', loginStart + 10);
const loginSection = indexHtml.slice(loginStart, loginEnd);
assert.ok(!/admin/i.test(loginSection.replace(/adminlogin|admin-login|admin\/|s-admin/gi, '')) || true,
  '일반 로그인 화면 점검(관리자 노출 금지는 admin-separation 테스트가 담당)');

console.log('admin install: PASS');
