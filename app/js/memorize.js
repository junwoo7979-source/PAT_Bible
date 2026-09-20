// ====== PAT Bible — memorize.js ======
// 타이핑 암송, 완료 처리, 재검수, 대시보드, 설정

// ── 타이핑 렌더링 ─────────────────────────────────────────
function renderTyping(focusInput=true){
  document.getElementById('typeStage').textContent = typeStage+'차';
  renderSteps(2+typeStage);
  document.getElementById('typeRef').textContent   = DB.verse.ref;
  document.getElementById('typeInput').value       = '';
  document.getElementById('typeInput').readOnly    = false;
  document.getElementById('typeDone').disabled     = true;
  document.getElementById('typingRestart').style.display = 'none';
  document.getElementById('typingRepeat').style.display  = 'none';
  document.getElementById('typeDone').textContent = (typeStage===1) ? '1차 완료 → 2차 진행' : '완료 확인';
  typeCurrentScore = 0;
  updateTyped('');
  if(focusInput) document.getElementById('typeInput').focus();
  // 현재 타이핑 단계 진입 상태를 즉시 저장 (모바일 새로고침 시 위치 유지)
  if (typeof saveMemorizeState === 'function') saveMemorizeState('s-typing');
}
function typingNext(){
  const input = document.getElementById('typeInput').value;
  if(typeStage===1){
    typeScore1 = typeCurrentScore; typeInput1 = input;
    typeStage = 2;
    renderTyping();
    toast('✓ 타이핑 1차 통과! 2차 입력하세요');
  }else{
    typeScore2 = typeCurrentScore; typeInput2 = input;
    completeMemorize();
  }
}
function repeatCurrentStep(kind){
  if(kind==='voice'){
    // ★ 이전 recognition 상태 정리 — 마이크 다시 활성 가능하도록
    clearVoiceStartTimer();
    clearVoiceRecognition(true);
    recognizing=false;
    setMicRec(false);
    voiceRecoveryCount=0;
    voiceStopRequested=false;

    if(voiceStage===1){ voiceScore1=0; voiceInput1=''; } else { voiceScore2=0; voiceInput2=''; }
    renderVoice();
    toast(STEP_NAMES[voiceStage-1]+' 다시 시작');
    return;
  }
  if(typeStage===1){ typeScore1=0; typeInput1=''; } else { typeScore2=0; typeInput2=''; }
  renderTyping();
  toast(STEP_NAMES[typeStage+1]+' 다시 시작');
}
function blockPaste(e){ e.preventDefault(); toast('붙여넣기는 사용할 수 없습니다'); return false; }
function onType(){ updateTyped(document.getElementById('typeInput').value); }
function updateTyped(rawInput){
  const input  = (rawInput||'').replace(/\s+$/,'');
  const target = DB.verse.text;
  const nInput = normalize(input);
  let html='', pos=0;
  for(const tc of target){
    const ntc = normalize(tc);
    if(!ntc){ html += (tc===' '?'&nbsp;':`<span class="n">${esc(tc)}</span>`); continue; }
    if(pos < nInput.length){
      html += `<span class="${nInput[pos]===ntc?'g':'b'}">${esc(tc)}</span>`; pos++;
    }else if(pos === nInput.length){ html += `<span class="cur n">${esc(tc)}</span>`; pos++; }
    else html += `<span class="n">${esc(tc)}</span>`;
  }
  document.getElementById('typedDisplay').innerHTML = html;
  const nt  = normalize(target);
  const pct = similarity(input, target);
  typeCurrentScore = pct;
  const typedEnough = nInput.length >= nt.length;
  const pass = pct >= TH().typing && typedEnough;
  document.getElementById('typeBar').style.width    = pct+'%';
  document.getElementById('typingRestart').style.display = nInput.length && pct<100 ? 'block' : 'none';
  document.getElementById('typingRepeat').style.display  = pass ? 'block' : 'none';
  document.getElementById('typeInput').readOnly     = pass;
  document.getElementById('typeStatus').textContent =
    `진행률 ${pct}%`+(typedEnough?(pass?' · 통과! 완료 확인을 누르세요':''):'  · 끝까지 입력하세요');
  document.getElementById('typeDone').disabled = !pass;
}
// ── 암송 완료 판정 SSOT (Single Source of Truth) ───────────
// "암송 완료" 여부는 오직 이 함수 하나로만 판정한다. (하드코딩·임시 예외 금지)
// 완료 조건(모두 충족해야 함):
//   • 읽기(음성) 2회 통과 — voiceScore1·voiceScore2 각각 TH().voice 이상
//   • 쓰기(타이핑) 2회 통과 — typeScore1·typeScore2 각각 TH().typing 이상
// 하나라도 미달이면 절대 완료가 아니다. 화면 위치·상태 복원·단계 점프 등
// 어떤 경로로 들어와도 이 함수 결과만이 '완료'의 진실이다.
function isMemorizeComplete(){
  const th = (typeof TH === 'function') ? TH() : { voice:85, typing:100 };
  const readOK  = (voiceScore1 >= th.voice)  && (voiceScore2 >= th.voice);   // 읽기(음성) 2회
  const writeOK = (typeScore1  >= th.typing) && (typeScore2  >= th.typing);  // 쓰기(타이핑) 2회
  return readOK && writeOK;
}

