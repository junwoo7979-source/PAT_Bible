// ====== PAT Bible — reading.js ======
// 성경읽기표: 66권 장별 읽기 체크 + 진행률 (구성원 개인별, localStorage 저장)

// 성경 66권 [이름, 장수]
const PAT_BIBLE_OT = [
  ['창세기',50],['출애굽기',40],['레위기',27],['민수기',36],['신명기',34],
  ['여호수아',24],['사사기',21],['룻기',4],['사무엘상',31],['사무엘하',24],
  ['열왕기상',22],['열왕기하',25],['역대상',29],['역대하',36],['에스라',10],
  ['느헤미야',13],['에스더',10],['욥기',42],['시편',150],['잠언',31],
  ['전도서',12],['아가',8],['이사야',66],['예레미야',52],['예레미야애가',5],
  ['에스겔',48],['다니엘',12],['호세아',14],['요엘',3],['아모스',9],
  ['오바댜',1],['요나',4],['미가',7],['나훔',3],['하박국',3],
  ['스바냐',3],['학개',2],['스가랴',14],['말라기',4]
];
const PAT_BIBLE_NT = [
  ['마태복음',28],['마가복음',16],['누가복음',24],['요한복음',21],['사도행전',28],
  ['로마서',16],['고린도전서',16],['고린도후서',13],['갈라디아서',6],['에베소서',6],
  ['빌립보서',4],['골로새서',4],['데살로니가전서',5],['데살로니가후서',3],['디모데전서',6],
  ['디모데후서',4],['디도서',3],['빌레몬서',1],['히브리서',13],['야고보서',5],
  ['베드로전서',5],['베드로후서',3],['요한일서',5],['요한이서',1],['요한삼서',1],
  ['유다서',1],['요한계시록',22]
];

let _readingTestament = 'ot'; // 'ot' | 'nt'
let _readingOpenBook = null;  // 현재 펼쳐진 책 키 (예: 'ot-0')

// ── 오늘의 통독 (바이블버스 계획) ────────────────────
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

// ── 저장 키 / 데이터 ──────────────────────────────────
function _readingMember(){
  try { return (typeof currentPrayerMember==='function' && currentPrayerMember()) || '나'; }
  catch(e){ return '나'; }
}
function _readingFamilyId(){
  try { return localStorage.getItem('pat_family_id')||'local'; } catch(e){ return 'local'; }
}
function _readingKey(){
  return 'pat_reading_'+_readingFamilyId()+'_'+_readingMember();
}
function _readingLoad(){
  try { return JSON.parse(localStorage.getItem(_readingKey())||'{}') || {}; }
  catch(e){ return {}; }
}
function _readingStore(data){
  try { localStorage.setItem(_readingKey(), JSON.stringify(data)); } catch(e){}
}
// data 구조: { "ot-0": {1:1, 2:1}, "nt-3": {1:1} }  (책키 → 읽은 장 맵)

function _readingBooks(testament){
  return testament==='nt' ? PAT_BIBLE_NT : PAT_BIBLE_OT;
}
function _readingTotalChapters(){
  let t=0;
  PAT_BIBLE_OT.forEach(b=>t+=b[1]);
  PAT_BIBLE_NT.forEach(b=>t+=b[1]);
  return t;
}
function _readingDoneCount(data){
  let n=0;
  Object.keys(data||{}).forEach(k=>{ n += Object.keys(data[k]||{}).length; });
  return n;
}

// ── 토글 ─────────────────────────────────────────────
function toggleReadingChapter(bookKey, ch){
  const data=_readingLoad();
  if(!data[bookKey]) data[bookKey]={};
  if(data[bookKey][ch]) delete data[bookKey][ch];
  else data[bookKey][ch]=1;
  if(Object.keys(data[bookKey]).length===0) delete data[bookKey];
  _readingStore(data);
  renderReading();
}
function toggleReadingBookAll(bookKey, total){
  const data=_readingLoad();
  const cur=data[bookKey]||{};
  const allDone = Object.keys(cur).length>=total;
  if(allDone){ delete data[bookKey]; }
  else { const m={}; for(let i=1;i<=total;i++) m[i]=1; data[bookKey]=m; }
  _readingStore(data);
  renderReading();
}
function openReadingBook(bookKey){
  _readingOpenBook = (_readingOpenBook===bookKey) ? null : bookKey;
  renderReading();
}
function switchReadingTab(testament){
  _readingTestament = (testament==='nt') ? 'nt' : 'ot';
  _readingOpenBook = null;
  renderReading();
}

