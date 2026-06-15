// ====== PAT Bible — app-core.js ======
// 전역 상태(DB), 화면 전환(go), 인증, 공통 유틸리티

// ── 전역 데이터 ───────────────────────────────────────────
const DB = {
  church: { name:'세광교회', code:'11111', memberCount:248 },
  verse: { ref:'요한복음 3:16', weekOf:'2026년 6월 1주차 · 6월 1일 월요일 ~ 6월 7일 일요일',
    text:'하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라' },
  members: [
    { name:'아빠', done:true }, { name:'엄마', done:true },
    { name:'나', done:false, me:true }, { name:'동생', done:false }
  ]
};

// 검증 임계값
let LENIENT = false;
const TH = () => LENIENT ? { voice:90, typing:100 } : { voice:90, typing:100 };

// ── localStorage 헬퍼 ─────────────────────────────────────
function loadRec(){ try{ return JSON.parse(localStorage.getItem('pat_records')||'[]'); }catch(e){ return []; } }
function saveRec(r){ localStorage.setItem('pat_records', JSON.stringify(r)); }
function loadVerses(){ try{ return JSON.parse(localStorage.getItem('pat_verses')||'[]'); }catch(e){ return []; } }
function saveVerses(v){ localStorage.setItem('pat_verses', JSON.stringify(v)); }

