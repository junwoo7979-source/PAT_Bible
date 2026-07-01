// ====== PAT Bible — app-core.js ======
// 전역 상태(DB), 화면 전환(go), 인증, 공통 유틸리티

// ── 전역 데이터 ───────────────────────────────────────────
const DB = {
  // ★ 중립 시작: 기본 교회 미선택(브랜딩 "PAT Bible"). 교회는 코드 입력/관리자 로그인으로 선택.
  church: { name:'', code:'', memberCount:0 },
  verse: { ref:'요한복음 3:16', weekOf:'2026년 6월 1주차 · 6월 1일 월요일 ~ 6월 7일 일요일',
    text:'하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라' },
  worship: null,  // { title, content } — 관리자가 입력, 전 성도 동기화
  members: [
    { name:'아빠', done:false }, { name:'엄마', done:false },
    { name:'나', done:false, me:true }, { name:'동생', done:false }
  ]
};

// 검증 임계값
let LENIENT = false;
const TH = () => LENIENT ? { voice:80, typing:100 } : { voice:85, typing:100 };

// ── localStorage 헬퍼 ─────────────────────────────────────
function loadRec(){ try{ return JSON.parse(localStorage.getItem('pat_records')||'[]'); }catch(e){ return []; } }
function saveRec(r){ localStorage.setItem('pat_records', JSON.stringify(r)); }
function loadVerses(){ try{ return JSON.parse(localStorage.getItem('pat_verses')||'[]'); }catch(e){ return []; } }
function saveVerses(v){ localStorage.setItem('pat_verses', JSON.stringify(v)); }

// ── 교구/목장 그룹 설정 ───────────────────────────────────
// 교회별 설정이 없으면 기본값(세광 호환: 교구 1·2·3 + 블레싱)으로 폴백.
const PARISH_DEFAULT = { term: '교구', groups: ['1교구','2교구','3교구','블레싱'] };
// 한글 인코딩 깨짐(mojibake) 감지 — 교구명에 대체문자(U+FFFD '�') 또는
// CJK 통합 한자(U+4E00–U+9FFF: 한국 교회 교구명엔 거의 안 쓰임)가 섞이면
// 깨진 값으로 간주. 깨진 parishConfig가 교구 집계 매칭을 망가뜨리는 것 방지.
function _isBrokenParishText(s){
  return /[�一-鿿]/.test(String(s == null ? '' : s));
}
function _parishConfigBroken(cfg){
  if(!cfg || typeof cfg !== 'object') return false;
  const groups = Array.isArray(cfg.groups) ? cfg.groups : [];
  return _isBrokenParishText(cfg.term) || groups.some(_isBrokenParishText);
}
function getParishConfig(){
  try {
    const raw = localStorage.getItem('pat_parish_config');
    if(raw){
      const c = JSON.parse(raw);
      // ★ 깨진 캐시 방어: mojibake가 섞였으면 캐시 삭제 후 기본값으로 폴백
      if(_parishConfigBroken(c)){
        try { localStorage.removeItem('pat_parish_config'); } catch(e){}
        return { term: PARISH_DEFAULT.term, groups: PARISH_DEFAULT.groups.slice() };
      }
      const groups = Array.isArray(c && c.groups) ? c.groups.map(g=>String(g).trim()).filter(Boolean) : [];
      if(groups.length) return { term: (c.term && String(c.term).trim()) || '교구', groups };
    }
  } catch(e){}
  return { term: PARISH_DEFAULT.term, groups: PARISH_DEFAULT.groups.slice() };
}

// ── 앱 제목 / 교회명 ──────────────────────────────────────
const APP_TITLE_DEFAULT = 'PAT Bible';
function applyAppTitle(){
  // ★ 중립 시작: 교회 미선택 상태면 옛 캐시(세광 등) 무시하고 무조건 "PAT Bible".
  //   (타 교회가 설치/입장 전엔 특정 교회 브랜딩이 보이지 않게)
  let title = (DB.church && DB.church.code)
    ? (localStorage.getItem('pat_app_title') || APP_TITLE_DEFAULT)
    : APP_TITLE_DEFAULT;
  // 깨진 데이터(대체 문자 U+FFFD '�') 제거
  if(title && title.includes('�')) {
    console.warn('[PAT] 깨진 appTitle 발견, 초기화:', title);
    localStorage.removeItem('pat_app_title');
    title = APP_TITLE_DEFAULT;
  }
  document.getElementById('loginAppTitle').textContent = title;
  return title;
}
function applyCloudConfig(config){
  if(!config) return;
  if(config.verse) {
    DB.verse = { ref:config.verse.ref, text:config.verse.text, weekOf:config.verse.weekOf };
    saveVerses([DB.verse]);
  }
  // ✝️ 예배 안내 (교회 공통, 서버가 단일 진실 소스)
  if(config.worship !== undefined){
    DB.worship = config.worship || null;
    try { localStorage.setItem('pat_worship', JSON.stringify(DB.worship)); } catch(e){}
  }
  // ★ 교구별 전체인원: 서버(config)가 단일 진실 소스 → 모든 기기 localStorage 에 미러링.
  //   (관리자/성도 어느 기기든 동일한 분모를 보게 되어 관리자↔대시보드 불일치 해소)
  if(config.parishTotals && typeof config.parishTotals === 'object'){
    try { localStorage.setItem('pat_admin_parish_edit', JSON.stringify(config.parishTotals)); } catch(e){}
  }
  // ★ 교회별 교구/그룹 설정도 미러링 (없으면 기본 1·2·3교구+블레싱으로 폴백 — getParishConfig())
  //   단, 서버값이 깨진(mojibake) 경우 미러링하지 않음 → 교구 집계 매칭 깨짐 방지.
  if(config.parishConfig && typeof config.parishConfig === 'object'){
    if(typeof _parishConfigBroken === 'function' && _parishConfigBroken(config.parishConfig)){
      console.warn('[PAT] 깨진 parishConfig 무시(서버 데이터 손상):', config.parishConfig);
      try { localStorage.removeItem('pat_parish_config'); } catch(e){}
    } else {
      try { localStorage.setItem('pat_parish_config', JSON.stringify(config.parishConfig)); } catch(e){}
    }
  }
  if(Object.prototype.hasOwnProperty.call(config, 'appTitle')) {
    const title = (config.appTitle || '').trim();
    // 깨진 문자(대체 문자 U+FFFD) 확인
    if(title && !title.includes('�')) {
      localStorage.setItem('pat_app_title', title);
      applyAppTitle();
      console.log('[PAT] Cloud appTitle 적용:', title);
    } else if(title) {
      console.warn('[PAT] 깨진 appTitle 무시:', title);
    }
  }
}
function applyStoredData(){
  console.log('[PAT-STARTUP] applyStoredData 시작');

  // BUG-L01 FIX: ?reset=1 을 localStorage 확인보다 먼저 처리
  const params = new URLSearchParams(window.location.search);
  if(params.has('reset')){
    console.log('[PAT] ?reset=1 감지 — localStorage 초기화 → 로그인 화면');
    // ★ 사용자 데이터는 reset에서도 절대 삭제하지 않는다(데이터 초기화 재발 방지).
    //   가족·기기ID·미션기록·기도·통독·암송세션·교회·스트릭은 모두 보존하고,
    //   임시 UI/세션성 키만 제거한다. (?reset 목적 = 화면을 로그인으로 되돌리는 것이지
    //    사용자 데이터를 파괴하는 것이 아님)
    const keepPrefixes = [
      'pat_family','pat_leader_family','pat_device_id','pat_records',
      'pat_prayer','pat_read_done','pat_memorize','pat_church_code','pat_streak',
      'pat_hist',  // ★ 수행 기록(history) 로컬 미러 — reset에서도 절대 삭제 금지
      'pat_rooms'  // ★ 2단계: 내 방 목록 — reset에서도 보존
    ];
    try {
      const allKeys = [];
      for (let i = 0; i < localStorage.length; i++) allKeys.push(localStorage.key(i));
      allKeys.forEach(k => {
        if (!k) return;
        const keep = keepPrefixes.some(p => k.indexOf(p) === 0);
        if (!keep) localStorage.removeItem(k);
      });
    } catch(e) {}
    window.history.replaceState({}, document.title, window.location.pathname);
    go('s-login');
    setTimeout(() => completeAppInitialization(), 50);
    return;
  }

  // ★ 멀티 교회 + 중립 시작: 저장된 교회 코드 복원.
  //   - 코드 저장됨(신규 사용자) → 그 교회
  //   - 코드 없지만 가족/관리자 데이터 있음(멀티교회 이전 기존 사용자) → 세광 11111 폴백(회귀 방지)
  //   - 그 외(신규 방문자) → 중립(code 빈 값) → "교회 코드를 입력하세요" 화면
  try {
    const savedCode = localStorage.getItem('pat_church_code');
    if(savedCode) DB.church.code = savedCode;
    else if(loadFamilyProfile()) DB.church.code = '11111'; // 멀티교회 이전 세광 교인 회귀
  } catch(e) {}

  // ★ 개발자 통계 숨김 진입: ?dev=1 → 개발자 통계 화면 (일반 라우팅 건너뜀)
  if(params.has('dev')){
    go('s-dev-stats');
    try {
      const t = localStorage.getItem('pat_dev_token');
      if(t){ const el = document.getElementById('devStatsToken'); if(el) el.value = t; setTimeout(()=>{ if(typeof devStatsLoad==='function') devStatsLoad(); }, 200); }
    } catch(e) {}
    return;
  }

  // ★ 날짜 기반 암송 세션 초기화 (페이지 로드 시 실행)
  if(typeof checkAndResetByDate === 'function'){
    checkAndResetByDate();
  }

  // ✨ 최적화: localStorage 동기적 확인 후 바로 최종 화면으로 이동
  const initialScreen = determineInitialScreen();
  go(initialScreen, true, false);

  // 백그라운드에서 나머지 초기화 수행
  setTimeout(() => completeAppInitialization(), 50);
}

