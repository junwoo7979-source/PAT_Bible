// ====== PAT Bible — verse.js ======
// 구절 등록/목록/적용, 날짜·주차 포맷, 관리자 미리보기

function formatWeekPeriod(dateValue){
  if(!dateValue) return '';
  const picked = new Date(dateValue+'T00:00:00');
  if(Number.isNaN(picked.getTime())) return '';
  const monday = new Date(picked);
  const day = (picked.getDay()+6)%7;
  monday.setDate(picked.getDate()-day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate()+6);
  const monthStart = new Date(monday.getFullYear(), monday.getMonth(), 1);
  const week = Math.floor((monday.getDate()-1)/7)+1;
  const weekdays = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
  const dateLabel = d => `${d.getMonth()+1}월 ${d.getDate()}일 ${weekdays[d.getDay()]}`;
  return `${monthStart.getFullYear()}년 ${monthStart.getMonth()+1}월 ${week}주차 · ${dateLabel(monday)} ~ ${dateLabel(sunday)}`;
}
function updateWeekFromDate(){
  const week = formatWeekPeriod(document.getElementById('inDate').value);
  if(week) document.getElementById('inWeek').value = week;
  renderPreview();
}
function formatTodayLabel(dateValue){
  if(!dateValue) return '';
  const date = new Date(dateValue+'T00:00:00');
  if(Number.isNaN(date.getTime())) return '';
  const weekdays = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
  return `오늘은 ${date.getMonth()+1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}입니다`;
}
function renderMemberDateLabels(dateValue=new Date().toISOString().slice(0,10)){
  const week  = formatWeekPeriod(dateValue);
  const today = formatTodayLabel(dateValue);
  document.getElementById('weekLabel').textContent   = week;
  document.getElementById('familyToday').textContent = today;
  document.getElementById('verseWeek').textContent   = week;
  document.getElementById('verseToday').textContent  = today;
}

// ── 관리자 화면 미리보기 ──────────────────────────────────
function renderPreview(){
  const ref  = (document.getElementById('inRef').value.trim())  || DB.verse.ref;
  const week = (document.getElementById('inWeek').value.trim()) || DB.verse.weekOf;
  const text = (document.getElementById('inText').value.trim()) || DB.verse.text;
  document.getElementById('pvChurch').textContent = DB.church.name;
  document.getElementById('pvRef').textContent    = ref;
  document.getElementById('pvWeek').textContent   = week;
  document.getElementById('pvText').textContent   = text;
}
function saveChurchName(){
  const name = document.getElementById('inChurchName').value.trim();
  if(!name){ toast('교회 이름을 입력하세요'); return; }
  DB.church.name = name;
  localStorage.setItem('pat_church_name', name);
  document.getElementById('adminChurchLabel').textContent = '관리 교회: '+name;
  renderPreview();
  toast('✓ 교회 이름이 저장되었습니다');
}
function saveAppTitle(){
  const title = document.getElementById('inAppTitle').value.trim();
  if(!title){ toast('앱 상단 제목을 입력하세요'); return; }
  localStorage.setItem('pat_app_title', title);
  applyAppTitle();
  toast('✓ 앱 상단 제목이 저장되었습니다');
}

// ── 구절 등록 / 목록 / 적용 ──────────────────────────────
async function registerVerse(){
  const ref  = document.getElementById('inRef').value.trim();
  const week = document.getElementById('inWeek').value.trim();
  const text = document.getElementById('inText').value.trim();
  if(!ref||!text){ toast('출처와 본문을 입력하세요'); return; }

  const vs = loadVerses();
  vs.unshift({ ref, weekOf:week||'(주차 미지정)', text, createdAt:new Date().toISOString() });
  saveVerses(vs);
  DB.verse = { ref, weekOf:week||'(주차 미지정)', text };

  // 목록 먼저 갱신 (추가된 구절이 보이도록)
  renderVerseList();
  renderPreview();

  // 입력 필드 비우기
  document.getElementById('inRef').value  = '';
  document.getElementById('inText').value = '';

  // 스크롤: 목록이 보이는 영역으로 이동
  const verseListEl = document.getElementById('verseList');
  if (verseListEl) {
    verseListEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Firebase에 저장 시도 (최신 설정 함수 사용)
  if(window.PAT_DB && PAT_DB.ready()){
    const appTitle = localStorage.getItem('pat_app_title') || DB.church.name;
    const verse = { ref, weekOf:week||'(주차 미지정)', text };
    const ok = await PAT_DB.saveConfig(DB.church.code, appTitle, verse);
    if(ok) {
      toast('✅ 구절 저장됨! 📖 모든 기기에 동기화됩니다');
      console.log('[PAT] Firebase 저장 성공:', { ref, text: text.substring(0, 30) });
    } else {
      toast('⚠️ 로컬 저장만 완료 (클라우드 동기화 실패 — 관리자 토큰 확인)');
      console.error('[PAT] Firebase 저장 실패');
    }
  } else {
    toast('✓ 구절 등록 완료 (로컬 모드)');
  }
}
function renderVerseList(){
  const vs = loadVerses();
  const el  = document.getElementById('verseList');
  if(!vs.length){ el.innerHTML = '<p class="muted">아직 등록된 구절이 없습니다.</p>'; return; }
  el.innerHTML = vs.map((v,i)=>
    `<div class="member"><span><b style="color:var(--accent)">${esc(v.ref)}</b><br>
     <small class="muted">${esc(v.weekOf)}</small></span>
     ${i===0?'<span class="tag-ok">현재</span>':'<button class="btn sm ghost" onclick="useVerse('+i+')">적용</button>'}</div>`
  ).join('');
}
function useVerse(i){
  const vs = loadVerses();
  const picked = vs.splice(i,1)[0];
  vs.unshift(picked); saveVerses(vs);
  DB.verse = { ref:picked.ref, weekOf:picked.weekOf, text:picked.text };
  renderVerseList();
  renderPreview();
  toast('✓ 해당 구절을 현재 구절로 적용했습니다');
}
