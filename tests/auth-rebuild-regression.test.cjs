'use strict';
// ====== AUTH_REBUILD 2단계 — 회귀 테스트 (SPEC §36-2) ======
// 재구축 작업 동안 깨지면 안 되는 현재 동작(베이스라인)과 보안 불변식을 고정한다.
//
// 커버 항목 (SPEC §36 2단계 지정):
//  [R1] 로그인 후 로그인 화면 복귀 없음     — 세션 복원 판정(determineInitialScreen) 행동 검증
//  [R2] 새로고침 깜박임/부팅 경합 완화 장치 — stay_login 플래그 + reassert 소멸 검증
//  [R3] 중복 Auth 리스너·리다이렉트 없음    — onAuthStateChanged 등록 지점 1곳 + 1회성 해제
//  [R4] 로그아웃 후 보호 화면 차단          — 인증 키 제거 + 로그인 고정 플래그
//  [R5] 일반 사용자의 관리자 접근 차단      — 라우터 admin 가드 전수 + requireAdmin 거부 동작
//  [R6] 가족 ID 변조 차단                   — resolveFamilyByPassword 스코프·교회 격리
//  [R7] 초대 중복 수락 차단(멱등성)         — joinFamily 결정적 문서ID(set+merge) 검증
//
// ⚠️ 일부 테스트는 "임시 하드코딩 관리자(admin/1234, pat_admin_local)"의 현재 동작을
//    베이스라인으로 고정한다. SPEC §36 9단계(레거시 제거)에서 해당 케이스는
//    반드시 함께 갱신할 것 — [TEMP-LOCAL-ADMIN] 표식 검색.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const appCoreSrc = read('app/js/app-core.js');
const routerSrc = read('app/js/router.js');
const adminAuthSrc = read('app/js/admin-auth.js');
const functionsSrc = read('functions/index.js');
const { resolveFamilyByPassword } = require('../app/js/login-auth.js');

let pass = 0;
function ok(cond, msg) { assert.ok(cond, msg); console.log('  ✓', msg); pass++; }

// 함수 본문 추출 (선언부터 다음 최상위 `\nfunction ` 또는 파일 끝까지)
function extractFn(src, name) {
  const decl = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const m = decl.exec(src);
  assert.ok(m, `${name} 함수가 존재해야 함`);
  const start = m.index;
  const next = src.indexOf('\nfunction ', start + 10);
  const nextAsync = src.indexOf('\nasync function ', start + 10);
  let end = [next, nextAsync].filter((i) => i > 0).sort((a, b) => a - b)[0];
  if (end === undefined) end = src.length;
  return src.slice(start, end);
}

// ════════════════════════════════════════════════════════════════
// [R1] 세션 복원 판정 — 로그인 유지 / 로그인 화면 복귀 없음
// ════════════════════════════════════════════════════════════════
console.log('[R1] 세션 복원 판정 (determineInitialScreen 행동 검증)');
{
  const fnSrc = extractFn(appCoreSrc, 'determineInitialScreen');
  function runInitial({ pathname = '/app/', hash = '', session = {}, local = {} } = {}) {
    const mkStore = (obj) => ({
      getItem: (k) => (k in obj ? obj[k] : null),
      setItem: (k, v) => { obj[k] = String(v); },
      removeItem: (k) => { delete obj[k]; },
    });
    const fn = new Function(
      'location', 'sessionStorage', 'localStorage', 'console',
      fnSrc + '\nreturn determineInitialScreen();'
    );
    return fn({ pathname, hash }, mkStore(session), mkStore(local), { log() {}, error() {} });
  }

  // 로그인 성공 후(가족 프로필 저장됨) 새로고침 → 로그인 화면으로 복귀하지 않는다
  ok(runInitial({ local: { pat_family_profile: '{"name":"x"}' } }) === 's-family',
     '가족 프로필 존재 + 새로고침 → s-family 유지 (로그인 화면 복귀 없음)');

  // 아무 세션 없음 → 로그인 화면
  ok(runInitial() === 's-login', '세션 없음 → s-login');

  // 로그인 화면 의도 플래그(pat_stay_login) → 자동 입장으로 튕기지 않음
  ok(runInitial({ session: { pat_stay_login: '1' }, local: { pat_family_profile: '{}' } }) === 's-login',
     'pat_stay_login 세트 → 가족 프로필이 있어도 s-login 유지 (튕김 방지)');

  // 관리자 딥링크/전용 경로는 가족 세션으로 덮어쓰지 않는다
  ok(runInitial({ pathname: '/admin/', local: { pat_family_profile: '{}' } }) === 's-adminlogin',
     '/admin/ 경로 진입 → 가족 세션이 있어도 관리자 모드 유지');
  ok(runInitial({ hash: '#/admin/users' }) === 's-adminlogin', '#/admin 해시 딥링크 → 관리자 모드');

  // 교회 관리자: 새 브라우저 세션에서는 자동 진입 금지, 같은 세션 새로고침만 유지
  ok(runInitial({ local: { pat_admin_id: 'a', pat_admin_pw: 'p' } }) === 's-login',
     '교회 관리자 저장 자격증명만으로는(새 세션) 자동 진입 금지 → s-login');
  ok(runInitial({ local: { pat_admin_id: 'a', pat_admin_pw: 'p' }, session: { pat_admin_session: '1' } }) === 's-admin',
     '같은 세션 새로고침(pat_admin_session) → s-admin 유지');
}