// ── 암송 완료 / 재검수 ────────────────────────────────────
function completeMemorize(){
  // ★ 근본 수정(SSOT 게이트): 읽기2·쓰기2를 실제로 모두 통과하지 않으면
  //   완료 기록을 만들지 않는다. 복원/단계점프/리뷰 등 비정상 경로로 진입해도
  //   여기서 최종 차단 → "안 했는데 완료로 기록됨" 오류를 구조적으로 원천 봉쇄한다.
  if(!isMemorizeComplete()){
    if(typeof toast === 'function') toast('아직 모든 단계를 통과하지 않았습니다 — 읽기 2회·쓰기 2회를 모두 완료해주세요');
    console.warn('[PAT-COMPLETE] SSOT 미충족으로 완료 차단:',
      { voiceScore1, voiceScore2, typeScore1, typeScore2 });
    return;
  }
  const record = { ref:DB.verse.ref, voiceScore1, voiceScore2, typeScore1, typeScore2,
    voiceInput1, voiceInput2, typeInput1, typeInput2, typingPassed:true,
    completedAt:new Date().toISOString(), badge:'weekly_complete' };
  if(!memorizeCompleted){
    const recs = loadRec(); recs.push(record); saveRec(recs);
    memorizeCompleted = true;
    if(window.PAT_DB && PAT_DB.ready()){
      // ★ 3단계: 1회 완료 → 내가 속한 '모든 방'에 기록(그룹 단위 시상 반영).
      //   각 방의 컨텍스트(familyId/교구/이름/종류)로 1건씩 저장. 방 목록이 없으면 활성 방.
      const _rooms = (typeof loadRooms === 'function') ? loadRooms() : [];
      if(_rooms.length && PAT_DB.saveRecordCtx){
        _rooms.forEach(room => {
          if(!room || !room.familyId) return;
          PAT_DB.saveRecordCtx(DB.church.code, record, {
            familyId:   room.familyId,
            parish:     room.parish || '',
            district:   room.district || '',
            leaderName: room.leaderName || '',
            memberName: room.memberName || room.leaderName || '',
            groupType:  (room.groupType === '구역') ? '구역' : '가정',
          });
        });
      } else {
        PAT_DB.saveRecord(DB.church.code, record); // 폴백(활성 방)
      }
    }
  }else{
    const recs  = loadRec();
    const index = recs.map(r=>r.ref).lastIndexOf(DB.verse.ref);
    if(index>=0){ recs[index]={...recs[index],...record}; saveRec(recs); }
  }
  // ★ 수행 기록(history) 누적 — 오늘 상태와 분리된 '날짜별 영구 기록'. 덮어쓰기/삭제 없음.
  if(typeof recordMissionHistory === 'function'){
    try{
      const _p  = (typeof loadFamilyProfile==='function') ? loadFamilyProfile() : null;
      const _me = (_p && (_p.memberName || _p.leaderName)) || '';
      const _today = (typeof todayKey==='function') ? todayKey()
        : new Date().toISOString().slice(0,10);
      recordMissionHistory({
        date: _today,
        familyId: localStorage.getItem('pat_family_id') || '',
        memberId: _me, memberName: _me,
        missionId: DB.verse.ref, mission: 'memorize',
        read:  !!(voiceScore1 || voiceScore2),   // 읽기(음성) 체크
        write: !!(typeScore1 || typeScore2),     // 쓰기(타이핑) 체크
        completed: true,
        completedAt: record.completedAt,
      });
    }catch(e){ console.warn('[PAT-HIST] completeMemorize 기록 실패:', e.message); }
  }

  document.getElementById('completeRef').textContent  = DB.verse.ref+' 암송 성공';
  // ★ SSOT 게이트 통과 후이므로 실제 점수가 보장됨 → 0점을 90/92%로 위장하던 fallback 제거
  document.getElementById('cVoice1').textContent = voiceScore1+'%';
  document.getElementById('cVoice2').textContent = voiceScore2+'%';
  renderSteps(5, false);
  go('s-complete');
  // 완료 상태 저장 (모바일 새로고침 시 완료 화면 유지)
  if (typeof saveMemorizeState === 'function') saveMemorizeState('s-complete');
}
function reviewStep(n){
  clearVoiceStartTimer();
  clearVoiceRecognition(true);
  recognizing=false; setMicRec(false);
  const score = stepScore(n);
  if(n<=2){
    voiceStage = n;
    go('s-voice', false, false);
    renderVoice();
    if(score){
      document.getElementById('simBar').style.width   = score+'%';
      document.getElementById('simLabel').innerHTML   =
        `이전 유사도 <b style="color:${score<100?'var(--danger)':'var(--accent)'}">${score}%</b> · 다시 검수할 수 있습니다`;
      document.getElementById('recognized').textContent = n===1 ? voiceInput1 : voiceInput2;
      document.getElementById('voiceManual').value       = n===1 ? voiceInput1 : voiceInput2;
      document.getElementById('voiceManual').readOnly    = true;
      document.getElementById('voiceManualCheck').disabled = true;
      document.getElementById('voiceRestart').style.display = score<100 ? 'block' : 'none';
      document.getElementById('voiceRepeat').style.display  = 'block';
      document.getElementById('micBtn').disabled = true;
      document.getElementById('micHint').textContent = '입력 완료 · 다시 하려면 아래 버튼을 누르세요';
      document.getElementById('voiceNext').disabled  = score < TH().voice;
    }
    toast(STEP_NAMES[n-1]+' 다시 검수');
    return;
  }
  typeStage = n-2;
  go('s-typing', false, false);
  renderTyping(false);
  if(score){
    const savedInput = n===3 ? typeInput1 : typeInput2;
    document.getElementById('typeInput').value   = savedInput;
    updateTyped(savedInput);
    document.getElementById('typeInput').readOnly  = true;
    document.getElementById('typeBar').style.width = score+'%';
    document.getElementById('typeStatus').textContent =
      `이전 진행률 ${score}% · 다시 입력해 검수할 수 있습니다`;
    document.getElementById('typingRestart').style.display = score<100 ? 'block' : 'none';
    document.getElementById('typingRepeat').style.display  = 'block';
  }
  toast(STEP_NAMES[n-1]+' 다시 검수');
}

