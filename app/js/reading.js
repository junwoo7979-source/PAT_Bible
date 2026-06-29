// ====== PAT Bible — reading.js ======
// 성경읽기표 = 오늘의 바이블버스 (날짜별 통독 본문 메뉴)

// ── 오늘의 바이블버스 (통독 계획) ────────────────────
// 약어 → 정식 책이름 (메뉴 표시용)
const PAT_BOOK_FULL = {
  '창':'창세기','출':'출애굽기','레':'레위기','민':'민수기','신':'신명기',
  '수':'여호수아','삿':'사사기','룻':'룻기','삼상':'사무엘상','삼하':'사무엘하',
  '왕상':'열왕기상','왕하':'열왕기하','대상':'역대상','대하':'역대하','스':'에스라',
  '느':'느헤미야','에':'에스더','욥':'욥기','시':'시편','잠':'잠언',
  '전':'전도서','아':'아가','사':'이사야','렘':'예레미야','애':'예레미야애가',
  '겔':'에스겔','단':'다니엘','호':'호세아','욜':'요엘','암':'아모스',
  '옵':'오바댜','욘':'요나','미':'미가','나':'나훔','합':'하박국',
  '습':'스바냐','학':'학개','슥':'스가랴','말':'말라기',
  '마':'마태복음','막':'마가복음','눅':'누가복음','요':'요한복음','행':'사도행전',
  '롬':'로마서','고전':'고린도전서','고후':'고린도후서','갈':'갈라디아서','엡':'에베소서',
  '빌':'빌립보서','골':'골로새서','살전':'데살로니가전서','살후':'데살로니가후서','딤전':'디모데전서',
  '딤후':'디모데후서','딛':'디도서','몬':'빌레몬서','히':'히브리서','약':'야고보서',
  '벧전':'베드로전서','벧후':'베드로후서','요일':'요한일서','요이':'요한이서','요삼':'요한삼서',
  '유':'유다서','계':'요한계시록'
};
const PAT_WEEKDAY = ['일','월','화','수','목','금','토'];

function _pad2(n){ return (n<10?'0':'')+n; }
function _readingTodayKey(){
  const d=new Date();
  return _pad2(d.getMonth()+1)+'-'+_pad2(d.getDate());
}
function _readingTodayPlan(){
  try { return (window.PAT_PLAN||{})[_readingTodayKey()] || null; }
  catch(e){ return null; }
}
// 약어+장범위 → "정식책이름 장범위" (시편/잠언은 숫자만 들어옴)
function _readingFullLabel(track, raw){
  if(track==='si') return '시편 '+raw;
  if(track==='pr') return '잠언 '+raw;
  const sp=raw.indexOf(' ');
  if(sp<0) return raw;
  const ab=raw.slice(0,sp), rest=raw.slice(sp+1);
  return (PAT_BOOK_FULL[ab]||ab)+' '+rest;
}

// 오늘의 바이블버스 메뉴 렌더
const _READING_TRACKS=[
  {k:'si', i:0, emoji:'🎵', name:'시편'},
  {k:'ot', i:1, emoji:'📜', name:'구약'},
  {k:'nt', i:2, emoji:'✝️', name:'신약'},
  {k:'pr', i:3, emoji:'💡', name:'잠언'}
];
function renderTodayPlan(){
  const dateEl=document.getElementById('todayPlanDate');
  const menuEl=document.getElementById('todayPlanMenu');
  if(!menuEl) return;
  const d=new Date();
  if(dateEl) dateEl.textContent=(d.getMonth()+1)+'월 '+d.getDate()+'일 ('+PAT_WEEKDAY[d.getDay()]+')';
  const plan=_readingTodayPlan(); // [si, ot, nt, pr]
  if(!plan){
    menuEl.innerHTML='<p class="muted" style="grid-column:1/-1;text-align:center;padding:10px">오늘 날짜의 통독표가 없습니다.</p>';
    return;
  }
  let html='';
  _READING_TRACKS.forEach(t=>{
    const raw=plan[t.i]||'';
    // 시편/잠언은 트랙명이 곧 책이름이라 값(숫자)만 표시, 구약/신약은 정식 책이름+장
    const label=(t.k==='si'||t.k==='pr') ? raw : _readingFullLabel(t.k, raw);
    html+='<button onclick="openTodayReading(\''+t.k+'\')" '+
      'style="position:relative;text-align:left;padding:12px 26px 12px 14px;border:none;border-left:4px solid var(--accent);border-radius:12px;cursor:pointer;background:var(--surface);transition:transform .05s" '+
      'ontouchstart="" onmousedown="this.style.transform=\'scale(.97)\'" onmouseup="this.style.transform=\'\'" onmouseleave="this.style.transform=\'\'">'+
      '<div class="muted" style="font-size:calc(var(--fs)-5px);font-weight:700">'+t.emoji+' '+t.name+'</div>'+
      '<div style="font-weight:800;font-size:calc(var(--fs)+1px);margin-top:3px;color:var(--text)">'+label+'</div>'+
      '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--accent);font-weight:800;font-size:calc(var(--fs)+2px)">›</span>'+
      '</button>';
  });
  menuEl.innerHTML=html;
}
// 메뉴 탭 → (추후) 성경 본문 연동. 현재는 안내.
function openTodayReading(track){
  const plan=_readingTodayPlan();
  if(!plan){ if(typeof toast==='function')toast('오늘 통독표가 없습니다'); return; }
  const map={si:0,ot:1,nt:2,pr:3};
  const label=_readingFullLabel(track, plan[map[track]]||'');
  if(typeof toast==='function')
    toast('📖 '+label+' · 성경 본문 연동 준비 중 (개역개정 API)');
}

// ── 렌더 ─────────────────────────────────────────────
// 성경읽기표 = 오늘의 바이블버스 메뉴 (66권 체크 목록은 제거됨)
function renderReading(){
  renderTodayPlan();
}