function determineInitialScreen(){
  // localStorage 빠른 확인
  try {
    // ★ 로그인 화면에 머무르려는 의도(세션) → 자동 로그인 건너뜀
    //   (로그인 화면에서 새로고침/당겨서 새로고침 시 가족화면으로 튕기던 오류 방지)
    if(sessionStorage.getItem('pat_stay_login')) return 's-login';
    const familyProfile = localStorage.getItem('pat_family_profile');
    const adminId = localStorage.getItem('pat_admin_id');
    const adminPw = localStorage.getItem('pat_admin_pw');

    // 저장된 가족방이 있으면 가족방으로 (교인은 자동 입장 — 편의)
    if(familyProfile){
      console.log('[PAT-STARTUP] 저장된 가족방 복원');
      return 's-family';
    }
    // ★ 관리자는 "앱을 새로 열면"(새 세션) 자동 진입하지 않고 로그인 화면.
    //   단 같은 세션 내 새로고침은 유지(pat_admin_session). → "열면 로그인된 채" 방지 + 작업 중 안 튕김.
    if(adminId && adminPw && sessionStorage.getItem('pat_admin_session')){
      console.log('[PAT-STARTUP] 관리자 세션 유지');
      return 's-admin';
    }
  } catch(e) {
    console.error('[PAT] localStorage 확인 중 오류:', e.message);
  }

  // 기본값: 로그인 페이지
  console.log('[PAT-STARTUP] 로그인 페이지 표시');
  return 's-login';
}

function completeAppInitialization(){
  console.log('[PAT-STARTUP] completeAppInitialization 시작 (백그라운드)');

  // ── localStorage 접근 가능 여부 확인 ──
  let lsAvailable = false;
  try {
    localStorage.setItem('_pat_test', '1');
    localStorage.removeItem('_pat_test');
    lsAvailable = true;
  } catch(e) {
    console.error('[PAT] localStorage 접근 불가:', e.message);
  }

  if(!lsAvailable){
    console.warn('[PAT] localStorage 미사용 가능 — 로컬 모드로 진행');
    return;
  }

  // ── localStorage 상태 진단 ──
  const familyProfileRaw = localStorage.getItem('pat_family_profile');
  const adminId = localStorage.getItem('pat_admin_id');
  const adminPw = localStorage.getItem('pat_admin_pw');
  const churchName = localStorage.getItem('pat_church_name');
  const lsKeys = [];
  for(let i=0; i<localStorage.length; i++) {
    lsKeys.push(localStorage.key(i));
  }

  console.log('[PAT-STARTUP] localStorage 상태:', {
    hasFamily: !!familyProfileRaw,
    hasAdmin: !!(adminId && adminPw),
    church: churchName || 'N/A',
    keys: lsKeys.slice(0, 5) // 처음 5개만 로그
  });

  applyAppTitle();
  const cn = localStorage.getItem('pat_church_name');
  if(cn) DB.church.name = cn;
  const vs = loadVerses();
  if(vs.length){ DB.verse = { ref:vs[0].ref, weekOf:vs[0].weekOf, text:vs[0].text }; }
  checkInviteParam();

  // ─── 저장된 상태 복원 ───
  let initialScreen = 's-login';
  let reason = '초기 상태';

  // ★ 로그인 화면 유지 의도면 자동 라우팅 건너뜀(새로고침 시 가족화면 튕김 방지)
  let _stayLogin = false;
  try { _stayLogin = !!sessionStorage.getItem('pat_stay_login'); } catch(e) {}

  // 1️⃣ 저장된 가족방이 있으면 가족방으로 이동
  // ★ 중대버그 수정: familyId는 프로필 객체가 아니라 별도 키(pat_family_id)에 저장된다.
  //   기존 조건 savedFamily.familyId 는 항상 undefined → 가족이 있어도 관리자로 튕기던 원인.
  //   determineInitialScreen 과 동일하게 "프로필 존재"만으로 가족방 우선.
  const savedFamily = loadFamilyProfile();
  if(_stayLogin){
    initialScreen = 's-login';
    reason = '로그인 화면 유지';
  }
  else if(savedFamily){
    console.log('[PAT-STARTUP] 가족방 발견:', {
      familyId: localStorage.getItem('pat_family_id') || '(미동기화)',
      roomName: savedFamily.roomName,
      members: savedFamily.members ? savedFamily.members.length : 0
    });
    initialScreen = 's-family';
    reason = '저장된 가족방 복원';
  }
  // ★ 관리자: 같은 세션(새로고침)만 유지, 새로 열면 로그인 화면.
  else if(adminId && adminPw && (function(){ try { return !!sessionStorage.getItem('pat_admin_session'); } catch(e){ return false; } })()){
    initialScreen = 's-admin';
    reason = '관리자 세션 유지';
  }

  console.log('[PAT-STARTUP] 초기 화면 진입:', initialScreen, `(${reason})`);

  // 로그인 화면이 이미 active이므로, 다른 화면으로 이동할 때만 go() 호출
  if(initialScreen !== 's-login'){
    go(initialScreen, true, false);
  }

  // ★ 암송 진행 상태 복원 — 모바일 새로고침/앱 재실행 시 진행 중이던 단계와
  //   이미 완료한 미션 데이터를 그대로 복원해 화면에 보여준다.
  //   (가족방으로 복원되는 회원에 한해 적용. DB.verse가 위에서 로드된 뒤 호출됨)
  if(initialScreen === 's-family' && typeof applyRestoredMemorizeScreen === 'function'){
    try { applyRestoredMemorizeScreen(); } catch(e){ console.error('[PAT-PROGRESS] 복원 중 오류:', e.message); }
  }

  initFirebase();
}
async function initFirebase(){
  if(!window.PAT_DB) return;
  const ok = PAT_DB.init();
  if(!ok){ console.log('[PAT] 로컬 모드'); return; }
  console.log('[PAT] Firebase 모드 활성화');

  // ★ 중립 시작: 선택된 교회가 없으면 어떤 교회 설정도 로드하지 않음(세광 자동표시 방지)
  if(!DB.church.code){ console.log('[PAT] 교회 미선택 — 설정 로드 보류'); return; }
  await loadChurchConfig();
}