// ════════════════════════════════════════════════════════════════
// [R2] 부팅 경합 완화 장치 — 새로고침 깜박임 방지 베이스라인
// ════════════════════════════════════════════════════════════════
console.log('[R2] 부팅 경합 완화 장치');
{
  // go()가 로그인 진입 시 stay 플래그를 세우고, 로그인 성공 화면에서 해제한다
  ok(/if\(id === 's-login'\) sessionStorage\.setItem\('pat_stay_login', '1'\)/.test(appCoreSrc),
     "go('s-login') → pat_stay_login 설정 (새로고침 시 로그인 화면 고정)");
  ok(/else if\(id === 's-family' \|\| id === 's-admin'\) sessionStorage\.removeItem\('pat_stay_login'\)/.test(appCoreSrc),
     "go('s-family'|'s-admin') → pat_stay_login 해제 (로그인 후 자동입장 복원)");

  // router.js reassert는 900ms 후 반드시 소멸 — 사용자의 정상 이동을 영구히 덮지 않음
  ok(/setTimeout\(function \(\) \{ window\.__PAT_INITIAL_ROUTE = null; \}, 900\)/.test(routerSrc),
     '딥링크 reassert는 900ms 후 소멸 (사용자 이동을 덮지 않음)');
}

// ════════════════════════════════════════════════════════════════
// [R3] 중복 Auth 리스너·리다이렉트 없음
// ════════════════════════════════════════════════════════════════
console.log('[R3] Auth 리스너 단일성');
{
  const jsDir = path.join(ROOT, 'app', 'js');
  const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'));
  let registrations = 0;
  const where = [];
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    const codeOnly = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const n = (codeOnly.match(/\.onAuthStateChanged\(/g) || []).length;
    if (n > 0) where.push(`${f}:${n}`);
    registrations += n;
  });
  ok(registrations === 1 && where[0] === 'admin-auth.js:1',
     `onAuthStateChanged 등록 지점은 admin-auth.js 1곳뿐 (현재: ${where.join(', ') || '없음'})`);

  // 그 1곳은 첫 발화에서 즉시 해제되는 1회성 리스너다 (장기 중복 리스너 금지)
  const guardStart = adminAuthSrc.indexOf('function requireAdmin');
  const guardBody = adminAuthSrc.slice(guardStart, adminAuthSrc.indexOf('\n  // 서버 API', guardStart));
  ok(/var unsub = auth\.onAuthStateChanged/.test(guardBody) && /unsub\(\)/.test(guardBody),
     'requireAdmin의 리스너는 unsub()로 즉시 해제되는 1회성');

  // 라우터의 관리자 가드는 검증 완료 전에는 보호 화면을 절대 노출하지 않는다
  const handleBody = routerSrc.slice(routerSrc.indexOf('async function handle'), routerSrc.indexOf('window.PAT_ROUTER'));
  const guardIdx = handleBody.indexOf('requireAdmin()');
  const showScreenIdx = handleBody.indexOf('show(route.screen)');
  ok(guardIdx > 0 && showScreenIdx > guardIdx,
     '라우터 admin 가드: requireAdmin 검증 후에만 show(route.screen)');
}

