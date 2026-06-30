// ====== PAT Bible — history.js ======
// 수행 기록(history): 오늘 상태와 분리된 '날짜별 영구 기록'을 저장/조회한다.
//  - 저장: 로컬 미러(pat_hist_<날짜>, 날짜별 누적·덮어쓰기 없음) + 서버 records(권위 저장소)
//  - 조회: 일별 / 주간 / 월별 — 가족별 완료율, 개인별 완료 여부, 전체 완료율
//  ⚠️ 이 파일은 '오늘 상태(pat_daily_tasks_* 등)'를 절대 건드리지 않는다.
//  ⚠️ 어떤 함수도 기록을 삭제하지 않는다(시상 근거 보존).

// ── 로컬 수행 기록 미러 (날짜별 누적) ───────────────────────────
function _patHistKey(date){ return 'pat_hist_' + date; }

// 한 건 기록 — 같은 (날짜·미션·구성원)은 갱신(누적), 다른 날짜는 영향 없음. 삭제 없음.
function recordMissionHistory(entry){
  if(!entry || !entry.date) return;
  try{
    const key = _patHistKey(entry.date);
    let arr = [];
    try{ arr = JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){ arr = []; }
    if(!Array.isArray(arr)) arr = [];
    const mid = entry.missionId || '';
    const who = entry.memberId || entry.memberName || '';
    const ms  = entry.mission || 'memorize';
    const i = arr.findIndex(e =>
      (e.missionId||'') === mid &&
      (e.memberId||e.memberName||'') === who &&
      (e.mission||'memorize') === ms);
    if(i >= 0) arr[i] = { ...arr[i], ...entry };
    else arr.push(entry);
    localStorage.setItem(key, JSON.stringify(arr));
    console.log('[PAT-HIST] 기록 누적:', entry.date, who, ms);
  }catch(e){ console.warn('[PAT-HIST] 기록 저장 실패:', e.message); }
}

// 로컬 미러에서 기간(fromD~toD, YYYY-MM-DD) 조회
function loadLocalHistoryRange(fromD, toD){
  const out = [];
  try{
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(!k || k.indexOf('pat_hist_') !== 0) continue;
      const date = k.slice('pat_hist_'.length);
      if(date < fromD || date > toD) continue;
      let arr = [];
      try{ arr = JSON.parse(localStorage.getItem(k) || '[]'); }catch(e){ arr = []; }
      if(Array.isArray(arr)) arr.forEach(e => out.push({
        ...e, date,
        memberName: e.memberName || e.memberId || '',
      }));
    }
  }catch(e){}
  return out;
}

