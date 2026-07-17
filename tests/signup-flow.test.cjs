// ====== PAT Bible — signup-flow.test.cjs ======
// 회원가입 → 가족방 이동 흐름 회귀 테스트 (2026-07-17)
// 버그: location.hash='#/family' 대입이 popstate를 발화시키고, app-core의 popstate
// 핸들러가 이를 '알 수 없는 화면'으로 오인해 로그인 화면으로 강제 전환+해시 삭제
// → "가입하기를 눌러도 로그인 화면으로 튕기는" 문제. 아래 3가지를 고정한다.

const assert = require('node:assert/strict');
const fs = require('node:fs');

const appCore = fs.readFileSync('app/js/app-core.js', 'utf8');
const signup = fs.readFileSync('app/js/signup.js', 'utf8');
const html = fs.readFileSync('app/index.html', 'utf8');

// 1) popstate 핸들러가 라우터 소관 슬래시 해시(#/...)를 통과시켜야 한다
assert.ok(
  /popstate[\s\S]{0,700}location\.hash\.indexOf\('#\/'\)\s*===\s*0\)\s*return/.test(appCore),
  'app-core popstate 핸들러에 슬래시 라우트(#/) 통과 가드가 있어야 함'
);

// 2) 회원가입 제출이 가족방(/family)으로 이동해야 한다
assert.ok(
  signup.includes("PAT_ROUTER.go('/family')"),
  'signup.js 가입 완료 시 /family로 이동해야 함'
);

// 3) 이메일 가입자는 교회 컨텍스트가 없으므로 기본 교회 폴백이 있어야 한다
//    (없으면 가족방 생성 saveFamily가 churchCode 검증에서 실패)
assert.ok(
  /adoptChurch\('11111',\s*'세광교회'\)/.test(signup),
  'signup.js에 기본 교회(세광 11111) 폴백이 있어야 함'
);

// 4) 변경 파일의 버전 핀이 v205 이상이어야 한다 (구버전 캐시로 버그 재발 방지)
['app-core', 'signup'].forEach((name) => {
  const m = html.match(new RegExp(`js/${name}\\.js\\?v=(\\d+)`));
  assert.ok(m && Number(m[1]) >= 205, `${name}.js 버전 핀이 v205 이상이어야 함`);
});

console.log('signup flow: PASS');