// ════════════════════════════════════════════════════════════════
// [R4] 로그아웃 후 보호 화면 차단
// ════════════════════════════════════════════════════════════════
console.log('[R4] 로그아웃 정리');
{
  const memberLogout = extractFn(appCoreSrc, 'memberLogout');
  ['pat_family_profile', 'pat_family_id', 'pat_leader_family_profile'].forEach((k) => {
    ok(memberLogout.includes(`localStorage.removeItem('${k}')`), `memberLogout: ${k} 제거`);
  });
  ok(memberLogout.includes("sessionStorage.setItem('pat_stay_login', '1')"),
     'memberLogout: 새로고침 시 로그인 화면 고정(pat_stay_login)');
  ok(!/localStorage\.removeItem\('pat_device_id'\)/.test(
       memberLogout.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')),
     'memberLogout: pat_device_id는 보존 (기록 단절·중복 레코드 방지)');

  const adminLogout = extractFn(appCoreSrc, 'adminLogout');
  ['pat_admin_id', 'pat_admin_pw', 'pat_admin_token'].forEach((k) => {
    ok(adminLogout.includes(`localStorage.removeItem('${k}')`), `adminLogout: ${k} 제거`);
  });
  ok(adminLogout.includes("sessionStorage.removeItem('pat_admin_session')"),
     'adminLogout: 세션 유지 플래그 제거 (새로고침 시 관리자 화면 복귀 차단)');
}

// ════════════════════════════════════════════════════════════════
// [R5] 일반 사용자의 관리자 접근 차단
// ════════════════════════════════════════════════════════════════
console.log('[R5] 관리자 라우트 가드');
{
  // ROUTES 리터럴을 평가해 전수 검사
  const m = /var ROUTES = (\{[\s\S]*?\n  \});/.exec(routerSrc);
  assert.ok(m, 'router.js에서 ROUTES 리터럴 추출');
  const ROUTES = new Function('return ' + m[1] + ';')();
  const UNGUARDED_ALLOWED = ['/admin/login', '/admin/church-login']; // 로그인 화면 자체
  Object.keys(ROUTES).forEach((p) => {
    if (!p.startsWith('/admin')) return;
    if (UNGUARDED_ALLOWED.includes(p)) return;
    const r = ROUTES[p];
    ok(typeof r === 'object' && r.admin === true, `${p} → admin 가드 적용됨`);
  });

  // requireAdmin 행동 검증: admin-auth.js를 vm에서 로드
  function loadAdminAuth(localStore) {
    const store = { ...localStore };
    const ctx = {
      console,
      window: {},
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      },
      document: { createElement: () => ({}), head: { appendChild() {} }, getElementById: () => null },
      Promise,
    };
    vm.createContext(ctx);
    vm.runInContext(adminAuthSrc, ctx);
    return ctx.window.PAT_ADMIN_AUTH;
  }

  (async () => {
    // 미설정 + 비로그인 → 관리자 아님 (일반 사용자는 관리자 화면 진입 불가)
    const anon = loadAdminAuth({});
    const r1 = await anon.requireAdmin();
    ok(r1.signedIn === false && r1.admin === false,
       '비로그인 사용자 requireAdmin → { signedIn:false, admin:false } (가드가 s-admin-login 표시)');

    // [TEMP-LOCAL-ADMIN] 임시 하드코딩 로컬 모드 베이스라인 — 9단계에서 이 케이스 제거·갱신
    const local = loadAdminAuth({ pat_admin_local: '1' });
    const r2 = await local.requireAdmin();
    ok(r2.admin === true, '[TEMP-LOCAL-ADMIN] pat_admin_local=1 → 임시 관리자 인정 (9단계에서 제거 예정)');

    // 잘못된 하드코딩 자격증명 → 거부
    const r3 = await anon.login('admin', 'wrong');
    ok(r3.ok === false && r3.admin === false, '잘못된 관리자 자격증명 → 로그인 거부');

    finish();
  })().catch((e) => { console.error(e); process.exit(1); });
}