// ── 날짜 유틸 ───────────────────────────────────────────────────
function _histToday(){
  return (typeof todayKey === 'function') ? todayKey() : new Date().toISOString().slice(0,10);
}
function _histParse(s){ const [y,m,d] = String(s).split('-').map(Number); return new Date(y, (m||1)-1, d||1); }
function _histFmt(dt){
  const p = n => (n<10?'0':'')+n;
  return dt.getFullYear()+'-'+p(dt.getMonth()+1)+'-'+p(dt.getDate());
}
function _histAddDays(s, n){ const d = _histParse(s); d.setDate(d.getDate()+n); return _histFmt(d); }
// 월요일 시작 주의 시작일
function _histWeekStart(s){
  const d = _histParse(s);
  const dow = (d.getDay()+6)%7; // 월=0
  d.setDate(d.getDate()-dow);
  return _histFmt(d);
}
function _histWeekDays(s){
  const start = _histWeekStart(s);
  return Array.from({length:7}, (_,i)=>_histAddDays(start, i));
}
function _histMonthDays(ym){ // ym = 'YYYY-MM'
  const [y,m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const p = n => (n<10?'0':'')+n;
  return Array.from({length:last}, (_,i)=>`${y}-${p(m)}-${p(i+1)}`);
}
function _histDow(s){ return ['일','월','화','수','목','금','토'][_histParse(s).getDay()]; }

// ── 데이터 조회 (서버 우선, 로컬 폴백) ──────────────────────────
let _histState = { tab:'day', day:null, week:null, month:null };
let _histCache = { key:'', items:[] };

async function _histFetch(fromD, toD){
  const cacheKey = fromD+'~'+toD;
  if(_histCache.key === cacheKey) return _histCache.items;
  let items = null;
  // 서버 우선 — 교차기기·캐시삭제·재배포에도 유지
  try{
    if(window.PAT_DB && PAT_DB.ready() && PAT_DB.getMissionHistory){
      const familyId = localStorage.getItem('pat_family_id') || '';
      if(familyId){
        const res = await PAT_DB.getMissionHistory(DB.church.code, familyId, fromD, toD);
        if(res && Array.isArray(res.items)) items = res.items;
      }
    }
  }catch(e){ console.warn('[PAT-HIST] 서버 조회 실패, 로컬 사용:', e.message); }
  // 폴백: 로컬 미러
  if(!items) items = loadLocalHistoryRange(fromD, toD);
  // 서버+로컬 합집합(서버가 비어도 로컬 오늘 기록은 보이게)
  else {
    const local = loadLocalHistoryRange(fromD, toD);
    const seen = new Set(items.map(it => it.date+'|'+(it.memberName||'')+'|'+(it.mission||'memorize')));
    local.forEach(it => {
      const k = it.date+'|'+(it.memberName||'')+'|'+(it.mission||'memorize');
      if(!seen.has(k)){ items.push(it); seen.add(k); }
    });
  }
  _histCache = { key:cacheKey, items };
  return items;
}

// date -> Set(완료 구성원 이름)
function _histCompletedByDate(items){
  const map = {};
  items.forEach(it => {
    if(it.completed === false) return;
    const d = it.date; const n = (it.memberName || it.memberId || '').trim();
    if(!d || !n) return;
    (map[d] = map[d] || new Set()).add(n);
  });
  return map;
}
function _histMembers(){
  const p = (typeof loadFamilyProfile === 'function') ? loadFamilyProfile() : null;
  const names = (typeof familyMemberNames === 'function') ? familyMemberNames(p) : ((p && p.members) || []);
  return names.filter(Boolean);
}

// ── 화면 진입/탭 전환 ───────────────────────────────────────────
function renderHistory(){
  const today = _histToday();
  if(!_histState.day)   _histState.day = today;
  if(!_histState.week)  _histState.week = today;
  if(!_histState.month) _histState.month = today.slice(0,7);
  const nameEl = document.getElementById('historyFamilyName');
  if(nameEl){
    const p = (typeof loadFamilyProfile==='function') ? loadFamilyProfile() : null;
    const room = (typeof familyRoomName==='function') ? familyRoomName(p) : (p && p.roomName) || '';
    nameEl.textContent = room ? (room + ' · 수행 기록') : '수행 기록';
  }
  _histRenderTabButtons();
  _histRenderActive();
}
function switchHistoryTab(tab){
  _histState.tab = tab;
  _histRenderTabButtons();
  _histRenderActive();
}
function _histRenderTabButtons(){
  const set = (id, on) => {
    const b = document.getElementById(id); if(!b) return;
    b.className = 'btn' + (on ? '' : ' ghost');
  };
  set('htTabDay',   _histState.tab==='day');
  set('htTabWeek',  _histState.tab==='week');
  set('htTabMonth', _histState.tab==='month');
}
function _histRenderActive(){
  const body = document.getElementById('historyBody');
  if(body) body.innerHTML = '<p class="muted">불러오는 중…</p>';
  if(_histState.tab === 'day')   return _histRenderDay();
  if(_histState.tab === 'week')  return _histRenderWeek();
  if(_histState.tab === 'month') return _histRenderMonth();
}

// 공통: 완료율 막대
function _histBar(done, total){
  const pct = total ? Math.round(done/total*100) : 0;
  return `<div class="bar" style="margin:4px 0"><span style="width:${pct}%"></span></div>`;
}

// ── 일별 ────────────────────────────────────────────────────────
async function _histRenderDay(){
  const picker = document.getElementById('historyPicker');
  if(picker){
    picker.innerHTML = `<label class="muted" style="font-size:calc(var(--fs)-2px)">날짜 선택</label>
      <input type="date" id="histDayInput" class="field" style="margin-top:4px" value="${_histState.day}" max="${_histToday()}"
        onchange="_histState.day=this.value; _histCache.key=''; _histRenderActive()">`;
  }
  const date = _histState.day;
  const items = await _histFetch(date, date);
  const doneSet = _histCompletedByDate(items)[date] || new Set();
  const members = _histMembers();
  const total = members.length;
  const done = members.filter(n => doneSet.has(n)).length;

  const rows = members.length ? members.map((n,i)=>{
    const ok = doneSet.has(n);
    return `<div class="member" style="display:flex;justify-content:space-between;align-items:center">
      <div><span class="muted" style="margin-right:8px;font-weight:700">${i+1}.</span>${esc(n)}</div>
      <span style="font-weight:800;color:${ok?'var(--accent)':'var(--muted)'}">${ok?'✓ 완료':'· 미완료'}</span>
    </div>`;
  }).join('') : '<p class="muted">등록된 구성원이 없습니다</p>';

  const body = document.getElementById('historyBody');
  if(body) body.innerHTML = `
    <div class="hm-card" style="margin-bottom:12px">
      <div class="hm-card-row"><b>${date} (${_histDow(date)})</b>
        <span class="hm-accent">가족 완료율 ${done}/${total}명 (${total?Math.round(done/total*100):0}%)</span></div>
      ${_histBar(done,total)}
    </div>
    ${rows}`;
}

// ── 주간 ────────────────────────────────────────────────────────
async function _histRenderWeek(){
  const days = _histWeekDays(_histState.week);
  const from = days[0], to = days[6];
  const picker = document.getElementById('historyPicker');
  if(picker){
    picker.innerHTML = `<div style="display:flex;gap:6px;align-items:center;justify-content:space-between">
      <button class="btn ghost" style="margin:0;flex:0 0 auto;padding:8px 12px" onclick="_histState.week=_histAddDays(_histState.week,-7);_histCache.key='';_histRenderActive()">‹ 이전주</button>
      <b style="font-size:calc(var(--fs)-1px)">${from} ~ ${to}</b>
      <button class="btn ghost" style="margin:0;flex:0 0 auto;padding:8px 12px" onclick="_histState.week=_histAddDays(_histState.week,7);_histCache.key='';_histRenderActive()">다음주 ›</button>
    </div>`;
  }
  const items = await _histFetch(from, to);
  const byDate = _histCompletedByDate(items);
  const total = _histMembers().length;
  const today = _histToday();

  const rows = days.map(d=>{
    const done = (byDate[d] ? byDate[d].size : 0);
    const future = d > today;
    const pct = total ? Math.round(done/total*100) : 0;
    return `<div class="member" style="${future?'opacity:.4':''}">
      <div class="hm-card-row" style="margin-bottom:2px">
        <span><b>${d.slice(5)}</b> (${_histDow(d)})${d===today?' · 오늘':''}</span>
        <span style="font-weight:800;color:var(--accent)">${done}/${total}명 ${future?'':`(${pct}%)`}</span>
      </div>${future?'':_histBar(done,total)}
    </div>`;
  }).join('');

  // 주간 합계 — 완료 연인원 / (구성원×7)
  let weekDone = 0; days.forEach(d=>{ if(byDate[d]) weekDone += byDate[d].size; });
  const weekTotal = total * days.filter(d=>d<=today).length;
  const body = document.getElementById('historyBody');
  if(body) body.innerHTML = `
    <div class="hm-card" style="margin-bottom:12px">
      <div class="hm-card-row"><b>이번 주 합계</b>
        <span class="hm-accent">${weekDone}/${weekTotal} (${weekTotal?Math.round(weekDone/weekTotal*100):0}%)</span></div>
      ${_histBar(weekDone, weekTotal)}
    </div>${rows}`;
}

// ── 월별 ────────────────────────────────────────────────────────
async function _histRenderMonth(){
  const ym = _histState.month;
  const picker = document.getElementById('historyPicker');
  if(picker){
    picker.innerHTML = `<label class="muted" style="font-size:calc(var(--fs)-2px)">월 선택</label>
      <input type="month" id="histMonthInput" class="field" style="margin-top:4px" value="${ym}" max="${_histToday().slice(0,7)}"
        onchange="_histState.month=this.value; _histCache.key=''; _histRenderActive()">`;
  }
  const days = _histMonthDays(ym);
  const from = days[0], to = days[days.length-1];
  const items = await _histFetch(from, to);
  const byDate = _histCompletedByDate(items);
  const total = _histMembers().length;
  const today = _histToday();

  const rows = days.map(d=>{
    const done = (byDate[d] ? byDate[d].size : 0);
    const future = d > today;
    if(future) return '';
    const pct = total ? Math.round(done/total*100) : 0;
    const has = done>0;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--line)">
      <span><b>${d.slice(8)}</b>일 (${_histDow(d)})</span>
      <span style="font-weight:700;color:${has?'var(--accent)':'var(--muted)'}">${has?'✓ ':''}${done}/${total}명 (${pct}%)</span>
    </div>`;
  }).join('');

  // 월 합계
  let mDone=0; days.forEach(d=>{ if(d<=today && byDate[d]) mDone += byDate[d].size; });
  const elapsed = days.filter(d=>d<=today).length;
  const mTotal = total * elapsed;
  const activeDays = days.filter(d=>d<=today && byDate[d] && byDate[d].size>0).length;
  const body = document.getElementById('historyBody');
  if(body) body.innerHTML = `
    <div class="hm-card" style="margin-bottom:12px">
      <div class="hm-card-row"><b>${ym} 월간 합계</b>
        <span class="hm-accent">완료 ${activeDays}일 / ${elapsed}일</span></div>
      <div class="hm-card-row" style="margin-top:4px"><span class="muted">월 완료율(연인원)</span>
        <span class="hm-accent">${mTotal?Math.round(mDone/mTotal*100):0}%</span></div>
      ${_histBar(mDone, mTotal)}
    </div>${rows || '<p class="muted">이 달의 기록이 없습니다</p>'}`;
}

// ── 관리자: 기간별 교회 전체 수행 기록 (연말 시상 근거) ───────────
async function renderAdminHistory(){
  const out = document.getElementById('adminHistResult');
  const from = (document.getElementById('adminHistFrom')||{}).value || '';
  const to   = (document.getElementById('adminHistTo')||{}).value || '';
  if(!from || !to){ if(typeof toast==='function') toast('시작일과 종료일을 선택하세요'); return; }
  if(from > to){ if(typeof toast==='function') toast('시작일이 종료일보다 늦습니다'); return; }
  if(out) out.innerHTML = '<p class="muted">조회 중…</p>';

  let items = null;
  try{
    if(window.PAT_DB && PAT_DB.ready() && PAT_DB.getMissionHistoryAdmin){
      const res = await PAT_DB.getMissionHistoryAdmin(DB.church.code, from, to);
      if(res && Array.isArray(res.items)) items = res.items;
    }
  }catch(e){ console.warn('[PAT-HIST] 관리자 조회 실패:', e.message); }
  if(!items){ if(out) out.innerHTML = '<p class="muted">조회 실패(관리자 권한/네트워크 확인). 잠시 후 다시 시도하세요.</p>'; return; }

  // 구성원별 '완료한 서로 다른 날짜 수' 집계 (시상 근거)
  const byMember = {}; // name -> {days:Set, family:leaderName}
  items.forEach(it=>{
    if(it.completed === false) return;
    const n = (it.memberName||'').trim(); if(!n) return;
    const m = byMember[n] || (byMember[n] = { days:new Set(), family: it.leaderName||'' });
    m.days.add(it.date);
    if(!m.family && it.leaderName) m.family = it.leaderName;
  });
  const rows = Object.keys(byMember)
    .map(n=>({ name:n, days: byMember[n].days.size, family: byMember[n].family }))
    .sort((a,b)=> b.days - a.days);

  // 기간 내 달력 일수
  const totalDays = (Math.round((_histParse(to)-_histParse(from))/86400000) + 1);
  const head = `<div class="hm-card" style="margin-bottom:10px">
    <div class="hm-card-row"><b>${from} ~ ${to}</b><span class="hm-accent">${rows.length}명 · ${totalDays}일</span></div>
    <p class="muted" style="margin:4px 0 0;font-size:calc(var(--fs)-3px)">완료 일수 = 해당 구성원이 미션을 완료한 서로 다른 날짜 수</p>
  </div>`;
  const list = rows.length ? rows.map((r,i)=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 8px;border-bottom:1px solid var(--line)">
      <span><b style="color:var(--muted);margin-right:6px">${i+1}.</b>${esc(r.name)}${r.family?` <span class="muted" style="font-size:calc(var(--fs)-3px)">(${esc(r.family)}네)</span>`:''}</span>
      <span style="font-weight:800;color:var(--accent)">${r.days}일 (${totalDays?Math.round(r.days/totalDays*100):0}%)</span>
    </div>`).join('') : '<p class="muted">해당 기간 기록이 없습니다</p>';
  if(out) out.innerHTML = head + list;
}