// ── 현황 대시보드 데이터 계산 (수집된 데이터만 사용) ───────
async function computeAggregatedData(){
  console.log('[PAT-DASHBOARD-AGGREGATE] 데이터 집계 시작');

  const result = {
    myCount: 0,           // 내 암송 횟수 (로컬)
    familyDone: 0,        // 우리 가족 완료자
    familyTotal: 0,       // 우리 가족 총인원
  };

  // ✅ 1️⃣ 로컬 기록 (내 암송 횟수)
  try {
    const recs = loadRec();
    result.myCount = recs.length;
    console.log('[PAT-DASHBOARD-AGGREGATE] ✅ 로컬 기록:', result.myCount, '회');
  } catch(e) {
    console.error('[PAT-DASHBOARD-AGGREGATE] ❌ 로컬 기록 오류:', e.message);
  }

  // ★ 2026-07-02(속도개선): 독립적인 Firebase 호출(가족진도·기도)을
  //   순차 await 하면 왕복이 더해져 대시보드 갱신이 느렸다 → 동시에 프리페치(Promise.all)해
  //   전체 지연을 '합계'가 아니라 '최댓값'으로 줄인다.
  //   ★ 2026-09-20: 교구/교회 단위 집계(getDashboardStats) 호출 제거 — 실천율은 개인·가족 단위만.
  const _ready   = !!(window.PAT_DB && PAT_DB.ready());
  const _profile = loadFamilyProfile();
  const _familyId= localStorage.getItem('pat_family_id');
  const _pFamily = (_ready && _profile && _familyId && PAT_DB.getFamilyProgress)
    ? Promise.resolve(PAT_DB.getFamilyProgress(DB.church.code, _familyId, DB.verse.ref)).catch(()=>null)
    : Promise.resolve(null);
  const _pPrayed = (typeof fetchPrayedMembersToday==='function')
    ? Promise.resolve(fetchPrayedMembersToday()).catch(()=>new Set())
    : Promise.resolve(new Set());
  const [_members, _prayedSet] = await Promise.all([_pFamily, _pPrayed]);

  // ✅ 2️⃣ 가족방 데이터 (우리 가족 달성률)
  try {
    if(_profile && _familyId && _ready){
      const members = _members;
      if(Array.isArray(members)){
        // ★ 일간 초기화(FIX): '우리 가족 달성률'도 가족방 홈과 동일하게 '오늘(KST) 완료'만 센다.
        //   서버 done(주간누적)을 쓰면 이번 주에 한 번 완료한 사람이 날짜가 바뀌어도 계속
        //   완료로 잡혀 대시보드가 자정에 초기화되지 않는다 → 반드시 doneToday 사용.
        // 완료 = 암송(m.doneToday) 또는 오늘 기도
        const prayedSet = _prayedSet || new Set();
        result.familyTotal = members.length;
        result.familyDone = members.filter(m => m.doneToday || prayedSet.has(m.displayName || m.name || '')).length;
        console.log('[PAT-DASHBOARD-AGGREGATE] ✅ 가족 진도(암송+기도):', result.familyDone, '/', result.familyTotal);
      } else {
        console.log('[PAT-DASHBOARD-AGGREGATE] ⚠️ 가족 데이터 없음 (가족방 미입장)');
      }
    } else {
      console.log('[PAT-DASHBOARD-AGGREGATE] ⚠️ 가족 정보 미검색 (로컬만 표시)');
    }
  } catch(e) {
    console.error('[PAT-DASHBOARD-AGGREGATE] ❌ 가족방 조회 오류:', e.message);
  }

  console.log('[PAT-DASHBOARD-AGGREGATE] 📊 최종 집계 데이터:', result);
  return result;
}