// ════════════════════════════════════════════════════════════════
// [R6] 가족 ID 변조 차단
// ════════════════════════════════════════════════════════════════
console.log('[R6] 가족 ID 변조·교회 격리');
{
  const families = [
    { id: 'A', churchCode: '11111', familyPassword: 'pwA1!' },
    { id: 'B', churchCode: '11111', familyPassword: 'pwB2!' },
    { id: 'Z', churchCode: '22222', familyPassword: 'pwA1!' }, // 다른 교회, A와 같은 비번
  ];

  // 존재하지 않는 familyId로 변조 → 전체 검색으로 폴백하지 않고 차단
  ok(resolveFamilyByPassword(families, '11111', 'pwA1!', 'HACKED') === null,
     '변조된(존재하지 않는) familyId → null (전체 검색 폴백 없음)');

  // 내 familyId를 남의 방으로 변조 + 그 방의 비번을 모름 → 차단
  ok(resolveFamilyByPassword(families, '11111', 'pwA1!', 'B') === null,
     '남의 familyId로 변조 + 비번 불일치 → 차단');

  // 교회 격리: 같은 비번이라도 다른 교회 방은 절대 반환되지 않음
  ok(resolveFamilyByPassword(families, '11111', 'pwA1!')?.id === 'A',
     '교회 11111에서 pwA1! → A (같은 비번의 타교회 Z 반환 금지)');
  ok(resolveFamilyByPassword(families, '33333', 'pwA1!') === null,
     '미등록 교회코드 → 어떤 방도 반환하지 않음');

  // 서버측: 가족 데이터 접근 엔드포인트는 churchCode 검증을 통과해야 함
  ['joinFamily', 'getFamilyProgress', 'removeFamilyMember'].forEach((fn) => {
    const idx = functionsSrc.indexOf(`exports.${fn}`);
    assert.ok(idx >= 0, `functions/index.js: ${fn} 존재`);
    const body = functionsSrc.slice(idx, idx + 1200);
    ok(/assertChurchCode\(churchCode, res\)/.test(body), `${fn}: assertChurchCode 검증 수행`);
  });
}

// ════════════════════════════════════════════════════════════════
// [R7] 초대 중복 수락 차단 (멱등성)
// ════════════════════════════════════════════════════════════════
console.log('[R7] 초대 수락 멱등성');
{
  // 서버 joinFamily는 members/{deviceId} 결정적 문서 ID + set(merge) — add() 누적 금지
  const idx = functionsSrc.indexOf('exports.joinFamily');
  const body = functionsSrc.slice(idx, functionsSrc.indexOf('exports.', idx + 10));
  ok(/members\/\$\{deviceId\}`?\)\.set\(/.test(body),
     'joinFamily: members/{deviceId} 결정적 문서 ID에 set() (중복 수락 → 같은 문서 갱신)');
  ok(/\{ merge: true \}/.test(body), 'joinFamily: set(..., {merge:true}) — 기존 기록 보존');
  ok(!/\.add\(/.test(body), 'joinFamily: collection.add() 미사용 (수락 반복 시 문서 누적 금지)');

  // 동작 모델: 같은 deviceId로 2회 수락 → 구성원 문서 1개
  const docs = new Map();
  function join(deviceId, name) {
    const key = `members/${deviceId}`;
    docs.set(key, { ...(docs.get(key) || {}), displayName: name, deviceId });
  }
  join('dev-1', '아빠');
  join('dev-1', '아빠'); // 초대 링크 재클릭(중복 수락)
  ok(docs.size === 1, '같은 기기 중복 수락 2회 → 구성원 문서 1개 (중복 생성 없음)');
  join('dev-2', '엄마');
  ok(docs.size === 2, '다른 기기 수락 → 별도 문서 (정상 추가)');
}

function finish() {
  console.log(`\n🎉 auth-rebuild 회귀 테스트 통과 ${pass}건`);
}
