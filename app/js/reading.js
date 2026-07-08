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
  {k:'si', i:0, emoji:'', name:'시편'},
  {k:'ot', i:1, emoji:'', name:'구약'},
  {k:'nt', i:2, emoji:'', name:'신약'},
  {k:'pr', i:3, emoji:'', name:'잠언'}
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
    // 한 줄 표시(트랙명 라벨 제거). 시편/잠언은 값이 숫자뿐이라 앞에 이름을 붙여 구분,
    // 구약/신약은 값 자체가 책이름+장이라 라벨 없이 그것만 표시.
    const text=(t.k==='si'||t.k==='pr') ? (t.name+' '+raw) : _readingFullLabel(t.k, raw);
    html+='<button data-rtrack="'+t.k+'" onclick="openTodayReading(\''+t.k+'\')" '+
      'style="text-align:center;padding:12px 6px;border:none;border-top:4px solid var(--accent);border-radius:12px;cursor:pointer;background:var(--surface);transition:transform .05s;word-break:keep-all;line-height:1.35;min-height:64px;display:flex;align-items:center;justify-content:center" '+
      'ontouchstart="" onmousedown="this.style.transform=\'scale(.97)\'" onmouseup="this.style.transform=\'\'" onmouseleave="this.style.transform=\'\'">'+
      '<div style="font-weight:800;font-size:calc(var(--fs)-2px);color:var(--text)">'+text+'</div>'+
      '</button>';
  });
  menuEl.innerHTML=html;
  // 날짜/메뉴 새로 그릴 때 열린 본문은 닫는다
  closeTodayReading();
}

// 선택 버튼 강조 (자식: [0]본문값)
function _highlightTrack(track){
  document.querySelectorAll('#todayPlanMenu button[data-rtrack]').forEach(b=>{
    const on=(b.getAttribute('data-rtrack')===track);
    b.style.background = on ? 'var(--accent)' : 'var(--surface)';
    const kids=b.children;
    if(kids[0]) kids[0].style.color = on ? '#fff' : 'var(--text)';   // 본문값
  });
}

// 메뉴 탭 → 같은 화면 아래에 본문 펼치기 (토글)
let _readingActiveTrack=null;
const _READ_TRACK_IDX={si:0,ot:1,nt:2,pr:3};
// 오늘 이 트랙의 planId (reading_plan/reading_progress 공용): "MM-DD:track"
function _todayPlanId(track){ return _readingTodayKey()+':'+track; }

async function openTodayReading(track){
  const plan=_readingTodayPlan();
  if(!plan){ if(typeof toast==='function')toast('오늘 통독표가 없습니다'); return; }
  if(_readingActiveTrack===track){ closeTodayReading(); return; } // 같은 버튼 → 닫기
  const raw=plan[_READ_TRACK_IDX[track]]||'';
  const ref=_readingFullLabel(track, raw);
  _readingActiveTrack=track;
  // ★ 오늘 통독 읽음 기록 (홈 '오늘의 달성률' 점수에 반영) — 키 = todayKey()(YYYY-MM-DD)
  try{
    const k = (typeof todayKey==='function') ? todayKey() : new Date().toISOString().slice(0,10);
    localStorage.setItem('pat_read_done_'+k,'1');
  }catch(e){}
  _highlightTrack(track);
  const pane=document.getElementById('todayReadingPane');
  const title=document.getElementById('todayReadingTitle');
  const body=document.getElementById('todayReadingBody');
  if(title) title.textContent='📖 '+ref+'  ·  개역한글';
  if(pane){ pane.style.display='block'; pane.scrollIntoView({behavior:'smooth', block:'nearest'}); }
  if(body){
    body.innerHTML='<p class="muted" style="text-align:center;padding:18px">본문 불러오는 중…</p>';
    // 오프라인이어도 IndexedDB(로컬)에서 조회 → 인터넷 불필요
    const html=await _loadPassageHtml(track, raw, ref);
    if(_readingActiveTrack===track) body.innerHTML=html;   // 그 사이 다른 버튼 눌렀으면 무시
  }
}
function closeTodayReading(){
  _readingActiveTrack=null;
  const pane=document.getElementById('todayReadingPane');
  if(pane) pane.style.display='none';
  _highlightTrack(null);
}

