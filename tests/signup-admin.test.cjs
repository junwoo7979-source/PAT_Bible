// tests/signup-admin.test.cjs
// 2026-07-15 신규 기능 검증:
//  (1) 가족 비밀번호 강도 규칙 (특수문자+영문+숫자, 8자↑)
//  (2) 회원가입 이메일 형식 검증
//  (3) 서버 화이트리스트: email 허용 / role·isAdmin 등 권한필드 주입 차단
//  (4) 관리자 API 게이트: 토큰 없음/일반사용자/관리자 분기

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
function ok(name) { console.log('  ✓', name); passed++; }

// ── 소스에서 순수 함수 추출 (브라우저 전역 의존 없는 함수만) — 중괄호 균형으로 잘라냄 ──
function extractFn(file, fnName) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const start = src.indexOf('function ' + fnName);
  if (start === -1) throw new Error('함수 추출 실패: ' + fnName);
  const open = src.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const body = src.slice(start, i);
  // eslint-disable-next-line no-new-func
  return new Function(body + '\nreturn ' + fnName + ';')();
}

// (1) 비밀번호 강도
(function testPwStrength() {
  const checkFamilyPwStrength = extractFn('app/js/family.js', 'checkFamilyPwStrength');
  assert.strictEqual(checkFamilyPwStrength('#grace2026').ok, true, '#grace2026 통과해야');
  assert.strictEqual(checkFamilyPwStrength('Abc!2345').ok, true, '특수+영문+숫자 8자 통과');
  assert.strictEqual(checkFamilyPwStrength('abc!123').ok, false, '7자 실패');       // 7자
  assert.strictEqual(checkFamilyPwStrength('abcd1234').ok, false, '특수문자 없음 실패');
  assert.strictEqual(checkFamilyPwStrength('abcd!efg').ok, false, '숫자 없음 실패');
  assert.strictEqual(checkFamilyPwStrength('1234!567').ok, false, '영문 없음 실패');
  assert.strictEqual(checkFamilyPwStrength('').ok, false, '빈값 실패');
  ok('가족 비밀번호 강도 규칙 (특수문자+영문+숫자, 8자↑)');
})();

// (2) 이메일 형식
(function testEmail() {
  const isValid = extractFn('app/js/signup.js', 'isValidEmail');
  assert.strictEqual(isValid('name@example.com'), true);
  assert.strictEqual(isValid('a.b-c@sub.domain.co'), true);
  assert.strictEqual(isValid('bad'), false);
  assert.strictEqual(isValid('bad@'), false);
  assert.strictEqual(isValid('bad@x'), false);
  assert.strictEqual(isValid('a b@x.com'), false);
  ok('회원가입 이메일 형식 검증');
})();

// (3) 서버 화이트리스트
(function testWhitelist() {
  const { sanitizeFamilyDataForSave } = require(path.join(ROOT, 'functions', 'password.js'));
  const out = sanitizeFamilyDataForSave('11111', {
    roomName: 'R', leaderName: 'L', parish: 'p1', members: ['L'],
    email: 'me@example.com',
    role: 'admin', isAdmin: true, status: 'active', familyPasswordHash: 'x',
  }, 'pepper');
  assert.strictEqual(out.email, 'me@example.com', 'email 저장 허용');
  assert.strictEqual('role' in out, false, 'role 주입 차단');
  assert.strictEqual('isAdmin' in out, false, 'isAdmin 주입 차단');
  assert.strictEqual('status' in out, false, 'status 주입 차단');
  ok('서버 화이트리스트: email 허용 / 권한필드 차단');
})();

// (4) 관리자 API 게이트 (requireAdmin) — getAuth().verifyIdToken 을 mock
(async function testAdminGate() {
  // firebase-admin/auth 모듈을 require 캐시에 mock 주입
  const authModulePath = require.resolve('firebase-admin/auth', { paths: [path.join(ROOT, 'functions')] });
  let claims = null;
  let throwVerify = false;
  require.cache[authModulePath] = {
    id: authModulePath, filename: authModulePath, loaded: true,
    exports: {
      getAuth: () => ({
        verifyIdToken: async () => { if (throwVerify) throw new Error('bad'); return claims; },
      }),
    },
  };
  // getFirestore 도 mock (requireAdmin 은 사용 안 하지만 admin-api 로드시 필요)
  const fsModulePath = require.resolve('firebase-admin/firestore', { paths: [path.join(ROOT, 'functions')] });
  require.cache[fsModulePath] = {
    id: fsModulePath, filename: fsModulePath, loaded: true,
    exports: { getFirestore: () => ({}), FieldValue: { serverTimestamp: () => 'ts' } },
  };
  // firebase-functions/v2/https onRequest mock (핸들러 그대로 통과)
  const httpsPath = require.resolve('firebase-functions/v2/https', { paths: [path.join(ROOT, 'functions')] });
  require.cache[httpsPath] = {
    id: httpsPath, filename: httpsPath, loaded: true,
    exports: { onRequest: (_opts, fn) => fn },
  };

  const { requireAdmin } = require(path.join(ROOT, 'functions', 'admin-api.js'));

  function mockRes() {
    return { _code: 200, _json: null, status(c) { this._code = c; return this; }, json(j) { this._json = j; return this; } };
  }

  // 토큰 없음 → 401
  let res = mockRes();
  let r = await requireAdmin({ headers: {} }, res);
  assert.strictEqual(r, null); assert.strictEqual(res._code, 401);

  // 토큰 있으나 verify 실패 → 401
  throwVerify = true;
  res = mockRes();
  r = await requireAdmin({ headers: { authorization: 'Bearer x' } }, res);
  assert.strictEqual(r, null); assert.strictEqual(res._code, 401);

  // 일반 사용자(admin claim 없음) → 403
  throwVerify = false; claims = { uid: 'u1', admin: false };
  res = mockRes();
  r = await requireAdmin({ headers: { authorization: 'Bearer x' } }, res);
  assert.strictEqual(r, null); assert.strictEqual(res._code, 403);

  // 관리자(admin:true) → 통과
  claims = { uid: 'admin1', admin: true };
  res = mockRes();
  r = await requireAdmin({ headers: { authorization: 'Bearer x' } }, res);
  assert.ok(r && r.admin === true, '관리자 통과');
  ok('관리자 API 게이트: 미인증401 / 일반403 / 관리자 통과');

  console.log('\n✅ signup-admin: 모든 테스트 통과 (' + passed + ')');
})().catch((e) => { console.error('❌ signup-admin FAIL:', e.message); process.exit(1); });