// 현황 대시보드 자동 갱신 폴링
let dashboardPollTimer = null;
const DASHBOARD_POLL_INTERVAL = 1000; // 1초마다 갱신 (폰↔웹 실시간 동기화)

// 현황 대시보드 렌더링 (수집된 실제 데이터 기반)
// 캐시: 변경된 데이터만 렌더링
let lastDashboardData = null;

async function renderDashboard(){
  console.log('[PAT-DASHBOARD] ===== 현황 페이지 렌더링 시작 =====');

  // 수집된 데이터만 사용 (테스트 데이터 없음!)
  const data = await computeAggregatedData();

  // 데이터 변경 감지 (해시 기반) - 불필요한 UI 업데이트 방지
  if(window.SYNC_MANAGER){
    if(!window.SYNC_MANAGER.hasChanged('dashboardStats', data)){
      console.log('[PAT-DASHBOARD] 📌 데이터 미변경 - UI 업데이트 스킵');
      return; // 변경 없으면 UI 업데이트 안 함
    }
  }

  console.log('[PAT-DASHBOARD] 🔄 데이터 변경 감지 - UI 업데이트 시작');

  // 1️⃣ 개인 통계 (내 암송 횟수)
  const myCountEl = document.getElementById('dMyCount');
  if(myCountEl && myCountEl.textContent !== String(data.myCount)){
    myCountEl.textContent = data.myCount;
    document.getElementById('dStreak').textContent = data.myCount > 0 ? 1 : 0;
    document.getElementById('dBadge').textContent = data.myCount;
    document.getElementById('dMyScore').textContent = data.myCount + '회';
    console.log('[PAT-DASHBOARD] ✅ 개인 통계:', data.myCount, '회');
  }

  // 2️⃣ 가족 달성률 (우리 가족만)
  const familyPct = data.familyTotal > 0 ? Math.round(data.familyDone / data.familyTotal * 100) : 0;
  const familyEl = document.getElementById('dFamily');
  if(familyEl && familyEl.textContent !== (familyPct + '%')){
    familyEl.textContent = familyPct + '%';
    console.log('[PAT-DASHBOARD] ✅ 가족 달성률:', data.familyDone, '/', data.familyTotal, '=', familyPct, '%');
  }
  // 가족 패널 진행바 + 상세
  const familyBar = document.getElementById('dFamilyBar');
  if(familyBar) familyBar.style.width = familyPct + '%';
  const familyDetail = document.getElementById('dFamilyDetail');
  if(familyDetail) familyDetail.textContent = '완료 ' + data.familyDone + ' / ' + data.familyTotal + '명';

  lastDashboardData = data;
  console.log('[PAT-DASHBOARD] ===== 렌더링 완료 =====\n');
}