// 선택된 교회의 설정(구절·제목) 로드 + 폴링 구독 — 교회 선택/전환 시 호출
async function loadChurchConfig(){
  if(!window.PAT_DB || !PAT_DB.ready() || !DB.church.code) return;
  const config = await PAT_DB.getConfig(DB.church.code);
  if(config && config.appTitle) DB.church.name = config.appTitle;
  if(config && config.worship !== undefined){
    DB.worship = config.worship || null;
    try { localStorage.setItem('pat_worship', JSON.stringify(DB.worship)); } catch(e){}
  }
  let cloudVerse = config && config.verse ? config.verse : null;
  if(!cloudVerse && PAT_DB.getLatestVerse) {
    cloudVerse = await PAT_DB.getLatestVerse(DB.church.code);
  }
  if(cloudVerse) {
    applyCloudConfig({ appTitle: config ? config.appTitle : undefined, verse: cloudVerse });
    console.log('[PAT] Firebase 구절 로드됨:', DB.verse.ref);
  } else {
    // 구절 미등록 교회로 전환 → 이전 교회/샘플 구절이 남지 않도록 비움
    DB.verse = { ref:'', text:'', weekOf:'' };
  }
  // 설정 폴링 구독 (구절 + 앱제목) — subscribeConfig 가 이전 구독을 정리하므로 전환 시 재호출 안전
  PAT_DB.subscribeConfig(DB.church.code, config => {
    applyCloudConfig(config);
    const activeId = document.querySelector('.screen.active')?.id;
    if(activeId==='s-family') renderFamily();
    else if(activeId==='s-verse') renderVerse();
    else if(activeId==='s-worship' && typeof renderWorship==='function') renderWorship();
    else if(activeId==='s-admin') renderAdmin();
    toast('📖 설정이 업데이트됐습니다');
    console.log('[PAT] 설정 업데이트 감지:', config);
  });
}

// ── 관리자 ────────────────────────────────────────────────
const ADMIN = { id:'admin', pw:'1234' };

function isAdminLoggedIn() {
  return localStorage.getItem('pat_admin_logged_in') === 'true';
}

function setAdminLoggedIn(logged) {
  if (logged) {
    localStorage.setItem('pat_admin_logged_in', 'true');
  } else {
    localStorage.removeItem('pat_admin_logged_in');
  }
}

// ★ 멀티 교회: 현재 교회를 입력 코드로 전환 (코드/이름을 DB + localStorage에 반영)
function adoptChurch(code, name){
  if(code){
    DB.church.code = code;
    try { localStorage.setItem('pat_church_code', code); } catch(e) {}
  }
  if(name){
    DB.church.name = name;
    try { localStorage.setItem('pat_church_name', name); } catch(e) {}
  }
}

async function adminLogin(){
  const id = document.getElementById('adminId').value.trim();
  const pw = document.getElementById('adminPw').value.trim();
  if(!id || !pw){ toast('아이디와 비밀번호를 입력하세요'); return; }

  // ── 레거시 세광교회: admin/1234 → 11111 (테스트 기간 현행 유지) ──
  if(id === ADMIN.id && pw === ADMIN.pw){
    adoptChurch('11111', '세광교회');
    localStorage.setItem('pat_admin_id', id);
    localStorage.setItem('pat_admin_pw', pw);
    localStorage.setItem('pat_admin_token', 'fbde1052ecb6da2b9720c096ba8ea047a9327207399802d358dc308299e0d7ac');
    document.getElementById('adminPw').value = '';
    setAdminLoggedIn(true);
    try { sessionStorage.setItem('pat_admin_session', '1'); } catch(e) {}
    if(typeof loadChurchConfig === 'function') await loadChurchConfig();
    renderAdmin();
    go('s-admin');
    toast('✓ 관리자로 로그인되었습니다');
    return;
  }

  // ── 신규 교회: 아이디(전역 유일)+비번으로 교회 자동 식별 ──
  if(!(window.PAT_DB && PAT_DB.ready())){ toast('서버 연결이 필요합니다'); return; }
  const r = await PAT_DB.adminLogin(id, pw);
  if(r && r.ok){
    adoptChurch(r.code, r.name);
    localStorage.setItem('pat_admin_id', id);
    localStorage.setItem('pat_admin_pw', pw);
    localStorage.removeItem('pat_admin_token'); // 교회별 자격 사용 → 전역 토큰 제거
    document.getElementById('adminPw').value = '';
    setAdminLoggedIn(true);
    try { sessionStorage.setItem('pat_admin_session', '1'); } catch(e) {}
    if(typeof loadChurchConfig === 'function') await loadChurchConfig();
    renderAdmin();
    go('s-admin');
    toast('✓ ' + (r.name || '교회') + ' 관리자 로그인');
    return;
  }
  toast((r && r.error) || '아이디 또는 비밀번호가 올바르지 않습니다');
}

