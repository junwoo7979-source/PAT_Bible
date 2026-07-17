// ====== PAT Bible — router.js ======
// 가벼운 해시 라우터. 슬래시 경로(#/...)만 처리하고, 기존 화면 스위처 go()를 호출한다.
// ★ 기존 #s-xxx 해시(app-core.js가 쓰는 방식)는 절대 건드리지 않는다 — 슬래시로 시작하는
//   경로(#/login 등)만 라우터가 가로챈다. 그래서 기존 히스토리/뒤로가기 로직과 충돌하지 않음.
//
// 경로 맵:
//   #/login            → s-login
//   #/signup           → s-signup
//   #/forgot-password  → s-reset-pw
//   #/family           → s-family
//   #/admin/login      → s-admin-login       (Firebase Auth 관리자 로그인)
//   #/admin            → s-admin-dashboard    (관리자 대시보드, claim 가드)
//   #/admin/users      → s-admin-users        (회원관리, claim 가드)
//   #/unauthorized     → s-unauthorized
//   ★ 2026-07-17 관리자 분리: 로그인 화면에서 관리자 버튼을 제거하고 아래 주소로만 접근
//   #/admin/church-login → s-adminlogin       (교회 관리자 로그인)
//   #/church-register    → s-church-register  (새 교회 셀프 등록)

(function () {
  'use strict';

  var ROUTES = {
    '/login': 's-login',
    '/signup': 's-signup',
    '/forgot-password': 's-reset-pw',
    '/family': 's-family',
    '/admin/login': 's-admin-login',
    '/admin': { screen: 's-admin-dashboard', admin: true },
    '/admin/users': { screen: 's-admin-users', admin: true },
    '/unauthorized': 's-unauthorized',
    // ★ 2026-07-17 관리자 분리: 일반 로그인 화면에서 버튼 제거 → URL로만 접근
    '/admin/church-login': 's-adminlogin',
    '/church-register': 's-church-register',
  };

  // 관리자 화면 진입 후 데이터 렌더 훅
  function renderFor(screenId) {
    if (screenId === 's-admin-dashboard' && typeof renderAdminDashboard === 'function') renderAdminDashboard();
    else if (screenId === 's-admin-users' && typeof renderAdminUsers === 'function') renderAdminUsers();
  }

  // 현재 해시가 슬래시 경로면 '/xxx' 반환, 아니면 null(=라우터 미처리)
  function currentPath() {
    var h = location.hash || '';
    if (h.indexOf('#/') !== 0) return null;
    return h.slice(1);
  }

  function show(screenId) {
    if (typeof go === 'function') go(screenId);
    if (screenId === 's-signup' && typeof resetSignupForm === 'function') resetSignupForm();
  }

  function navigate(path, replace) {
    var target = '#' + path;
    if (replace && window.history && history.replaceState) {
      history.replaceState(null, '', target);
      handle();
    } else if (('#' + (currentPath() || '')) === target) {
      // 동일 경로 재요청 → hashchange 미발생 → 직접 처리
      handle();
    } else {
      location.hash = path; // hashchange 트리거 → handle()
    }
  }

  async function handle() {
    var path = currentPath();
    if (path === null) return; // 기존 #s-xxx 방식은 무시
    var route = ROUTES[path];
    if (!route) return;

    if (typeof route === 'string') { show(route); return; }

    // ── 관리자 가드 (claim 검증 전까지 대시보드 내용을 절대 노출하지 않음) ──
    if (route.admin) {
      if (!window.PAT_ADMIN_AUTH) { show('s-admin-login'); return; }
      show('s-admin-login'); // 검증 동안 중립 화면 유지
      try {
        var res = await window.PAT_ADMIN_AUTH.requireAdmin();
        if (res && res.admin) { show(route.screen); renderFor(route.screen); }
        else if (res && res.signedIn) show('s-unauthorized');
        else show('s-admin-login');
      } catch (e) {
        show('s-admin-login');
      }
    }
  }

  window.PAT_ROUTER = {
    go: function (path) { navigate(path, false); },
    replace: function (path) { navigate(path, true); },
    handle: handle,
    currentPath: currentPath,
  };

  window.addEventListener('hashchange', handle);

  // 초기 딥링크(#/…)를 라우터가 담당하는 경로로 복원한다.
  function restoreInitial() {
    var p = currentPath();
    if (p === null && window.__PAT_INITIAL_ROUTE) {
      if (window.history && history.replaceState) history.replaceState(null, '', '#' + window.__PAT_INITIAL_ROUTE);
      else location.hash = window.__PAT_INITIAL_ROUTE;
      p = currentPath();
    }
    return p;
  }

  function bootstrap() {
    var p = restoreInitial();
    if (p !== null) handle();
  }

  // 부팅 경합 대응: app-core의 initApp / completeAppInitialization(+50ms) 및 후속 async가
  // go(초기화면)으로 라우터 화면을 덮을 수 있다. 최초 딥링크가 있었다면 부팅이 정착하는
  // 짧은 구간 동안 여러 체크포인트에서 재확정하고, 그 뒤 1회성으로 소멸시킨다(사용자 이동은 안 덮음).
  function reassert() {
    if (!window.__PAT_INITIAL_ROUTE) return;
    if (window.history && history.replaceState) history.replaceState(null, '', '#' + window.__PAT_INITIAL_ROUTE);
    else location.hash = window.__PAT_INITIAL_ROUTE;
    handle();
  }
  function scheduleReasserts() {
    if (!window.__PAT_INITIAL_ROUTE) return;
    [60, 250, 600].forEach(function (ms) { setTimeout(reassert, ms); });
    // 정착 구간 종료 후 소멸 → 이후 사용자의 정상 이동은 절대 덮지 않음
    setTimeout(function () { window.__PAT_INITIAL_ROUTE = null; }, 900);
  }
  window.addEventListener('load', scheduleReasserts);

  function bootAndReassert() {
    bootstrap();
    // load 이벤트가 이미 지난 경우를 대비해 즉시 스케줄도 건다
    if (document.readyState === 'complete') scheduleReasserts();
  }
  if (document.readyState !== 'loading') bootAndReassert();
  else document.addEventListener('DOMContentLoaded', bootAndReassert);
})();