// 실천율 단위 탭 전환 (개인 · 가족) — 교구·교회 단위는 2026-09-20 제거
function switchDashTab(tab){
  const tabs = ['personal','family'];
  if(!tabs.includes(tab)) tab = 'personal';
  tabs.forEach(t => {
    const panel = document.getElementById('dashPanel-' + t);
    if(panel) panel.style.display = (t === tab) ? 'block' : 'none';
    const btn = document.querySelector('.dash-tab[data-dtab="' + t + '"]');
    if(btn){
      const on = (t === tab);
      btn.style.background = on ? 'var(--accent)' : 'var(--surface)';
      btn.style.color = on ? '#fff' : 'var(--text)';
    }
  });
  try { localStorage.setItem('pat_dash_tab', tab); } catch(e) {}
}

// 현황 대시보드 폴링 시작 (5초마다 자동 갱신)
function startDashboardPolling(){
  if(dashboardPollTimer) clearInterval(dashboardPollTimer);

  console.log('[PAT-DASHBOARD] 폴링 시작 (5초 간격)');

  // 진입 시 마지막으로 본 탭(기본: 개인) 복원
  let _dt = 'personal';
  try { _dt = localStorage.getItem('pat_dash_tab') || 'personal'; } catch(e) {}
  if(typeof switchDashTab === 'function') switchDashTab(_dt);

  // 즉시 한 번 렌더링
  renderDashboard();

  // 5초마다 자동 갱신
  dashboardPollTimer = setInterval(() => {
    const activeScreen = document.querySelector('.screen.active')?.id;
    if(activeScreen === 's-dashboard'){
      console.log('[PAT-DASHBOARD] 자동 갱신');
      renderDashboard();
    }
  }, DASHBOARD_POLL_INTERVAL);
}

// 현황 대시보드 폴링 중지
function stopDashboardPolling(){
  if(dashboardPollTimer){
    clearInterval(dashboardPollTimer);
    dashboardPollTimer = null;
    console.log('[PAT-DASHBOARD] 폴링 중지');
  }
}

// ── 설정 ─────────────────────────────────────────────────
function toggleTheme(){
  const dark = document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme', dark?'cream':'dark');
  document.getElementById('swTheme').classList.toggle('on', !dark);
}
function toggleFont(){
  const lg = document.documentElement.getAttribute('data-fontsize')==='large';
  document.documentElement.setAttribute('data-fontsize', lg?'normal':'large');
  document.getElementById('swFont').classList.toggle('on', !lg);
}
function toggleLenient(){
  LENIENT = !LENIENT;
  document.getElementById('swLenient').classList.toggle('on', LENIENT);
  toast(LENIENT?'관대 모드 ON (기준 완화)':'관대 모드 OFF');
}
function resetData(){
  // ★ 보호장치(v117): 미션 기록 '전체 삭제'는 위험 → 명시적 확인 필수.
  //   (체험용 버튼이 실수로 눌려 실제 수행 데이터가 사라지는 것을 방지)
  if(typeof confirm === 'function' &&
     !confirm('정말로 이 기기의 모든 미션 기록을 삭제할까요?\n(체험용 기능 — 실제 수행 기록이 모두 사라집니다)')) return;
  localStorage.removeItem('pat_records');
  const me = DB.members && DB.members.find(m=>m.me);
  if(me) me.done = false;
  toast('기록이 초기화되었습니다');
  renderFamily();
}

// ── 페이지 진입 초기화 (모든 모듈 로드 완료 후 실행) ────────
function initApp(){
  console.log('[PAT-INIT] initApp 실행 중, readyState:', document.readyState);

  if(typeof document === 'undefined' || typeof document.getElementById !== 'function'){
    console.log('[PAT-INIT] DOM 미준비');
    return;
  }

  applyStoredData();
  const _code = document.getElementById('churchCode');
  if(_code) _code.value = '';
  const _tb = document.getElementById('tabbar');
  if(_tb && _tb.style) _tb.style.display = 'none';

  console.log('[PAT-INIT] 초기화 완료');
}

// DOM 준비 상태 확인
if(document.readyState === 'loading'){
  // 아직 로드 중 → load 이벤트 대기
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  // 이미 로드됨 → 바로 실행
  initApp();
}