// ── 교회 신규 등록 (셀프 등록) ──────────────────────────────
async function registerChurchSubmit(){
  const name = (document.getElementById('regChurchName')?.value || '').trim();
  const code = (document.getElementById('regChurchCode')?.value || '').trim();
  const id   = (document.getElementById('regAdminId')?.value || '').trim();
  const pw   = (document.getElementById('regAdminPw')?.value || '').trim();
  const pw2  = (document.getElementById('regAdminPw2')?.value || '').trim();

  if(!name){ toast('교회 이름을 입력하세요'); return; }
  if(!/^[#@*!_-]\d{6}$/.test(code)){ toast('교회 코드는 특수문자 1개 + 숫자 6자리입니다 (예: #482913)'); return; }
  if(!/^[A-Za-z][A-Za-z0-9]{2,19}$/.test(id)){ toast('관리자 아이디는 영문으로 시작하는 3~20자입니다'); return; }
  if(!/^(?=.{8,}$)[^A-Za-z0-9]+[A-Za-z]+[0-9]+$/.test(pw)){ toast('비밀번호는 특수문자 → 영문 → 숫자 순서로 8자 이상이어야 합니다 (예: #grace2026)'); return; }
  if(pw !== pw2){ toast('비밀번호가 일치하지 않습니다'); return; }
  if(!(window.PAT_DB && PAT_DB.ready())){ toast('서버 연결이 필요합니다'); return; }

  const r = await PAT_DB.registerChurch(code, name, id, pw);
  if(r && r.ok){
    // 등록 직후 자동 로그인 → 본인 교회 관리자 화면
    adoptChurch(code, r.name || name);
    localStorage.setItem('pat_admin_id', id);
    localStorage.setItem('pat_admin_pw', pw);
    localStorage.removeItem('pat_admin_token');
    setAdminLoggedIn(true);
    try { sessionStorage.setItem('pat_admin_session', '1'); } catch(e) {}
    if(document.getElementById('regAdminPw'))  document.getElementById('regAdminPw').value  = '';
    if(document.getElementById('regAdminPw2')) document.getElementById('regAdminPw2').value = '';
    renderAdmin();
    go('s-admin');
    alert('✓ "' + (r.name || name) + '" 등록 완료!\n\n교인 등록 코드: ' + code + '\n이 코드를 교인들에게 공유하세요.\n교인은 이 코드로 입장 후 본인 가족방 비밀번호를 새로 설정합니다.');
    return;
  }
  toast((r && r.error) || '등록 실패');
}

async function checkRegChurchCode(){
  const code = (document.getElementById('regChurchCode')?.value || '').trim();
  const el = document.getElementById('regCodeStatus');
  if(!el) return;
  if(!/^[#@*!_-]\d{6}$/.test(code)){ el.textContent = '형식: 특수문자1 + 숫자6 (예: #482913)'; el.style.color = 'var(--muted)'; return; }
  if(!(window.PAT_DB && PAT_DB.ready())){ el.textContent = ''; return; }
  const r = await PAT_DB.checkChurchCode(code);
  if(r && r.available){ el.textContent = '✓ 사용 가능한 코드입니다'; el.style.color = 'var(--accent)'; }
  else if(r && !r.available){ el.textContent = '✗ 이미 사용 중인 코드입니다'; el.style.color = 'var(--danger)'; }
  else { el.textContent = ''; }
}

async function checkRegAdminId(){
  const id = (document.getElementById('regAdminId')?.value || '').trim();
  const el = document.getElementById('regAdminIdStatus');
  if(!el) return;
  if(!/^[A-Za-z][A-Za-z0-9]{2,19}$/.test(id)){ el.textContent = '영문으로 시작하는 3~20자 (전체 교회에서 유일)'; el.style.color = 'var(--muted)'; return; }
  if(!(window.PAT_DB && PAT_DB.ready())){ el.textContent = ''; return; }
  const r = await PAT_DB.checkAdminId(id);
  if(r && r.available){ el.textContent = '✓ 사용 가능한 아이디입니다'; el.style.color = 'var(--accent)'; }
  else if(r && !r.available){ el.textContent = '✗ 이미 사용 중인 아이디입니다 (다른 아이디를 입력하세요)'; el.style.color = 'var(--danger)'; }
  else { el.textContent = ''; }
}

// ── 개발자 통계 (앱 내 숨김 화면) ──────────────────────────
async function devStatsLoad(){
  const tok = ((document.getElementById('devStatsToken')?.value || '').trim()) || localStorage.getItem('pat_dev_token') || '';
  if(!tok){ toast('토큰을 입력하세요'); return; }
  const base = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiBase) || 'https://us-central1-pat-bible-app.cloudfunctions.net';
  try {
    const r = await fetch(base + '/getPlatformStats', { headers: { 'x-pat-dev-token': tok } });
    if(r.status === 401){ toast('토큰이 올바르지 않습니다'); return; }
    if(!r.ok){ toast('오류 ' + r.status); return; }
    const d = await r.json();
    localStorage.setItem('pat_dev_token', tok);
    document.getElementById('devLoginBox').style.display = 'none';
    document.getElementById('devStatsResult').style.display = 'block';
    document.getElementById('devC').textContent = d.totalChurches;
    document.getElementById('devM').textContent = d.totalMembers;
    document.getElementById('devRows').innerHTML = (d.churches || []).map(c =>
      `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">
         <span>${esc(c.name || '(이름없음)')}</span>
         <span style="white-space:nowrap">인원 ${c.memberCount}명</span>
       </div>`).join('') || '<p class="muted" style="text-align:center;margin:8px 0">등록된 교회가 없습니다</p>';
  } catch(e){ toast('연결 오류'); }
}

// ── 문의·오류 신고 ────────────────────────────────────────
// 자동 오류 수집 (window.onerror / unhandledrejection) — 중복·세션상한으로 폭주 방지
const _autoReported = new Set();
let _autoReportCount = 0;
function _autoReportError(message){
  try {
    if(!window.PAT_DB || !PAT_DB.ready || !PAT_DB.ready() || !PAT_DB.submitReport) return;
    const msg = String(message || '').slice(0, 300).trim();
    if(!msg) return;
    if(_autoReported.has(msg)) return;     // 같은 메시지 1회만
    if(_autoReportCount >= 8) return;       // 세션당 상한
    _autoReported.add(msg); _autoReportCount++;
    PAT_DB.submitReport({
      churchCode: DB.church.code || '', churchName: DB.church.name || '',
      type: 'auto', message: msg,
      screen: (document.querySelector('.screen.active')?.id || ''),
      ua: (typeof navigator!=='undefined' ? (navigator.userAgent||'') : '').slice(0, 300),
    });
  } catch(e){}
}
if(typeof window !== 'undefined' && window.addEventListener){
  window.addEventListener('error', e => _autoReportError((e && e.message) || 'script error'));
  window.addEventListener('unhandledrejection', e => _autoReportError('Promise: ' + ((e && e.reason && (e.reason.message || e.reason)) || 'rejection')));
}

// 수동 문의/신고 화면 열기 (현재 화면을 자동 기록)
function openReport(){
  window._reportFrom = document.querySelector('.screen.active')?.id || '';
  const ta = document.getElementById('reportText'); if(ta) ta.value = '';
  const ctx = document.getElementById('reportContext');
  if(ctx) ctx.textContent = (DB.church.name ? DB.church.name + ' · ' : '') + '현재 화면: ' + (window._reportFrom || '-');
  go('s-report');
}
async function sendReport(){
  const msg = (document.getElementById('reportText')?.value || '').trim();
  if(!msg){ toast('문의/오류 내용을 입력해주세요'); return; }
  if(!(window.PAT_DB && PAT_DB.ready())){ toast('서버 연결이 필요합니다'); return; }
  const ok = await PAT_DB.submitReport({
    churchCode: DB.church.code || '', churchName: DB.church.name || '',
    type: 'manual', message: msg,
    screen: (window._reportFrom || ''),
    ua: (typeof navigator!=='undefined' ? (navigator.userAgent||'') : '').slice(0, 300),
  });
  if(ok){ toast('✓ 접수되었습니다. 확인 후 조치하겠습니다. 감사합니다!'); go(window._reportFrom || 's-login'); }
  else { toast('전송 실패 — 잠시 후 다시 시도해주세요'); }
}
function adminLogout(){
  localStorage.removeItem('pat_admin_id');
  localStorage.removeItem('pat_admin_pw');
  localStorage.removeItem('pat_admin_token');
  setAdminLoggedIn(false);
  try { sessionStorage.removeItem('pat_admin_session'); } catch(e) {}
  // ★ 새로고침(당겨서 새로고침) 시 이전 화면으로 튕기지 않도록 — go('s-login')과 동일한 보호 플래그.
  //   (초기화 로직 determineInitialScreen/completeAppInitialization 이 이 플래그를 보면 무조건 로그인 유지)
  try { sessionStorage.setItem('pat_stay_login', '1'); } catch(e) {}
  // 로그아웃 후 뒤로가기에서 이전 페이지로 돌아가지 않도록 replaceState 사용
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active','no-motion'));
  const target = document.getElementById('s-login');
  if(target) target.classList.add('active');
  const tabbar = document.getElementById('tabbar');
  if(tabbar) tabbar.style.display = 'none';
  // 누적된 히스토리를 루트로 접어 — 로그인 화면에서 back 한 번에 폰 홈으로 종료되게 함
  collapseHistoryToLogin();
  toast('로그아웃되었습니다');
}
function memberLogout(){
  const code = document.getElementById('churchCode');
  if(code) code.value = '';

  // ★ 혼합형 로그아웃: 가족 데이터 삭제 (다음 입장 시 비밀번호 재입력 유도)
  //   - 평소: 앱을 열면 자동 입장 (편의)
  //   - 로그아웃: 가족 데이터 지워 다음 입장 시 비밀번호 요구 (보안)
  //   - 중복 생성 버그 우려 없음: loadFamilyProfile이 백업(pat_leader_family_profile)에서 복구 가능
  localStorage.removeItem('pat_family_profile');
  localStorage.removeItem('pat_family_id');
  localStorage.removeItem('pat_leader_family_profile');
  localStorage.removeItem('pat_rooms');  // ★ 2단계: 내 방 목록도 로그아웃 시 정리(다음 입장 시 재구성)
  // ★ pat_device_id 는 로그아웃에서도 보존한다. 삭제하면 재입장 시 새 deviceId가
  //   생성돼 기존 미션 완료기록(deviceId 식별)과 끊기고 중복 레코드가 쌓인다
  //   (= 사용자에게 "오늘 미션 데이터 초기화"처럼 보이던 근본 원인). 기기 식별자는 비민감.
  // localStorage.removeItem('pat_device_id');  // ← 의도적으로 제거하지 않음

  // ⚠️ sessionStorage 백업도 제거 (세션 종료)
  try { sessionStorage.removeItem('pat_family_profile'); } catch(e) {}

  // 폴링 중지
  if(window.familyProgressPollTimer) clearInterval(window.familyProgressPollTimer);
  window.familyProgressPollTimer = null;
  window.familyProgressPollKey = '';

  // ★ 새로고침(당겨서 새로고침) 시 이전 화면으로 튕기지 않도록 — go('s-login')과 동일한 보호 플래그.
  try { sessionStorage.setItem('pat_stay_login', '1'); } catch(e) {}

  // 로그아웃 후 뒤로가기에서 이전 페이지로 돌아가지 않도록
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active','no-motion'));
  const target = document.getElementById('s-login');
  if(target) target.classList.add('active');
  const tabbar = document.getElementById('tabbar');
  if(tabbar) tabbar.style.display = 'none';

  // 누적된 히스토리를 루트로 접어 — 로그인 화면에서 back 한 번에 폰 홈으로 종료되게 함
  collapseHistoryToLogin();
  toast('로그아웃되었습니다. 다음 입장 시 비밀번호를 입력해주세요');
}
function syncAdminVerseFields(){
  document.getElementById('inRef').value = DB.verse.ref || '';
  document.getElementById('inText').value = DB.verse.text || '';
  // 적용 주차(inWeek)는 기준 날짜(inDate)에서 항상 파생하므로 여기서 설정하지 않음
}
function renderAdmin(){
  document.getElementById('adminChurchLabel').textContent = '관리 교회: '+(DB.church.name || '(미설정)');
  applyAppTitle();
  const _cn = document.getElementById('inChurchName'); if(_cn) _cn.value = DB.church.name || '';
  const _pp = document.getElementById('inPastor'); if(_pp) _pp.value = localStorage.getItem('pat_church_pastor') || '';
  const _ad = document.getElementById('inChurchAddr'); if(_ad) _ad.value = localStorage.getItem('pat_church_addr') || '';
  if(!document.getElementById('inDate').value){
    document.getElementById('inDate').value = new Date().toISOString().slice(0,10);
  }
  syncAdminVerseFields();
  // 적용 주차·기간을 기준 날짜로부터 항상 재계산 (저장된 weekOf로 덮어쓰지 않음)
  updateWeekFromDate();
  renderVerseList();
  renderPreview();
  loadChurchLogoPreview();

  // 관리자 교구별 현황 편집 폼은 index.html의 renderAdminParishFromStorage()가
  // s-admin 진입 시 처리 (전체 인원 복원 + 완료 인원 자동 집계).
  // 성도용 대시보드(dParishList)는 여기서 렌더하지 않는다 — 관리자 화면에서
  // 비동기로 dParishList를 건드리면 대시보드 렌더와 경쟁(race)이 생기기 때문.
}

// ── 저장된 교회 로고 미리보기 로드 ──
function loadChurchLogoPreview(){
  const key = `pat_church_logo_${DB.church.code}`;
  const svgContent = localStorage.getItem(key);
  const preview = document.getElementById('logoPreview');
  const previewImg = document.getElementById('logoPreviewImg');

  if(svgContent){
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    previewImg.src = url;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

// ── 관리자: 설정 저장 (구절 + 앱제목을 Firebase에 저장) ──
async function saveAdminConfig(){
  const appTitle = document.getElementById('inAppTitle')?.value.trim() || DB.church.name;
  const ref = document.getElementById('inRef')?.value.trim();
  const text = document.getElementById('inText')?.value.trim();
  const weekOf = document.getElementById('inWeek')?.value.trim();

  if(!ref || !text){
    toast('구절 정보(참고·본문)를 입력해주세요');
    return;
  }

  const verse = { ref, text, weekOf };

  // localStorage 저장 (로컬 백업)
  localStorage.setItem('pat_app_title', appTitle);
  DB.verse = verse;
  saveVerses([verse]);

  // Firebase 저장
  if(window.PAT_DB && PAT_DB.ready()){
    const ok = await PAT_DB.saveConfig(DB.church.code, appTitle, verse);
    if(ok){
      toast('✅ 설정이 저장되고 모든 기기에 동기화됩니다');
      console.log('[PAT] 설정 저장 완료:', { appTitle, ref });
    } else {
      toast('❌ Firebase 저장 실패 (Admin Token 확인)');
    }
  } else {
    toast('✅ 로컬 저장 완료 (Firebase 미연결)');
  }
}

// ── 화면 전환 ─────────────────────────────────────────────
// popstate 처리 중 중복 pushState 방지 플래그
let _poppingState = false;

// 화면 ID → 해시 URL 변환 (모바일에서 같은 URL 반복 시 히스토리 미생성 문제 방지)
function _screenUrl(id){
  const authScreens = ['s-login','s-adminlogin'];
  if(authScreens.includes(id)) return location.pathname + location.search;
  return location.pathname + location.search + '#' + id;
}

function go(id, resetScroll=true, animate=false){
  // ★ 로그인 화면 유지 플래그: s-login 진입 시 세트, 가족/관리자 콘텐츠 진입 시 해제.
  //   (로그인 화면에서 새로고침해도 가족화면으로 튕기지 않게)
  try {
    if(id === 's-login') sessionStorage.setItem('pat_stay_login', '1');
    else if(id === 's-family' || id === 's-admin') sessionStorage.removeItem('pat_stay_login');
  } catch(e) {}
  // animate는 항상 false (애니메이션 완전 제거)
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active','no-motion'));
  const target = document.getElementById(id);
  if(!target) return;
  target.classList.add('active');
  const tabbar = document.getElementById('tabbar');
  const noTab = ['s-login','s-adminlogin','s-admin','s-invite','s-reset-pw','s-church-register','s-dev-stats','s-install','s-report'];
  tabbar.style.display = noTab.includes(id) ? 'none' : 'flex';
  document.querySelectorAll('.tab').forEach(t=>{
    t.classList.toggle('active', t.dataset.screen===id);
  });

  // ★ 암송 화면 진입 시 날짜 체크 후 필요하면 초기화
  if(id === 's-voice' || id === 's-typing'){
    if(typeof checkAndResetByDate === 'function') checkAndResetByDate();
  }

  if(id==='s-verse'){ renderVerse(); }
  else if(id==='s-family'){ renderFamily(); }
  else if(id==='s-dashboard'){
    // 현황 대시보드: 자동 갱신 폴링 시작
    if(typeof startDashboardPolling === 'function') startDashboardPolling();
  }
  else if(id==='s-prayer'){ renderPrayer(); }
  else if(id==='s-reading'){ if(typeof renderReading==='function') renderReading(); }
  else if(id !== 's-dashboard' && typeof stopDashboardPolling === 'function'){
    // 다른 화면으로 이동 시 폴링 중지
    stopDashboardPolling();
  }
  if(id==='s-worship' && typeof renderWorship==='function') renderWorship();
  if(id==='s-login' && typeof refreshLoginMode==='function') refreshLoginMode();
  if(id==='s-login' && typeof pwaMaybeShowPromo==='function') pwaMaybeShowPromo();
  if(resetScroll) window.scrollTo(0,0);

  // 브라우저 히스토리 관리 — 모바일 대응: 해시(#id)로 URL 구분
  if(!_poppingState && typeof history !== 'undefined'){
    const isAuthScreen = ['s-login','s-adminlogin'].includes(id);
    // 현재 히스토리 깊이(_depth)를 읽어, 로그아웃 시 루트로 한 번에 접을 수 있게 추적한다.
    const curDepth = (history.state && typeof history.state._depth === 'number') ? history.state._depth : 0;
    if(isAuthScreen){
      // 로그인 화면은 replace — 뒤로가기로 로그인화면 재진입 방지
      history.replaceState({ screen: id, _depth: curDepth }, '', _screenUrl(id));
    } else {
      history.pushState({ screen: id, _depth: curDepth + 1 }, '', _screenUrl(id));
    }
  }
}
function tabGo(id){ go(id); }

// 로그아웃/로그인 진입 시 누적된 뒤로가기 히스토리를 루트(depth 0)로 한 번에 접는다.
// 이렇게 해야 로그인 화면에서 시스템 back 한 번에 TWA가 종료되어 폰 홈으로 나갈 수 있다.
let _collapsingToLogin = false;
function collapseHistoryToLogin(){
  if(typeof history === 'undefined') return;
  const d = (history.state && typeof history.state._depth === 'number') ? history.state._depth : 0;
  if(d > 0 && typeof history.go === 'function'){
    // 현재 depth 만큼 뒤로 점프 → 루트(로그인) 엔트리로 이동. 이때 발생하는 popstate 는 무시한다.
    _collapsingToLogin = true;
    history.go(-d);
  } else {
    // 이미 루트면 그대로 로그인으로 고정
    history.replaceState({ screen: 's-login', _depth: 0 }, '', _screenUrl('s-login'));
  }
}

// 브라우저/모바일 뒤로가기 처리
let _preventBack = false;
if(typeof window !== 'undefined' && window.history){
  window.addEventListener('popstate', e => {
    // 히스토리 접기(collapse) 중 발생한 popstate: 루트에 로그인 상태만 고정하고 종료.
    if(_collapsingToLogin){
      _collapsingToLogin = false;
      history.replaceState({ screen: 's-login', _depth: 0 }, '', _screenUrl('s-login'));
      return;
    }

    // 현재 보이는 화면이 로그인 화면이면 뒤로가기를 트랩하지 않고 그대로 통과시킨다.
    // → 더 이상 history.forward() 로 가두지 않으므로, 시스템이 TWA 를 종료해 폰 홈으로 나간다.
    const currentActive = document.querySelector('.screen.active');
    if(currentActive && (currentActive.id === 's-login' || currentActive.id === 's-adminlogin')){
      return;
    }

    // state 우선, 없으면 해시에서 추출 (모바일 폴백)
    const hash = location.hash.replace('#','');
    const screen = e.state?.screen
      || (hash && document.getElementById(hash) ? hash : null);

    // 로그인 화면으로 가려는 시도 → 로그인 화면 유지
    if(!screen || (screen === 's-login' || screen === 's-adminlogin')){
      history.replaceState({ screen: 's-login' }, '', _screenUrl('s-login'));
      document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active','no-motion'));
      const loginScreen = document.getElementById('s-login');
      if(loginScreen) loginScreen.classList.add('active');
      const tabbar = document.getElementById('tabbar');
      if(tabbar) tabbar.style.display = 'none';
      return;
    }

    _poppingState = true;
    go(screen, true, false);
    _poppingState = false;
  });
  // 초기 상태: 해시 없이 replaceState — 루트 depth 0 으로 표시 (back 한 번에 앱 종료 가능)
  history.replaceState({ screen: 's-login', _depth: 0 }, '', location.pathname + location.search);
}

// ── 교회 입장 ─────────────────────────────────────────────
function enterMemberHome(){
  document.getElementById('churchName').textContent = memberHomeTitle();
  renderMemberDateLabels();
  renderFamily();
  go('s-family');
  // ★ 보안 안내(B): 기본 비번(=교회코드)을 그대로 쓰는 방이면 변경 유도 (세션 1회)
  try{
    const p = loadFamilyProfile();
    if(p && p.familyPassword && p.familyPassword === DB.church.code && !sessionStorage.getItem('pat_pw_nudge')){
      sessionStorage.setItem('pat_pw_nudge','1');
      setTimeout(()=>toast('보안을 위해 가족 비밀번호를 변경하세요'), 900);
    }
  }catch(e){}
}

// ══════════════════════════════════════════════════════════════
// 가족방 로그인 — 2단계 구조 (교회 선택 ↔ 가족 비밀번호 인증)
// ──────────────────────────────────────────────────────────────
//  [원칙]
//   · 교회 코드 = '교회 식별용'. 어떤 가족방에도 이 코드로는 입장 불가.
//   · 가족 비밀번호 = 유일한 입장 인증 수단. 대표가 설정한 비번만 유효.
//   · 다른 가정 비번/교회코드로는 입장 불가 (findFamilyByPassword가
//     pat_family_id로 스코프 → 내 가족 외에는 통과 못 함).
//  판정 규칙은 순수함수 loginDecision(login-auth.js)로 분리해 테스트한다.
// ══════════════════════════════════════════════════════════════
async function enterChurch(){
  const raw = (document.getElementById('churchCode').value || '').trim();
  const decision = (typeof loginDecision === 'function')
    ? loginDecision(DB.church.code, raw)
    : { action: raw ? (DB.church.code ? 'AUTH_FAMILY_PW' : 'SELECT_CHURCH') : 'NEED', password: raw, code: raw };

  switch(decision.action){
    case 'NEED_CHURCH_CODE':
      toast('교회 코드를 입력하세요'); return;
    case 'NEED_FAMILY_PW':
      toast('가족 비밀번호를 입력하세요'); return;

    // ── 1단계: 교회 선택 (입장 아님) ──
    case 'SELECT_CHURCH': {
      if(!(window.PAT_DB && PAT_DB.ready())){ toast('서버 연결이 필요합니다'); return; }
      let cfg = null;
      try{ cfg = await PAT_DB.getConfig(decision.code); }catch(e){}
      if(cfg){
        adoptChurch(decision.code, cfg.appTitle);
        if(typeof loadChurchConfig === 'function') await loadChurchConfig();
        if(typeof refreshLoginMode === 'function') refreshLoginMode();
        toast('✓ 교회가 선택됐어요. 가족 비밀번호로 입장하세요');
      } else {
        toast('교회 코드가 올바르지 않습니다');
      }
      return;
    }

    // ── (차단) 교회 코드를 비밀번호 칸에 입력 ──
    case 'REJECT_CHURCHCODE':
      toast('가정 비밀번호가 올바르지 않습니다 (교회 코드로는 입장할 수 없어요)');
      return;

    // ── 2단계: 가족 비밀번호 인증 ──
    case 'AUTH_FAMILY_PW': {
      const pw = decision.password;
      const profile = loadFamilyProfile();

      // 서버 검증 (내 가족 pat_family_id 우선 스코프 → 다른 가정 비번은 실패)
      if(window.PAT_DB && PAT_DB.ready() && PAT_DB.findFamilyByPassword){
        let found = null;
        try{ found = await PAT_DB.findFamilyByPassword(DB.church.code, pw); }
        catch(e){ toast('서버 오류입니다. 다시 시도하세요'); return; }
        if(found && found.id){
          const prevName = (profile && (profile.memberName || profile.leaderName)) || '';
          if(prevName){
            await _enterFoundFamily(found, pw, profile);   // 기존 구성원 재입장
          } else {
            // 새 기기/구성원 → 정식 합류(이름 입력, 서버 joinFamily)로 유도
            go('s-family-join-manual');
            const nameI = document.getElementById('joinMemberNameInput'); if(nameI) nameI.value='';
            const pwI   = document.getElementById('joinPasswordInput');   if(pwI)   pwI.value = pw;
            toast('가족방을 찾았어요 — 이름을 입력해 합류하세요');
          }
          return;
        }
        toast('가정 비밀번호가 올바르지 않습니다');
        return;
      }

      // 오프라인 폴백: 로컬 저장 가족 비번과 정확히 일치할 때만 (교회코드는 이미 위에서 차단)
      if(profile && profile.familyPassword && profile.familyPassword === pw){
        if(typeof refreshFamilyProfileByPassword === 'function') await refreshFamilyProfileByPassword(profile, pw);
        enterMemberHome();
        return;
      }
      toast('가정 비밀번호가 올바르지 않습니다');
      return;
    }
    default:
      toast('가족 비밀번호를 입력하세요');
  }
}

// 비밀번호 검증으로 찾은 가족방으로 입장 (프로필/활성방 갱신 — 데이터는 보존)
async function _enterFoundFamily(found, pw, profile){
  const members = (typeof normalizeFamilyMemberNames === 'function')
    ? normalizeFamilyMemberNames(found.members)
    : (Array.isArray(found.members) ? found.members : []);
  const prevName = (profile && (profile.memberName || profile.leaderName)) || '';
  const nextProfile = {
    ...(profile || {}),
    roomName:   found.roomName   || (profile && profile.roomName)   || '',
    leaderName: found.leaderName || (profile && profile.leaderName) || '',
    parish:     found.parish     || (profile && profile.parish)     || '',
    district:   found.district   || (profile && profile.district)   || '',
    groupType:  (found.groupType === '구역') ? '구역' : ((profile && profile.groupType) || '가정'),
    familyPassword: pw,
    memberName: prevName,
    members: members.length ? members : ((profile && profile.members) || [])
  };
  try{ localStorage.setItem('pat_family_id', found.id); }catch(e){}
  if(typeof setFamilyStorage === 'function') setFamilyStorage('pat_family_profile', JSON.stringify(nextProfile));
  else { try{ localStorage.setItem('pat_family_profile', JSON.stringify(nextProfile)); }catch(e){} }
  if(typeof upsertRoom === 'function'){ try{ upsertRoom({ familyId: found.id, ...nextProfile }); }catch(e){} }
  if(typeof loadChurchConfig === 'function') await loadChurchConfig();
  enterMemberHome();
}

// 로그인 화면 UI를 현재 상태(교회 선택 여부)에 맞춰 전환
function refreshLoginMode(){
  const hasChurch = !!DB.church.code;
  const prompt = document.getElementById('loginPrompt');
  const input  = document.getElementById('churchCode');
  const startBtn = document.getElementById('loginStartBtn');
  const devResetBtn = document.getElementById('devResetChurchBtn');
  if(hasChurch){
    if(prompt) prompt.textContent = '가족 비밀번호를 입력하세요';
    if(input){
      input.type = 'password';                    // 비밀번호는 점(•)으로 마스킹
      input.placeholder = '가족 비밀번호';
      input.value = '';
      input.style.letterSpacing='normal';
    }
    if(startBtn) startBtn.textContent = '입장하기';
    if(devResetBtn) devResetBtn.style.display='block';  // 다른 교회 선택 버튼 표시
  } else {
    if(prompt) prompt.textContent = '교회 코드를 입력하세요';
    if(input){
      input.type = 'text';                       // 교회 코드는 보이는 상태
      input.placeholder = '교회 코드';
      input.style.letterSpacing='4px';
    }
    if(startBtn) startBtn.textContent = '시작하기';
    if(devResetBtn) devResetBtn.style.display='none';   // 버튼 숨김
  }
}

// 다른 교회 선택 — 교회 식별 정보만 해제 (가족/미션 데이터는 보존)
// (개발자/테스트용: 다른 교회 코드로 재로그인 가능하게)
function resetChurchSelection(){
  DB.church.code = ''; DB.church.name = '';
  try { localStorage.removeItem('pat_church_code'); localStorage.removeItem('pat_church_name'); } catch(e){}
  const input = document.getElementById('churchCode'); if(input) input.value='';
  if(typeof refreshLoginMode === 'function') refreshLoginMode();
  toast('교회 선택을 해제했어요. 새 교회 코드를 입력하세요');
}

// ── 공통 유틸 ─────────────────────────────────────────────
function esc(c){ return c.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/ /g,'&nbsp;'); }

let toastT;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(()=>t.classList.remove('show'), 2000);
}

// ── PWA 설치 ─────────────────────────────────────────────
let deferredInstallPrompt = null;
if(typeof window !== 'undefined' && window.addEventListener){
  window.addEventListener('beforeinstallprompt', e=>{
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('installAppBtn');
    if(btn) btn.textContent = '📱 PAT 아이콘 설치';
  });
}
async function installPatApp(){
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(()=>{});
    deferredInstallPrompt = null;
    return;
  }
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
  if(/KAKAOTALK/i.test(ua)){
    alert('카카오톡 안에서는 설치가 어렵습니다.\n오른쪽 위 메뉴(⋮ 또는 …)에서 "다른 브라우저로 열기"를 누른 뒤, Chrome/Safari에서 PAT 아이콘을 홈 화면에 추가해주세요.');
    return;
  }
  if(/iPhone|iPad|iPod/i.test(ua)){
    alert('iPhone/iPad 설치 방법\n1. Safari에서 이 페이지 열기\n2. 아래 공유 버튼 누르기\n3. "홈 화면에 추가" 선택\n4. PAT Bible 아이콘으로 실행');
    return;
  }
  alert('Android 설치 방법\n1. Chrome에서 이 페이지 열기\n2. 오른쪽 위 메뉴(⋮) 누르기\n3. "앱 설치" 또는 "홈 화면에 추가" 선택\n4. PAT Bible 아이콘으로 실행');
}

// ── 설치 안내 화면 열기 (현재 플랫폼 강조 + 네이티브 설치 버튼 노출) ──
function openInstallGuide(){
  go('s-install');
  try {
    const ua = (navigator.userAgent || '');
    const isAndroid = /Android/i.test(ua);
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isKakao = /KAKAOTALK/i.test(ua);
    // 안드로이드 Chrome에서 설치 프롬프트가 준비됐으면 "지금 바로 설치" 버튼 노출
    const btn = document.getElementById('installNowBtn');
    if(btn) btn.style.display = (deferredInstallPrompt && isAndroid && !isKakao) ? 'block' : 'none';
    // 현재 플랫폼 카드 강조
    const hi = (id, on) => { const e = document.getElementById(id); if(e) e.style.outline = on ? '2px solid var(--accent)' : 'none'; };
    hi('installKakao', isKakao);
    hi('installIos', isIos && !isKakao);
    hi('installAndroid', isAndroid && !isKakao);
  } catch(e) {}
}

// ── 메인화면 ⋮ 메뉴 ──────────────────────────────────────
function toggleHmMenu(e){
  if(e) e.stopPropagation();
  const d = document.getElementById('hmDropdown');
  if(!d) return;
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
}
function closeHmMenu(){
  const d = document.getElementById('hmDropdown');
  if(d) d.style.display = 'none';
}
if(typeof document !== 'undefined' && typeof document.addEventListener === 'function'){
  document.addEventListener('click', ()=> closeHmMenu());
}

// ── SW 업데이트 감지 — 새 버전 배포 시 배너 표시 ───────────
if(typeof navigator !== 'undefined' && navigator.serviceWorker){
  // 방법 1: controllerchange (초기 활성화)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    showSWUpdateBanner();
  });

  // 방법 2: updates (활성 상태에서 업데이트 감지) — 모바일 대응
  navigator.serviceWorker.ready.then(registration => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // 이미 controller가 있고 새 SW가 installed → 업데이트 가능
          showSWUpdateBanner();
        }
      });
    });

    // 5초마다 업데이트 체크 (모바일 앱에서 포그라운드 진입 시)
    setInterval(() => {
      registration.update().catch(() => {});
    }, 5000);
  });

  function showSWUpdateBanner() {
    // 이미 배너가 있으면 중복 표시 방지
    if(document.getElementById('swUpdateBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'swUpdateBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#1976d2;'
      + 'color:#fff;text-align:center;padding:10px 16px;font-size:14px;'
      + 'display:flex;align-items:center;justify-content:center;gap:12px;';
    banner.innerHTML = '🔄 새 버전이 있습니다.'
      + '<button onclick="location.reload()" style="background:#fff;color:#1976d2;'
      + 'border:none;padding:4px 14px;border-radius:4px;cursor:pointer;font-weight:bold;">'
      + '새로고침</button>';
    document.body.appendChild(banner);
    console.log('[PAT] SW 업데이트 배너 표시');
  }
}

// ── PWA 설치 프롬프트 ──────────────────────────────────────
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  window.deferredPrompt = e;   // pwa-install.js 와 공유
  console.log('[PAT-PWA] 설치 프롬프트 대기 중');
  // 설치 유도 카드는 pwa-install.js 가 조건에 맞게 표시(중복 방지 — 옛 installBtn 표시 안 함)
  if(typeof pwaMaybeShowPromo === 'function') pwaMaybeShowPromo();
});

