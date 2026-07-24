// ====== PAT Bible — pwa-install.js (v134) ======
// 홈화면 설치 유도 컨트롤러.
//
// [완전 자동 설치가 불가능한 이유 — 브라우저 보안 정책]
//  · 어떤 브라우저도 "사용자 제스처 없는 완전 자동 홈화면 설치"를 허용하지 않는다.
//    (악성 사이트의 무단 아이콘 설치 방지 목적)
//  · Android Chrome: beforeinstallprompt 를 가로채도, 실제 설치 팝업(prompt())은
//    반드시 '사용자 클릭' 안에서만 호출 가능 → 버튼 1번 탭이 최소 조건.
//  · iOS Safari: beforeinstallprompt / prompt() 자체가 없음 → 프로그램적 설치 불가.
//    사용자가 '공유 → 홈 화면에 추가'를 직접 눌러야 함 → 안내 모달만 제공 가능.
//  따라서 "링크 접속 → 버튼 1번 탭(Android) / 안내대로 2탭(iOS)"이 실질적 최선이다.
//
// ⚠️ 데이터 안전: 이 파일은 localStorage 의 설치안내 플래그(pat_install_dismiss)만
//    읽고 쓴다. 로그인/가족/미션 데이터에는 절대 접근하지 않는다.

(function(){
  var DISMISS_KEY = 'pat_install_dismiss';
  var DISMISS_DAYS = 7;                 // '나중에 하기' 후 재노출까지 유예
  var captured = null;                  // beforeinstallprompt 이벤트 보관

  function ua(){ return (typeof navigator !== 'undefined' ? navigator.userAgent : '') || ''; }
  function isStandalone(){
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || navigator.standalone === true;   // iOS Safari
    } catch(e){ return false; }
  }
  function platform(){
    var u = ua();
    if(/KAKAOTALK|FBAN|FBAV|Instagram|Line/i.test(u)) return 'inapp';   // 인앱 브라우저
    if(/iPhone|iPad|iPod/i.test(u)) return 'ios';
    if(/Android/i.test(u)) return 'android';
    return 'desktop';
  }
  function dismissedRecently(){
    try {
      var t = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      if(!t) return false;
      return (Date.now() - t) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    } catch(e){ return false; }
  }
  function getPrompt(){
    return captured || window.deferredPrompt || window.deferredInstallPrompt || null;
  }

  // 로그인 화면 등에서 호출 — 조건 맞을 때만 설치 카드 노출
  function pwaMaybeShowPromo(){
    var promo = document.getElementById('installPromo');
    if(!promo) return;
    var p = platform();

    // 이미 설치됨 / PC 브라우저 → 노출 안 함(과다 노출 방지)
    if(isStandalone() || p === 'desktop'){ promo.style.display = 'none'; return; }
    // '나중에 하기' 유예 중 → 노출 안 함
    if(dismissedRecently()){ promo.style.display = 'none'; return; }

    var hint = document.getElementById('installPromoHint');
    var btn  = document.getElementById('installPromoBtn');
    if(p === 'ios'){
      if(hint) hint.textContent = '공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택해 주세요.';
      if(btn)  btn.textContent = '홈화면에 설치하기';
    } else if(p === 'inapp'){
      // 카카오톡 등 인앱 브라우저: 바로 기본 브라우저로 열어 설치하게 유도
      if(hint) hint.textContent = '카카오톡에서는 바로 설치가 안 돼요. 아래 버튼을 누르면 기본 브라우저(Chrome/Safari)로 열립니다. 그 화면에서 다시 “홈화면에 설치하기”를 누르세요.';
      if(btn)  btn.textContent = '🌐 다른 브라우저로 열기';
    } else {
      // 진단: 미설치 + beforeinstallprompt 미발생(크롬이 설치 조건을 아직 안 줌)
      if(hint) hint.textContent = getPrompt()
        ? '설치 버튼을 누르면 홈화면에 앱 아이콘이 추가됩니다.'
        : '설치 버튼을 눌러도 창이 안 뜨면, 브라우저 메뉴(⋮)의 “앱 설치”를 이용해 주세요. (설치 준비 중이거나 이 브라우저가 자동 설치를 지원하지 않습니다)';
      if(btn)  btn.textContent = '홈화면에 설치하기';
    }
    promo.style.display = 'block';
  }

  // 설치 버튼 클릭
  function pwaInstall(){
    var p = platform();

    // iOS: 자동설치 불가 → 안내 모달
    if(p === 'ios'){ showIosInstall(); return; }

    // 인앱 브라우저: 버튼 한 번으로 기본 브라우저를 바로 연다(수동 메뉴 탐색 불필요)
    if(p === 'inapp'){
      openExternalInApp();
      return;
    }

    // Android/기타: 캡처된 설치 프롬프트가 있으면 네이티브 설치 팝업
    var prompt = getPrompt();
    if(prompt && typeof prompt.prompt === 'function'){
      prompt.prompt();
      var uc = prompt.userChoice;
      if(uc && uc.then){
        uc.then(function(res){
          if(res && res.outcome === 'accepted'){
            if(typeof toast === 'function') toast('🎉 홈화면에 추가되었습니다!');
            hidePromo();
          }
          captured = null; window.deferredPrompt = null; window.deferredInstallPrompt = null;
        }).catch(function(){});
      }
      return;
    }

    // 프롬프트가 아직 준비 안 됨(설치 조건 미충족/이미 설치 등)
    if(isStandalone()){ if(typeof toast === 'function') toast('이미 설치되어 있어요'); return; }
    alert('설치 방법\n1. 브라우저 오른쪽 위 메뉴(⋮) 열기\n2. “앱 설치” 또는 “홈 화면에 추가” 선택\n3. 홈 화면의 PAT 아이콘으로 실행');
  }

  // 인앱 브라우저(카카오톡 등)에서 '기본 브라우저(Chrome/Safari)로 바로 열기'
  //  · 카카오톡: 전용 스킴 kakaotalk://web/openExternal 로 외부 브라우저를 즉시 실행
  //    (사용자가 오른쪽 위 메뉴를 직접 찾을 필요 없음)
  //  · 라인: ?openExternalBrowser=1 파라미터
  //  · 그 외 안드로이드 인앱(페북/인스타 등): Chrome intent (미설치 시 기본 브라우저 폴백)
  //  · iOS 기타 인앱: 강제 불가(정책) → 안내만
  // (순수함수) 인앱 UA + 현재 URL → 외부 브라우저로 여는 목적지 URL. iOS 기타는 null.
  function externalOpenTarget(u, url){
    if(/KAKAOTALK/i.test(u)){
      return 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    }
    if(/Line/i.test(u)){
      return url + (url.indexOf('?') > -1 ? '&' : '?') + 'openExternalBrowser=1';
    }
    if(/Android/i.test(u)){
      var noScheme = url.replace(/^https?:\/\//, '');
      return 'intent://' + noScheme +
        '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' +
        encodeURIComponent(url) + ';end';
    }
    return null; // iOS 기타 인앱(페북/인스타 등)은 외부 브라우저 강제 실행 불가
  }

  function openExternalInApp(){
    var url = location.href.split('#')[0];   // 해시 제거한 깨끗한 URL(쿼리=초대링크는 보존)
    var u = ua();
    var target = externalOpenTarget(u, url);

    // iOS 기타 인앱(페북/인스타 등): 외부 브라우저 강제 실행 불가 → 안내만
    if(!target){
      alert('오른쪽 위(또는 아래) 메뉴에서 “Safari로 열기”를 선택해 주세요.\n그 뒤 “홈화면에 설치하기”를 누르면 됩니다.');
      return;
    }

    // 외부 브라우저가 실제로 열리면 이 페이지는 백그라운드로 전환됨(document.hidden=true).
    // 그걸 감지해 성공 여부 판단 → 스킴이 안 먹는 기기에서는 수동 안내로 폴백.
    var opened = false;
    var onHide = function(){ if(document.hidden) opened = true; };
    document.addEventListener('visibilitychange', onHide);

    if(/KAKAOTALK/i.test(u) && typeof toast === 'function') toast('기본 브라우저로 여는 중…');
    try { location.href = target; } catch(e) {}

    setTimeout(function(){
      document.removeEventListener('visibilitychange', onHide);
      if(!opened && !document.hidden){
        // 자동 전환 실패 → 수동 방법 안내(최후 폴백)
        alert('자동 전환이 안 되면,\n오른쪽 위 메뉴(⋮ 또는 …)에서 “다른 브라우저로 열기”를 선택해 주세요.\n그 뒤 “홈화면에 설치하기”를 누르면 됩니다.');
      }
    }, 1600);
  }

  function pwaInstallLater(){
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch(e){}
    hidePromo();
    if(typeof toast === 'function') toast('필요할 때 다시 안내할게요');
  }

  function hidePromo(){
    var promo = document.getElementById('installPromo');
    if(promo) promo.style.display = 'none';
  }
  function showIosInstall(){
    var m = document.getElementById('iosInstallModal');
    if(m) m.style.display = 'flex';
  }
  function closeIosInstall(){
    var m = document.getElementById('iosInstallModal');
    if(m) m.style.display = 'none';
  }

  // beforeinstallprompt 캡처 (Android Chrome) → 설치 카드 노출
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    captured = e;
    window.deferredPrompt = e;   // 기존 코드 호환
    pwaMaybeShowPromo();
  });
  // 설치 완료 → 카드 숨김
  window.addEventListener('appinstalled', function(){
    captured = null; window.deferredPrompt = null; window.deferredInstallPrompt = null;
    hidePromo();
    if(typeof toast === 'function') toast('🎉 홈화면에 추가되었습니다!');
  });

  // 초기 진입 시(로그인 화면) 노출 시도 — iOS/인앱은 이벤트가 없으므로 여기서 판단
  window.addEventListener('load', function(){ setTimeout(pwaMaybeShowPromo, 300); });

  // 전역 노출
  window.pwaInstall = pwaInstall;
  window.pwaInstallLater = pwaInstallLater;
  window.pwaMaybeShowPromo = pwaMaybeShowPromo;
  window.showIosInstall = showIosInstall;
  window.closeIosInstall = closeIosInstall;
  window.externalOpenTarget = externalOpenTarget;   // 테스트용 노출
})();
