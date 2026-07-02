// ====== PAT Bible — verse.js ======
// 구절 등록/목록/적용, 날짜·주차 포맷, 관리자 미리보기

// ★ 2026-07-03 FIX: 로컬(기기) 시간대 기준 오늘 날짜(YYYY-MM-DD).
//   toISOString()은 UTC라 KST 00:00~09:00 사이엔 '오늘'이 어제로 계산되는 버그가 있었음.
function patLocalToday(){
  const n = new Date();
  const p = x => (x<10?'0':'')+x;
  return n.getFullYear()+'-'+p(n.getMonth()+1)+'-'+p(n.getDate());
}

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
function renderMemberDateLabels(dateValue){
  if(!dateValue) dateValue = patLocalToday();
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
  const pastor = (document.getElementById('inPastor')?.value || '').trim();
  const addr   = (document.getElementById('inChurchAddr')?.value || '').trim();
  DB.church.name = name;
  localStorage.setItem('pat_church_name', name);
  // ★ 교회 이름 = 앱 상단 제목 자동 동기화 (별도 입력/버튼 없이)
  localStorage.setItem('pat_app_title', name);
  applyAppTitle();
  // 담임목사·주소 저장
  localStorage.setItem('pat_church_pastor', pastor);
  localStorage.setItem('pat_church_addr', addr);
  document.getElementById('adminChurchLabel').textContent = '관리 교회: '+name;
  renderPreview();
  // ★ 서버에도 앱 제목(=교회 이름) 저장 → 그 교회 교인들에게도 동일하게 표시
  if(window.PAT_DB && PAT_DB.ready() && PAT_DB.saveConfig && DB.church.code){
    PAT_DB.saveConfig(DB.church.code, name);
  }
  toast('✓ 교회 정보가 저장되었습니다');
}
function saveAppTitle(){
  const title = document.getElementById('inAppTitle').value.trim();
  if(!title){ toast('앱 상단 제목을 입력하세요'); return; }
  localStorage.setItem('pat_app_title', title);
  applyAppTitle();
  toast('✓ 앱 상단 제목이 저장되었습니다');
}

// ── 교회 로고 업로드 ──────────────────────────────────────
function handleLogoUpload(event){
  const file = event.target.files?.[0];
  if(!file){ return; }

  // SVG 확장자 확인
  if(!file.name.toLowerCase().endsWith('.svg')){
    toast('❌ SVG 파일만 업로드 가능합니다');
    document.getElementById('churchLogoFile').value = '';
    return;
  }

  // 파일 크기 확인 (최대 500KB)
  const maxSize = 500 * 1024; // 500KB
  if(file.size > maxSize){
    toast(`❌ 파일 크기가 너무 큽니다 (${(file.size/1024).toFixed(0)}KB / 최대 500KB)`);
    document.getElementById('churchLogoFile').value = '';
    return;
  }

  // SVG 파일 읽기
  const reader = new FileReader();
  reader.onload = (e) => {
    const svgContent = e.target?.result;
    if(typeof svgContent !== 'string'){
      toast('❌ 파일 읽기 실패');
      return;
    }

    // SVG 유효성 확인
    if(!svgContent.includes('<svg')){
      toast('❌ 유효한 SVG 파일이 아닙니다');
      document.getElementById('churchLogoFile').value = '';
      return;
    }

    // localStorage에 저장 (churchCode 기반)
    const key = `pat_church_logo_${DB.church.code}`;
    try {
      localStorage.setItem(key, svgContent);

      // 미리보기 표시
      const preview = document.getElementById('logoPreview');
      const previewImg = document.getElementById('logoPreviewImg');
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      previewImg.src = url;
      preview.style.display = 'block';

      toast('✓ 교회 로고가 저장되었습니다');
    } catch(err){
      toast('❌ 저장 실패: localStorage 용량 초과');
      console.error('Logo save error:', err);
    }
  };
  reader.readAsText(file);
}

function removeChurchLogo(){
  const key = `pat_church_logo_${DB.church.code}`;
  localStorage.removeItem(key);
  document.getElementById('churchLogoFile').value = '';
  document.getElementById('logoPreview').style.display = 'none';
  toast('✓ 교회 로고가 삭제되었습니다');
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