function installApp(){
  console.log('[PAT-PWA] installApp 호출');
  if(!deferredPrompt){
    console.log('[PAT-PWA] deferredPrompt 없음 - 이미 설치됨 또는 지원 안 됨');
    toast('이 브라우저에서는 설치가 지원되지 않습니다');
    return;
  }

  // 설치 프롬프트 표시
  deferredPrompt.prompt();

  // 사용자 선택 대기
  deferredPrompt.userChoice.then(choiceResult => {
    if(choiceResult.outcome === 'accepted'){
      console.log('[PAT-PWA] 사용자가 설치를 수락함');
      toast('🎉 홈화면에 추가되었습니다!');
    } else {
      console.log('[PAT-PWA] 사용자가 설치를 거절함');
    }
    deferredPrompt = null;

    // 버튼 숨기기
    const installBtn = document.getElementById('installBtn');
    if(installBtn) installBtn.style.display = 'none';
  });
}

// 앱이 이미 설치되었으면 버튼 숨기기
window.addEventListener('appinstalled', () => {
  console.log('[PAT-PWA] 앱이 설치됨');
  const installBtn = document.getElementById('installBtn');
  if(installBtn) installBtn.style.display = 'none';
  deferredPrompt = null;
});

// ── 🔄 실시간 양방향 동기화 시스템 ─────────────────────────
// 폰↔웹 실시간 동기화 (1초 폴링 + 포커스 감지)
window.SYNC_MANAGER = {
  // 동기화 상태 추적
  lastDataHashes: {
    familyProgress: null,
    dashboardStats: null,
    verseData: null,
  },

  // 1초 폴링 타이머
  pollTimers: {},
  POLL_INTERVAL: 1000, // 1초 (기존 5-10초 → 1초로 단축)

  // 폴링 시작
  startPolling(name, callback) {
    if(this.pollTimers[name]) clearInterval(this.pollTimers[name]);
    console.log(`[SYNC] 폴링 시작: ${name} (1초 간격)`);

    // 즉시 한 번 실행
    callback();

    // 1초마다 반복
    this.pollTimers[name] = setInterval(callback, this.POLL_INTERVAL);
  },

  // 폴링 중지
  stopPolling(name) {
    if(this.pollTimers[name]){
      clearInterval(this.pollTimers[name]);
      this.pollTimers[name] = null;
      console.log(`[SYNC] 폴링 중지: ${name}`);
    }
  },

  // 데이터 해시 (변경 감지)
  getHash(data) {
    return JSON.stringify(data).split('').reduce((a,b) => ((a << 5) - a) + b.charCodeAt(0), 0);
  },

  // 데이터 변경 여부 확인
  hasChanged(name, newData) {
    const newHash = this.getHash(newData);
    const oldHash = this.lastDataHashes[name];
    if(oldHash !== newHash){
      this.lastDataHashes[name] = newHash;
      return true;
    }
    return false;
  },
};