// 오늘의 통독 메뉴 렌더
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
    const label=_readingFullLabel(t.k, raw);
    html+='<button onclick="openTodayReading(\''+t.k+'\')" '+
      'style="text-align:left;padding:12px 14px;border:none;border-radius:12px;cursor:pointer;background:var(--surface)">'+
      '<div class="muted" style="font-size:calc(var(--fs)-5px);font-weight:700">'+t.emoji+' '+t.name+'</div>'+
      '<div style="font-weight:800;font-size:calc(var(--fs)+1px);margin-top:3px;color:var(--text)">'+label+'</div>'+
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
function renderReading(){
  renderTodayPlan();
  const data=_readingLoad();
  // 전체 진행률
  const total=_readingTotalChapters();
  const done=_readingDoneCount(data);
  const pct = total? Math.round(done/total*100) : 0;
  const sumEl=document.getElementById('readingSummary');
  if(sumEl){
    sumEl.innerHTML =
      '<div style="font-size:calc(var(--fs) + 16px);font-weight:800;color:var(--accent);line-height:1.1">'+pct+'%</div>'+
      '<div class="bar" style="margin-top:10px"><span style="width:'+pct+'%"></span></div>'+
      '<p class="muted" style="margin-top:8px">읽은 장 '+done+' / '+total+'장 · '+_readingMember()+'</p>';
  }
  // 탭 버튼 색
  ['ot','nt'].forEach(t=>{
    const btn=document.querySelector('.read-tab[data-rtab="'+t+'"]');
    if(btn){ const on=(t===_readingTestament);
      btn.style.background=on?'var(--accent)':'var(--surface)';
      btn.style.color=on?'#fff':'var(--text)'; }
  });
  // 책 목록
  const listEl=document.getElementById('readingBookList');
  if(!listEl) return;
  const books=_readingBooks(_readingTestament);
  const prefix=_readingTestament;
  let html='';
  books.forEach((b,i)=>{
    const name=b[0], chs=b[1];
    const key=prefix+'-'+i;
    const map=data[key]||{};
    const rd=Object.keys(map).length;
    const bpct = chs? Math.round(rd/chs*100):0;
    const open=(_readingOpenBook===key);
    const complete=(rd>=chs);
    html+='<div class="card" style="margin-top:8px;padding:12px 14px">';
    // 책 헤더
    html+='<div onclick="openReadingBook(\''+key+'\')" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;gap:10px">';
    html+='<div style="flex:1;min-width:0">';
    html+='<div style="font-weight:700;font-size:var(--fs)">'+(complete?'✅ ':'')+name+'</div>';
    html+='<div class="bar" style="margin-top:6px;height:6px"><span style="width:'+bpct+'%"></span></div>';
    html+='</div>';
    html+='<div style="text-align:right;white-space:nowrap"><span style="font-weight:700;color:'+(complete?'var(--accent)':'var(--text)')+'">'+rd+'</span><span class="muted">/'+chs+'장</span><div class="muted" style="font-size:calc(var(--fs)-6px)">'+(open?'▲':'▼')+'</div></div>';
    html+='</div>';
    // 펼친 장 그리드
    if(open){
      html+='<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px">';
      for(let c=1;c<=chs;c++){
        const on=!!map[c];
        html+='<button onclick="toggleReadingChapter(\''+key+'\','+c+')" style="width:38px;height:38px;border:none;border-radius:8px;font-weight:700;font-size:calc(var(--fs)-3px);cursor:pointer;background:'+(on?'var(--accent)':'var(--surface)')+';color:'+(on?'#fff':'var(--text)')+'">'+c+'</button>';
      }
      html+='</div>';
      html+='<button onclick="toggleReadingBookAll(\''+key+'\','+chs+')" style="margin-top:10px;width:100%;padding:9px 0;border:none;border-radius:10px;font-weight:700;font-size:calc(var(--fs)-2px);cursor:pointer;background:var(--surface);color:var(--accent)">'+(complete?'전체 해제':'전체 읽음 체크')+'</button>';
    }
    html+='</div>';
  });
  listEl.innerHTML=html;
}
