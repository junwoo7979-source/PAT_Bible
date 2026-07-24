// ====== PAT Bible — admin-auth.js ======
// 플랫폼 관리자 인증.
//
// ⚠️ 2026-07-24 임시 구현(요청): 관리자 로그인은 하드코딩 자격증명(admin / 1234)만 통과.
//    - 로그인 성공 시 로컬 토큰(localStorage: pat_admin_local='1') 저장.
//    - 가드(requireAdmin)는 이 로컬 토큰을 관리자 세션으로 인정.
//    - 로컬 모드에서는 서버 ID 토큰이 없으므로 getIdToken()은 null 반환
//      (보호 API 호출은 서버가 401로 거부 → 기존 오류 안내 그대로 노출).
//    ※ 이는 명시적으로 요청된 임시 다운그레이드다. 정식 운영 전 Firebase Auth +
//      Custom Claims 경로(아래 로직 유지)로 복귀할 것.
//
// ★ 일반 사용자(교회코드 + 가족비밀번호) 로그인과 완전히 분리된 별도 인증 경로.
// ★ Firebase Auth SDK는 (사용 시) 관리자 경로 진입에만 지연 로드 → 일반 사용자 로딩 영향 없음.

(function () {
  'use strict';

  // 하드코딩 임시 자격증명 (교회관리자 체험 계정과 동일)
  var LOCAL_ADMIN = { id: 'admin', pw: '1234' };
  var LOCAL_KEY = 'pat_admin_local';

  var SDK_VERSION = '10.12.5';
  var _auth = null;
  var _sdkPromise = null;

  function cfg() { return window.FIREBASE_CLIENT_CONFIG || null; }
  function configured() {
    var c = cfg();
    return !!(c && c.apiKey && c.authDomain && c.projectId);
  }

  function isLocalMode() {
    try { return localStorage.getItem(LOCAL_KEY) === '1'; } catch (e) { return false; }
  }
  function setLocalMode(on) {
    try {
      if (on) localStorage.setItem(LOCAL_KEY, '1');
      else localStorage.removeItem(LOCAL_KEY);
    } catch (e) {}
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

  // 로그인 → 하드코딩 자격증명 우선 확인. 일치하면 로컬 관리자 세션 시작.
  //          불일치 시에는 (설정돼 있으면) Firebase Auth + admin claim 검증으로 폴백.
  async function login(id, pw) {
    var uid = String(id || '').trim();
    var upw = String(pw || '');

    // 1) 하드코딩 로컬 자격증명
    if (uid === LOCAL_ADMIN.id && upw === LOCAL_ADMIN.pw) {
      setLocalMode(true);
      return { ok: true, admin: true, email: LOCAL_ADMIN.id };
    }

    // 2) Firebase Auth 경로(설정된 경우) — 정식 운영용
    if (configured()) {
      var auth = await initAuth();
      var cred = await auth.signInWithEmailAndPassword(uid, upw);
      var tok = await cred.user.getIdTokenResult(true);
      if (tok.claims && tok.claims.admin === true) {
        return { ok: true, admin: true, email: cred.user.email };
      }
      try { await auth.signOut(); } catch (e) {}
      return { ok: false, admin: false };
    }

    return { ok: false, admin: false };
  }

  async function logout() {
    setLocalMode(false);
    try { if (_auth) await _auth.signOut(); } catch (e) {}
  }

  // 가드용: 현재 세션 관리자 여부. 반환 { signedIn, admin, email }
  function requireAdmin() {
    return new Promise(function (resolve) {
      // 로컬 모드가 최우선
      if (isLocalMode()) {
        resolve({ signedIn: true, admin: true, email: LOCAL_ADMIN.id });
        return;
      }
      if (!configured()) {
        resolve({ signedIn: false, admin: false, error: 'NOT_CONFIGURED' });
        return;
      }
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

  // 서버 API 호출용 현재 ID 토큰 (로컬 모드에는 서버 토큰이 없음 → null)
  async function getIdToken() {
    if (isLocalMode()) return null;
    if (!configured()) return null;
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
    isLocalMode: isLocalMode,
  };

  // ── 관리자 로그인 화면 핸들러 (s-admin-login) ──
  async function adminAuthLogin() {
    var emailEl = document.getElementById('adminAuthEmail');
    var pwEl = document.getElementById('adminAuthPw');
    var errEl = document.getElementById('adminAuthError');
    var btn = document.getElementById('adminAuthLoginBtn');
    function showErr(m) { if (errEl) { errEl.textContent = m; errEl.style.display = 'block'; } }
    if (errEl) errEl.style.display = 'none';

    var id = (emailEl && emailEl.value || '').trim();
    var pw = (pwEl && pwEl.value || '');
    if (!id || !pw) { showErr('아이디와 비밀번호를 입력하세요'); return; }

    if (btn) { if (btn.dataset.busy === '1') return; btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = '확인 중…'; }
    try {
      var res = await login(id, pw);
      if (res.ok && res.admin) {
        if (pwEl) pwEl.value = '';
        if (window.PAT_ROUTER) window.PAT_ROUTER.go('/admin');
        else if (typeof go === 'function') go('s-admin-dashboard');
      } else {
        showErr('로그인할 수 없습니다. 아이디 또는 비밀번호를 확인하세요.');
      }
    } catch (e) {
      showErr('로그인할 수 없습니다. 아이디 또는 비밀번호를 확인하세요.');
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
