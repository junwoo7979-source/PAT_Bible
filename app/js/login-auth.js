// ====== PAT Bible — login-auth.js (v131) ======
// 가족방 로그인 판정(순수 함수). DOM/네트워크 없이 테스트 가능.
//
// [구조 원칙]
//  · 교회 코드 = 교회 식별용. 절대 가족방/구역방 인증 수단으로 쓰지 않는다.
//  · 가족 비밀번호 = 유일한 입장 인증 수단.
//  · 교회 미선택이면 입력값은 '교회 코드'로만 해석(교회 선택), 입장은 하지 않는다.
//  · 교회 선택됨이면 입력값은 '가족 비밀번호'로만 해석. 단, 입력이 교회코드와
//    같으면 거부(REJECT_CHURCHCODE) — 교회코드로는 입장 불가.
//
// 반환 action:
//  NEED_CHURCH_CODE | SELECT_CHURCH(code) | NEED_FAMILY_PW
//  REJECT_CHURCHCODE | AUTH_FAMILY_PW(password)
(function(root){
  function loginDecision(churchCode, input){
    const raw = (input == null ? '' : String(input)).trim();
    const cc  = (churchCode == null ? '' : String(churchCode)).trim();

    // 교회 미선택 → 교회 코드 입력 단계
    if(!cc){
      if(!raw) return { action:'NEED_CHURCH_CODE' };
      return { action:'SELECT_CHURCH', code: raw };
    }
    // 교회 선택됨 → 가족 비밀번호 인증 단계
    if(!raw) return { action:'NEED_FAMILY_PW' };
    if(raw === cc) return { action:'REJECT_CHURCHCODE' };   // 교회코드로는 입장 금지
    return { action:'AUTH_FAMILY_PW', password: raw };
  }

  // 서버 findFamily 스코프 규칙의 순수 복제(문서/테스트용):
  //  · myFamilyId 있으면 그 방의 비번과 일치할 때만 통과(다른 가정 비번 차단)
  //  · myFamilyId 없으면 교회 내 비번 일치 방을 전역 검색
  //  families: [{ id, familyPassword, churchCode }]
  function resolveFamilyByPassword(families, churchCode, password, myFamilyId){
    const list = Array.isArray(families) ? families : [];
    const inChurch = list.filter(f => f && f.churchCode === churchCode);
    if(myFamilyId){
      const mine = inChurch.find(f => f.id === myFamilyId);
      if(mine && mine.familyPassword === password) return mine;
      return null;                       // 내 가족 외에는 절대 통과 못 함
    }
    return inChurch.find(f => f.familyPassword === password) || null;
  }

  const api = { loginDecision, resolveFamilyByPassword };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(root){ root.loginDecision = loginDecision; root.resolveFamilyByPassword = resolveFamilyByPassword; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