// 포커스 감지 (탭 활성화 시 즉시 동기화)
window.addEventListener('focus', () => {
  console.log('[SYNC] 🔵 포커스 복귀 - 즉시 동기화');

  // 현재 활성 화면에 따라 동기화
  const activeScreen = document.querySelector('.screen.active')?.id;

  if(activeScreen === 's-family' && typeof renderFamily === 'function'){
    renderFamily().catch(e => console.error('[SYNC] 가족방 동기화 실패:', e.message));
  }

  if(activeScreen === 's-dashboard' && typeof renderDashboard === 'function'){
    renderDashboard().catch(e => console.error('[SYNC] 대시보드 동기화 실패:', e.message));
  }

  if(activeScreen === 's-verse' && typeof renderVerse === 'function'){
    renderVerse().catch(e => console.error('[SYNC] 암송 동기화 실패:', e.message));
  }
});

// 백그라운드 → 포그라운드 감지 (앱 최소화에서 복귀)
document.addEventListener('visibilitychange', () => {
  if(!document.hidden){
    console.log('[SYNC] 📱 앱 포그라운드 복귀 - 동기화 시작');

    // 모든 폴링 재개
    const activeScreen = document.querySelector('.screen.active')?.id;
    if(activeScreen === 's-family' && typeof startFamilyProgressPolling === 'function'){
      const profile = loadFamilyProfile();
      if(profile) startFamilyProgressPolling(profile);
    }
    if(activeScreen === 's-dashboard' && typeof startDashboardPolling === 'function'){
      startDashboardPolling();
    }
  } else {
    console.log('[SYNC] 📱 앱 백그라운드 - 폴링 유지 (1초)');
  }
});

// 관리자 교구별 현황 편집은 index.html 인라인 스크립트로 일원화됨
// (renderAdminParishFromStorage / saveAdminParishData / applyAggregatedToAdmin)
// 저장 키: pat_admin_parish_edit (전체 인원만 저장, 완료는 자동 집계)

// ── DOM 이벤트 (body 내 스크립트이므로 DOM 준비 완료) ─────
document.getElementById('churchCode').addEventListener('keyup',e=>{ if(e.key==='Enter') enterChurch(); });
document.getElementById('adminPw').addEventListener('keyup',e=>{ if(e.key==='Enter') adminLogin(); });
