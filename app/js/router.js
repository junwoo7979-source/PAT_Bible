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
//   #/admin/login      → s-admin-login   (Firebase Auth 관리자 로그인)
//   #/admin            → s-admin         (관리자 대시보드, claim 가드)
//   #/admin/users      → s-admin         (회원관리, claim 가드)
//   #/unauthorized     → s-unauthorized

(function () {
  'use strict';

  var ROUTES = {
    '/login': 's-login',
    '/signup': 's-signup',
    '/forgot-password': 's-reset-pw',
    '/family': 's-family',
    '/admin/login': 's-admin-login',
    '/admin': { screen: 's-admin', admin: true },
    '/admin/users': { screen: 's-admin', admin: true },
    '/unauthorized': 's-unauthorized',
  };

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
        if (res && res.admin) show(route.screen);
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
  function bootstrap() { if (currentPath() !== null) handle(); }
  if (document.readyState !== 'loading') bootstrap();
  else document.addEventListener('DOMContentLoaded', bootstrap);
})();
