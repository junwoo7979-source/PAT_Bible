// ====== PAT Bible — signup.js ======
// 일반 사용자 회원가입 (간략): 이메일 1필드 + 개인정보 동의(형식적) + 가입 버튼.
// 가입 → 이메일을 localStorage(pat_signup_email)에 임시 저장 → 가족방(#/family)으로 이동.
// ★ 기존 교회코드+가족비밀번호 로그인은 전혀 건드리지 않는다(별도 진입 경로).
// ★ 관리자 계정 생성 경로 아님 — 여기서는 Firebase Auth 계정을 만들지 않는다.

(function () {
  'use strict';

  // 표준 이메일 형식 검증(과하지 않게, 실사용 오탐 최소화)
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
  }

  // 실시간 안내 갱신
  function updateSignupHint() {
    var inp = document.getElementById('signupEmail');
    var hint = document.getElementById('signupEmailHint');
    if (!inp || !hint) return;
    var v = inp.value.trim();
    if (!v) {
      hint.textContent = '가입에 사용할 이메일을 입력하세요';
      hint.style.color = 'var(--muted)';
      return;
    }
    if (isValidEmail(v)) {
      hint.textContent = '✓ 사용 가능한 형식입니다';
      hint.style.color = 'var(--accent)';
    } else {
      hint.textContent = '이메일 형식이 올바르지 않습니다 (예: name@example.com)';
      hint.style.color = 'var(--danger)';
    }
  }

  // 가입 처리
  function submitSignup() {
    var emailEl = document.getElementById('signupEmail');
    var agreeEl = document.getElementById('signupAgree');
    var email = (emailEl && emailEl.value || '').trim();

    if (!email) { toast('이메일을 입력하세요'); if (emailEl) emailEl.focus(); return; }
    if (!isValidEmail(email)) { toast('이메일 형식이 올바르지 않습니다'); if (emailEl) emailEl.focus(); return; }
    if (agreeEl && !agreeEl.checked) { toast('개인정보 처리방침에 동의해주세요'); return; }

    // 중복 제출 방지
    var btn = document.getElementById('signupSubmitBtn');
    if (btn) { if (btn.dataset.busy === '1') return; btn.dataset.busy = '1'; btn.disabled = true; }

    try {
      localStorage.setItem('pat_signup_email', email.toLowerCase());
      // 가입 시각(참고용, 서버 저장은 가족 등록 시 email 필드로 이뤄짐)
      localStorage.setItem('pat_signup_at', new Date().toISOString());
    } catch (e) {}

    // ★ 2026-07-17: 이메일 가입자는 교회코드 입력 단계가 없어 교회 컨텍스트가 비어 있고,
    //   그 상태로는 가족방 생성(saveFamily)이 불가능하다. 기존 세광 폴백 관례
    //   (app-core.js 구버전 프로필 폴백)와 동일하게 기본 교회를 적용한다.
    try {
      if (typeof adoptChurch === 'function' && !(window.DB && DB.church && DB.church.code)) {
        adoptChurch('11111', '세광교회');
      }
    } catch (e) {}

    toast('가입 완료 — 가족방을 만들어 시작하세요');

    // 가족방으로 이동. 라우터가 있으면 해시 경로로, 없으면 기존 화면 전환으로 폴백.
    setTimeout(function () {
      if (window.PAT_ROUTER && typeof PAT_ROUTER.go === 'function') {
        PAT_ROUTER.go('/family');
      } else if (typeof go === 'function') {
        go('s-family');
      }
      if (btn) { btn.dataset.busy = '0'; btn.disabled = false; }
    }, 350);
  }

  // 회원가입 화면 진입 시 이전 입력 정리
  function resetSignupForm() {
    var emailEl = document.getElementById('signupEmail');
    var agreeEl = document.getElementById('signupAgree');
    if (emailEl) emailEl.value = '';
    if (agreeEl) agreeEl.checked = false;
    updateSignupHint();
  }

  window.isValidSignupEmail = isValidEmail;
  window.updateSignupHint = updateSignupHint;
  window.submitSignup = submitSignup;
  window.resetSignupForm = resetSignupForm;
})();
