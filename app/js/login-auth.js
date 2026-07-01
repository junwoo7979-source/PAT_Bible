// ====== PAT Bible — login-auth.js ======
//
// [목적]
//  PAT Bible의 2단계 로그인 로직을 순수 함수로 구현.
//  DOM/네트워크 호출 없어 단위 테스트 가능하고, 로그인 상태에 따라
//  다음 행동을 결정한다.
//
// [설계 원칙]
//  1. 교회코드(churchCode) ≠ 방 비밀번호(familyPassword)
//     - 교회코드: 교회 선택(인증 아님)
//     - 방 비밀번호: 방 입장(유일한 인증 수단)
//
//  2. 2단계 로그인 흐름
//     STEP 1: churchCode === '' (미선택)
//             → 입력값을 교회코드로 해석, 검증
//             → 성공 시 adoptChurch()로 DB.church.code 설정
//
//     STEP 2: churchCode !== '' (선택됨)
//             → 입력값을 방 비밀번호로 해석
//             → 교회코드와 동일하면 거부(보안)
//             → 서버 findFamilyByPassword()로 방 조회
//
//  3. myFamilyId 스코핑
//     - 재입장: myFamilyId 있음 → 내 방만 검색 (다른 방 비번 차단)
//     - 처음:   myFamilyId 없음 → 전체 검색 (처음 발견하는 방)
//
// [반환 action 타입]
//  - NEED_CHURCH_CODE: 교회 코드 입력 필요
//  - SELECT_CHURCH(code): 교회 선택 시도 (code 전달)
//  - NEED_FAMILY_PW: 가족 비밀번호 입력 필요
//  - REJECT_CHURCHCODE: 교회코드로 입장 시도 (거부)
//  - AUTH_FAMILY_PW(password): 비밀번호 인증 (password 전달)
//
// [참고]
//  전체 아키텍처는 ARCHITECTURE.md 참조
(function(root){
  /**
   * loginDecision(churchCode, input) → LoginAction
   *
   * [목적]
   *  로그인 상태와 입력값을 기반으로 다음 행동을 결정한다.
   *  이 함수는 DOM/네트워크를 호출하지 않아 순수하고, 테스트 가능하다.
   *
   * [입력]
   *  churchCode: string
   *    - '' (빈 값):  교회 미선택 상태
   *    - '11111' 등:  이미 교회 선택됨
   *
   *  input: string (사용자가 입력한 값)
   *
   * [반환]
   *  { action: string, code?: string, password?: string }
   *
   * [로직]
   *  IF churchCode === '':
   *    교회 미선택 → 입력값을 교회코드로 해석
   *    IF input === '' → NEED_CHURCH_CODE
   *    ELSE           → SELECT_CHURCH (서버 검증 필요)
   *
   *  IF churchCode !== '':
   *    교회 선택됨 → 입력값을 방 비밀번호로 해석
   *    IF input === ''           → NEED_FAMILY_PW
   *    IF input === churchCode   → REJECT_CHURCHCODE (보안: 교회코드 재입력 거부)
   *    ELSE                      → AUTH_FAMILY_PW (서버 검증 필요)
   *
   * [예시]
   *  loginDecision('', '')        → { action: 'NEED_CHURCH_CODE' }
   *  loginDecision('', '11111')   → { action: 'SELECT_CHURCH', code: '11111' }
   *  loginDecision('11111', '')   → { action: 'NEED_FAMILY_PW' }
   *  loginDecision('11111', '11111') → { action: 'REJECT_CHURCHCODE' } (차단)
   *  loginDecision('11111', 'pw123') → { action: 'AUTH_FAMILY_PW', password: 'pw123' }
   */
  function loginDecision(churchCode, input){
    const raw = (input == null ? '' : String(input)).trim();
    const cc  = (churchCode == null ? '' : String(churchCode)).trim();

    // ── STEP 1: 교회 미선택 (cc === '') ──
    if(!cc){
      if(!raw) return { action:'NEED_CHURCH_CODE' };
      // 입력값을 교회코드로 해석 → 서버에서 checkChurchCode()로 검증
      return { action:'SELECT_CHURCH', code: raw };
    }

    // ── STEP 2: 교회 선택됨 (cc !== '') ──
    if(!raw) return { action:'NEED_FAMILY_PW' };

    // 입력값을 방 비밀번호로 해석 → 서버에서 findFamilyByPassword()로 검증
    // ★ 2026-07-01 제거: 교회코드와 비밀번호가 같을 수 있음 (예: 013579)
    //   서버에서 어차피 검증하니 클라이언트 중복 체크 제거
    return { action:'AUTH_FAMILY_PW', password: raw };
  }

  /**
   * resolveFamilyByPassword(families, churchCode, password, myFamilyId) → Family | null
   *
   * [목적]
   *  비밀번호로 가족방을 찾되, **내 방 격리 원칙**을 지킨다.
   *  이는 Cloud Functions의 findFamily() 로직과 동일하며,
   *  문서/테스트용 순수 함수다.
   *
   * [입력]
   *  families: Array<{ id, familyPassword, churchCode, ... }>
   *    서버에서 가져온 가족 목록
   *
   *  churchCode: string
   *    현재 교회코드 (필터 조건)
   *
   *  password: string
   *    찾을 비밀번호
   *
   *  myFamilyId?: string (선택)
   *    현재 로그인한 방의 ID
   *    - 있으면: 재입장 → 내 방만 검색
   *    - 없으면: 처음 입장 → 전체 검색
   *
   * [반환]
   *  - myFamilyId 있을 때:
   *    내 방의 비번이 일치하면 내 방 반환
   *    다른 방은 일치해도 null (접근 차단)
   *
   *  - myFamilyId 없을 때:
   *    비번이 일치하는 첫 번째 방 반환
   *    (새 기기의 첫 입장)
   *
   * [예시]
   *  families = [
   *    { id: 'f1', churchCode: '11111', familyPassword: 'pw1' },
   *    { id: 'f2', churchCode: '11111', familyPassword: 'pw2' }
   *  ]
   *
   *  // 재입장 (내 방 확정)
   *  resolveFamilyByPassword(families, '11111', 'pw1', 'f1')
   *  → families[0] (내 방)
   *
   *  resolveFamilyByPassword(families, '11111', 'pw2', 'f1')
   *  → null (다른 방 비번으로는 못 들어감)
   *
   *  // 처음 입장 (아직 familyId 미할당)
   *  resolveFamilyByPassword(families, '11111', 'pw1', undefined)
   *  → families[0] (첫 번째로 일치하는 방)
   */
  function resolveFamilyByPassword(families, churchCode, password, myFamilyId){
    const list = Array.isArray(families) ? families : [];

    // 교회 격리: 현재 교회의 방들만 필터
    const inChurch = list.filter(f => f && f.churchCode === churchCode);

    if(myFamilyId){
      // ── 재입장 모드: 내 방만 검색 ──
      // 내 방의 비번이 일치하면 반환, 다른 방은 절대 통과 안 함
      const mine = inChurch.find(f => f.id === myFamilyId);
      if(mine && mine.familyPassword === password) return mine;
      return null;  // 내 방 외에는 일치해도 차단
    }

    // ── 처음 입장 모드: 전체 검색 ──
    // 비밀번호가 일치하는 첫 번째 방을 반환
    // 새 기기/구성원이 처음 입장할 때 이 경로를 거침
    return inChurch.find(f => f.familyPassword === password) || null;
  }

  const api = { loginDecision, resolveFamilyByPassword };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(root){ root.loginDecision = loginDecision; root.resolveFamilyByPassword = resolveFamilyByPassword; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
