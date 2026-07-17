// ====== PAT Bible — admin-auth.js ======
// 플랫폼 관리자 인증 — Firebase Auth + Custom Claims(admin === true).
//
// ★ 2026-07-17 정리: 42b7342 커밋 메시지·주석에 있던 "하드코딩 로컬 로그인"은 실제로
//    구현되지 않았고(관련 상수·함수만 선언된 채 미사용), 소스에 자격증명이 남는 보안
//    위험만 있어 잔재를 제거했다. 인증은 아래 Firebase 경로가 전부다.
//
// ★ 일반 사용자(교회코드 + 가족비밀번호) 로그인과 완전히 분리된 별도 인증 경로.
// ★ Firebase Auth SDK는 (사용 시) 관리자 경로 진입에만 지연 로드 → 일반 사용자 로딩 영향 없음.

(function () {
  'use strict';

  var SDK_VERSION = '10.12.5';
  var _auth = null;
  var _sdkPromise = null;

  function cfg() { return window.FIREBASE_CLIENT_CONFIG || null; }
  function configured() {
    var c = cfg();
    return !!(c && c.apiKey && c.authDomain && c.projectId);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('SDK_LOAD_FAIL')); };
      document.head.appendChild(s);
    });
  }

  function ensureSdk() {
    if (_sdkPromise) return _sdkPromise;
    _sdkPromise = (async function () {
      if (!(window.firebase && window.firebase.auth)) {
        await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-auth-compat.js');
      }
      return window.firebase;
    })();
    return _sdkPromise;
  }

  async function initAuth() {
    if (_auth) return _auth;
    if (!configured()) throw new Error('NOT_CONFIGURED');
    var fb = await ensureSdk();
    if (!fb.apps || !fb.apps.length) fb.initializeApp(cfg());
    _auth = fb.auth();
    // 관리자 세션은 탭 단위(SESSION) — 브라우저 닫으면 자동 로그아웃(보안)
    try { await _auth.setPersistence(fb.auth.Auth.Persistence.SESSION); } catch (e) {}
    return _auth;
  }

  // 로그인 → claim 검증. 관리자 아니면 즉시 로그아웃(정보 최소 노출).
  async function login(email, pw) {
    var auth = await initAuth();
    var cred = await auth.signInWithEmailAndPassword(String(email || '').trim(), String(pw || ''));
    var tok = await cred.user.getIdTokenResult(true);
    if (tok.claims && tok.claims.admin === true) {
      return { ok: true, admin: true, email: cred.user.email };
    }
    try { await auth.signOut(); } catch (e) {}
    return { ok: false, admin: false };
  }

  async function logout() {
    try { if (_auth) await _auth.signOut(); } catch (e) {}
  }

  // 가드용: 현재 세션 관리자 여부. 반환 { signedIn, admin, email }
  function requireAdmin() {
    return new Promise(function (resolve) {
      initAuth().then(function (auth) {
        var done = false;
        var unsub = auth.onAuthStateChanged(async function (user) {
          if (done) return; done = true;
          try { unsub(); } catch (e) {}
          if (!user) { resolve({ signedIn: false, admin: false }); return; }
          try {
            var tok = await user.getIdTokenResult(true);
            resolve({ signedIn: true, admin: !!(tok.claims && tok.claims.admin === true), email: user.email });
          } catch (e) { resolve({ signedIn: true, admin: false }); }
        });
      }).catch(function () {
        resolve({ signedIn: false, admin: false, error: 'NOT_CONFIGURED' });
      });
    });
  }

  // 서버 API 호출용 현재 ID 토큰
  async function getIdToken() {
    var auth = await initAuth();
    var u = auth.currentUser;
    return u ? await u.getIdToken() : null;
  }

  window.PAT_ADMIN_AUTH = {
    login: login,
    logout: logout,
    requireAdmin: requireAdmin,
    getIdToken: getIdToken,
    configured: configured,
  };

  // ── 관리자 로그인 화면 핸들러 (s-admin-login) ──
  async function adminAuthLogin() {
    var emailEl = document.getElementById('adminAuthEmail');
    var pwEl = document.getElementById('adminAuthPw');
    var errEl = document.getElementById('adminAuthError');
    var btn = document.getElementById('adminAuthLoginBtn');
    function showErr(m) { if (errEl) { errEl.textContent = m; errEl.style.display = 'block'; } }
    if (errEl) errEl.style.display = 'none';

    var email = (emailEl && emailEl.value || '').trim();
    var pw = (pwEl && pwEl.value || '');
    if (!email || !pw) { showErr('이메일과 비밀번호를 입력하세요'); return; }
    if (!configured()) { showErr('관리자 인증이 아직 설정되지 않았습니다. 관리자에게 문의하세요.'); return; }

    if (btn) { if (btn.dataset.busy === '1') return; btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = '확인 중…'; }
    try {
      var res = await login(email, pw);
      if (res.ok && res.admin) {
        if (pwEl) pwEl.value = '';
        if (window.PAT_ROUTER) window.PAT_ROUTER.go('/admin');
        else if (typeof go === 'function') go('s-admin');
      } else {
        // 관리자 권한 없음/자격 불일치 — 일반화된 메시지(시스템 정보 미노출)
        showErr('로그인할 수 없습니다. 계정 또는 권한을 확인하세요.');
      }
    } catch (e) {
      showErr('로그인할 수 없습니다. 계정 또는 권한을 확인하세요.');
    } finally {
      if (btn) { btn.dataset.busy = '0'; btn.disabled = false; btn.textContent = '관리자 로그인'; }
    }
  }

  // 관리자 로그아웃(대시보드에서 호출 가능)
  async function adminAuthLogout() {
    await logout();
    if (window.PAT_ROUTER) window.PAT_ROUTER.go('/login');
    else if (typeof go === 'function') go('s-login');
  }

  window.adminAuthLogin = adminAuthLogin;
  window.adminAuthLogout = adminAuthLogout;
})();
