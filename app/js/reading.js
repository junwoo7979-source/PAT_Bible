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

// ── 렌더 ─────────────────────────────────────────────
function renderReading(){
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