// ★ 성경 본문 HTML — IndexedDB(로컬 저장 개역한글)에서 조회.
//   전체 성경 데이터가 아직 없는 책은 빈 화면 대신 안내를 표시한다(빈 화면 금지).
async function _loadPassageHtml(track, raw, ref){
  const planId=_todayPlanId(track);
  const done = await _isReadingDone(planId);
  const footer=_completeBtnHtml(planId, done);
  try{
    const DB=window.PAT_BIBLE_DB;
    if(!DB || !DB.supported()) return _passageNotice(ref, '이 기기에서는 로컬 성경 저장을 지원하지 않습니다.')+footer;
    const parsed=(typeof parseRef==='function') ? parseRef(track, raw) : null;
    if(!parsed || !parsed.segments || !parsed.segments.length) return _passageNotice(ref, '본문 위치를 해석하지 못했습니다.')+footer;
    const multiBook = parsed.segments.length>1;   // 교차-책(예: 암 8~옵1)
    let inner='', found=0;
    for(const seg of parsed.segments){
      if(!seg.spec) continue;
      const chs=(typeof chaptersInSpec==='function') ? (chaptersInSpec(seg.spec)||[]) : [];
      const multiCh = chs.length>1 || multiBook;
      let bookHeaded=false;
      for(const ch of chs){
        const verses=await DB.getChapterVerses(seg.bookId, ch);
        const sel=(verses||[]).filter(v=> verseInSpec(seg.spec, v.chapterNumber, v.verseNumber));
        if(!sel.length) continue;
        if(multiBook && !bookHeaded){
          inner+='<div style="font-weight:800;color:var(--accent);margin:16px 0 6px;font-size:calc(var(--fs)+1px)">'+_esc(seg.book.ko)+'</div>';
          bookHeaded=true;
        }
        if(multiCh) inner+='<div style="font-weight:700;color:var(--muted);margin:12px 0 4px">'+ch+'장</div>';
        sel.forEach(v=>{
          inner+='<p style="margin:0 0 8px"><sup style="color:var(--accent);font-weight:700;margin-right:5px">'+v.verseNumber+'</sup>'+_esc(v.text)+'</p>';
        });
        found+=sel.length;
      }
    }
    if(!found) return _passageNotice(ref, '이 본문은 전체 성경 데이터 도입 후 표시됩니다.')+footer;
    return '<div style="line-height:1.9">'+inner+'</div>'+footer;
  }catch(e){
    return _passageNotice(ref, '본문을 불러오지 못했습니다: '+(e&&e.message||''))+footer;
  }
}
function _passageNotice(ref, msg){
  return '<div style="text-align:center;padding:22px 8px">'+
    '<div style="font-size:calc(var(--fs)+2px);font-weight:800;color:var(--accent)">'+_esc(ref)+'</div>'+
    '<p class="muted" style="margin-top:12px;line-height:1.7">'+msg+'</p></div>';
}
function _completeBtnHtml(planId, done){
  const label=done?'✅ 오늘 읽기 완료됨':'오늘 읽기 완료';
  const bg=done?'var(--surface)':'var(--accent)';
  const col=done?'var(--muted)':'#fff';
  return '<button id="readingDoneBtn" onclick="completeTodayReading(\''+planId+'\')" '+
    'style="margin-top:16px;width:100%;padding:13px;border:none;border-radius:12px;cursor:pointer;'+
    'font-weight:800;font-size:var(--fs);background:'+bg+';color:'+col+'">'+label+'</button>';
}
function _esc(s){ return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

async function _isReadingDone(planId){
  try{ if(window.PAT_READING_PROGRESS) return await window.PAT_READING_PROGRESS.isComplete(planId); }catch(e){}
  return false;
}
// 읽기 완료 저장(로컬 우선, 온라인 시 동기화) — 중복 클릭해도 1건만.
async function completeTodayReading(planId){
  try{
    if(window.PAT_READING_PROGRESS) await window.PAT_READING_PROGRESS.markComplete(planId);
  }catch(e){}
  try{
    const k=(typeof todayKey==='function')?todayKey():new Date().toISOString().slice(0,10);
    localStorage.setItem('pat_read_done_'+k,'1');
  }catch(e){}
  const btn=document.getElementById('readingDoneBtn');
  if(btn){ btn.textContent='✅ 오늘 읽기 완료됨'; btn.style.background='var(--surface)'; btn.style.color='var(--muted)'; }
  if(typeof toast==='function') toast('오늘 읽기 완료 ✅');
}

// ── 렌더 ─────────────────────────────────────────────
// 성경읽기표 = 오늘의 바이블버스 메뉴 (66권 체크 목록은 제거됨)
function renderReading(){
  renderTodayPlan();
}