// ── 앱 제목 / 교회명 ──────────────────────────────────────
const APP_TITLE_DEFAULT = 'PAT Bible';
function applyAppTitle(){
  const title = localStorage.getItem('pat_app_title') || APP_TITLE_DEFAULT;
  document.getElementById('loginAppTitle').textContent = title;
  return title;
}
function applyStoredData(){
  applyAppTitle();
  const cn = localStorage.getItem('pat_church_name');
  if(cn) DB.church.name = cn;
  const vs = loadVerses();
  if(vs.length){ DB.verse = { ref:vs[0].ref, weekOf:vs[0].weekOf, text:vs[0].text }; }
  checkInviteParam();
  initFirebase();

  // 관리자 로그인 상태 복원
  if(isAdminLoggedIn()){
    renderAdmin();
    go('s-admin', true, false);
  }
}
async function initFirebase(){
  if(!window.PAT_DB) return;
  const ok = PAT_DB.init();
  if(!ok){ console.log('[PAT] 로컬 모드'); return; }
  console.log('[PAT] Firebase 모드 활성화');

  // 1️⃣ Firebase에서 설정(구절, 앱제목) 로드
  const config = await PAT_DB.getConfig(DB.church.code);
  let cloudVerse = config && config.verse ? config.verse : null;
  if(!cloudVerse && PAT_DB.getLatestVerse) {
    cloudVerse = await PAT_DB.getLatestVerse(DB.church.code);
  }
  if(cloudVerse) {
    DB.verse = cloudVerse;
    saveVerses([cloudVerse]);
    console.log('[PAT] Firebase 구절 로드됨:', DB.verse.ref);
  }
  if(config && config.appTitle) {
    localStorage.setItem('pat_app_title', config.appTitle);
    applyAppTitle();
  }

  // 2️⃣ 설정 폴링 구독 (구절 + 앱제목)
  PAT_DB.subscribeConfig(DB.church.code, config => {
    if(config.verse) {
      DB.verse = { ref:config.verse.ref, text:config.verse.text, weekOf:config.verse.weekOf };
    }
    if(config.appTitle) {
      localStorage.setItem('pat_app_title', config.appTitle);
      applyAppTitle();
    }
    const activeId = document.querySelector('.screen.active')?.id;
    if(activeId==='s-family') renderFamily();
    else if(activeId==='s-verse') renderVerse();
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

function adminLogin(){
  const id = document.getElementById('adminId').value.trim();
  const pw = document.getElementById('adminPw').value.trim();
  if(id !== ADMIN.id || pw !== ADMIN.pw){ toast('아이디 또는 비밀번호가 올바르지 않습니다'); return; }
  localStorage.setItem('pat_admin_id', id);
  localStorage.setItem('pat_admin_pw', pw);
  document.getElementById('adminPw').value = '';
  setAdminLoggedIn(true);
  renderAdmin();
  go('s-admin');
  toast('✓ 관리자로 로그인되었습니다');
}
function adminLogout(){
  localStorage.removeItem('pat_admin_id');
  localStorage.removeItem('pat_admin_pw');
  setAdminLoggedIn(false);
  go('s-login');
  toast('로그아웃되었습니다');
}
function memberLogout(){
  const code = document.getElementById('churchCode');
  if(code) code.value = '';
  go('s-login');
  toast('로그아웃되었습니다');
}
function renderAdmin(){
  document.getElementById('adminChurchLabel').textContent = '관리 교회: '+DB.church.name;
  document.getElementById('inAppTitle').value = applyAppTitle();
  document.getElementById('inChurchName').value = DB.church.name;
  if(!document.getElementById('inDate').value){
    document.getElementById('inDate').value = new Date().toISOString().slice(0,10);
  }
  updateWeekFromDate();
  renderVerseList();
  renderPreview();
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

function go(id, resetScroll=true, animate=true){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active','no-motion'));
  const target = document.getElementById(id);
  if(!target) return;
  if(!animate) target.classList.add('no-motion');
  target.classList.add('active');
  const tabbar = document.getElementById('tabbar');
  const noTab = ['s-login','s-adminlogin','s-admin','s-family-register','s-invite','s-reset-pw'];
  tabbar.style.display = noTab.includes(id) ? 'none' : 'flex';
  document.querySelectorAll('.tab').forEach(t=>{
    t.classList.toggle('active', t.dataset.screen===id);
  });
  if(id==='s-verse'){ renderVerse(); }
  else if(id==='s-family'){ renderFamily(); }
  else if(id==='s-dashboard'){ renderDashboard(); }
  else if(id==='s-prayer'){ renderPrayer(); }
  if(resetScroll) window.scrollTo(0,0);

  // 브라우저 히스토리 관리 — 모바일 대응: 해시(#id)로 URL 구분
  if(!_poppingState && typeof history !== 'undefined'){
    const isAuthScreen = ['s-login','s-adminlogin'].includes(id);
    if(isAuthScreen){
      // 로그인 화면은 replace — 뒤로가기로 로그인화면 재진입 방지
      history.replaceState({ screen: id }, '', _screenUrl(id));
    } else {
      history.pushState({ screen: id }, '', _screenUrl(id));
    }
  }
}
function tabGo(id){ go(id); }

// 브라우저/모바일 뒤로가기 처리
if(typeof window !== 'undefined' && window.history){
  window.addEventListener('popstate', e => {
    // state 우선, 없으면 해시에서 추출 (모바일 폴백)
    const hash = location.hash.replace('#','');
    const screen = e.state?.screen
      || (hash && document.getElementById(hash) ? hash : null)
      || 's-family';
    _poppingState = true;
    go(screen, true, false);
    _poppingState = false;
  });
  // 초기 상태: 해시 없이 replaceState
  history.replaceState({ screen: 's-login' }, '', location.pathname + location.search);
}

// ── 교회 입장 ─────────────────────────────────────────────
function enterChurch(){
  const code = document.getElementById('churchCode').value.trim();
  const profile = loadFamilyProfile();
  const famPw = profile?.familyPassword;
  const hasCustomPw = famPw && famPw !== DB.church.code;
  if(hasCustomPw){
    if(code !== famPw){ toast('가족 비밀번호가 올바르지 않습니다 — 가족 외 접근 불가'); return; }
  } else {
    if(code !== DB.church.code && !(famPw && code === famPw)){
      toast('교회 코드가 올바르지 않습니다'); return;
    }
  }
  document.getElementById('churchName').textContent = memberHomeTitle();
  renderMemberDateLabels();
  renderFamily();
  go('s-family');
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

// ── DOM 이벤트 (body 내 스크립트이므로 DOM 준비 완료) ─────
document.getElementById('churchCode').addEventListener('keyup',e=>{ if(e.key==='Enter') enterChurch(); });
document.getElementById('adminPw').addEventListener('keyup',e=>{ if(e.key==='Enter') adminLogin(); });
