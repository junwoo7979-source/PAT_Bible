// ====== PAT Bible — voice-ui.js ======
// 음성 암송 화면 렌더링, 단계 바, 블러 토글, 결과 평가

// ── 단계 진행 바 ─────────────────────────────────────────
const STEP_NAMES = ['음성 1차','음성 2차','타이핑 1차','타이핑 2차'];
function stepScore(n){
  return [voiceScore1, voiceScore2, typeScore1, typeScore2][n-1] || 0;
}
function renderSteps(active, showReview=reviewMode){
  const html = STEP_NAMES.map((nm,i)=>{
    const n=i+1; const cls=n<active?'done':(n===active?'cur':'');
    const score=stepScore(n);
    const review=score>0&&score<100;
    const mark=(showReview||n<active)&&n<active?'✓':n;
    const detail=score?`<small>${score}% · ${review?'다시 검수':'확인'}</small>`:'';
    const body=`<span class="no">${mark}</span>${nm}${detail}`;
    // 현재 단계(cur)는 클릭 불가, 나머지는 모두 goToStage 로 이동
    if(n !== active) return `<button type="button" class="st ${cls} ${review?'review':''}" onclick="goToStage(${n})">${body}</button>`;
    return `<div class="st ${cls}">${body}</div>`;
  }).join('');
  ['stepsVoice','stepsTyping','stepsComplete','stepsVerse'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.innerHTML=html;
  });
}

// ── 단계 직접 이동 ────────────────────────────────────────
// 규칙
//  • 뒤로 가기: 이미 지나온 '이전 단계'(target <= current)는 언제든 자유롭게 이동
//  • 이미 완료한 단계: 화면 위치와 무관하게 항상 이동 허용
//  • 앞으로 가기: 아직 안 한 '미래 단계'는 현재 단계를 완료하기 전엔 잠금
function goToStage(targetStage) {
  // 현재 어떤 단계(1=음성1, 2=음성2, 3=타이핑1, 4=타이핑2, 5=완료)에 있는지 계산
  const activeScreen = document.querySelector('.screen.active')?.id;
  let currentStageIndex;
  if (activeScreen === 's-voice') {
    currentStageIndex = voiceStage;        // 1 or 2
  } else if (activeScreen === 's-typing') {
    currentStageIndex = typeStage + 2;     // 3 or 4
  } else if (activeScreen === 's-complete') {
    currentStageIndex = 5;                 // 완료 화면
  } else {
    currentStageIndex = 1;
  }

  const targetStageIndex = targetStage;

  // 같은 단계면 아무것도 안 함
  if (targetStageIndex === currentStageIndex) return;

  // 각 단계 점수/통과 기준
  const scores = [voiceScore1, voiceScore2, typeScore1, typeScore2];
  const thresholds = [TH().voice, TH().voice, TH().typing, TH().typing];

  // 🎯 이동 허용 조건
  //   ① 이전(또는 같은) 단계 → 무조건 허용  (targetStageIndex <= currentStageIndex)
  //   ② 이미 완료한 단계 → 무조건 허용       (점수가 통과 기준 이상)
  const targetAlreadyDone = (targetStageIndex >= 1 && targetStageIndex <= 4)
    ? scores[targetStageIndex - 1] >= thresholds[targetStageIndex - 1]
    : false;

  if (targetStageIndex <= currentStageIndex || targetAlreadyDone) {
    reviewStep(targetStage);
    return;
  }

  // ③ 그 외(아직 안 한 미래 단계) → 현재 단계를 완료해야만 이동
  const isCurrentStageCompleted = (currentStageIndex >= 1 && currentStageIndex <= 4)
    ? scores[currentStageIndex - 1] >= thresholds[currentStageIndex - 1]
    : memorizeCompleted;

  if (!isCurrentStageCompleted) {
    toast('현재 단계를 완료해야 다음으로 갈 수 있습니다!');
    return;
  }

  reviewStep(targetStage);
}

// ── 구절 블러 토글 ────────────────────────────────────────
let verseBlurred = false;
function toggleVerseBlur(){
  const box = document.getElementById('verseBox');
  const btn = document.getElementById('blurToggleBtn');
  if(!box) return;
  verseBlurred = !verseBlurred;
  if(verseBlurred){
    box.classList.add('verse-blurred');
    btn.textContent = '👁️ 보기';
    if(box.addEventListener){
      box.addEventListener('touchstart', _versePeekOn, {passive:true});
      box.addEventListener('touchend',   _versePeekOff, {passive:true});
      box.addEventListener('touchcancel',_versePeekOff, {passive:true});
    }
  }else{
    box.classList.remove('verse-blurred');
    btn.textContent = '🫣 숨기기';
    if(box.removeEventListener){
      box.removeEventListener('touchstart', _versePeekOn);
      box.removeEventListener('touchend',   _versePeekOff);
      box.removeEventListener('touchcancel',_versePeekOff);
    }
  }
}
function _versePeekOn(){
  const box = document.getElementById('verseBox');
  if(box) box.classList.remove('verse-blurred');
}
function _versePeekOff(){
  const box = document.getElementById('verseBox');
  if(box && verseBlurred) box.classList.add('verse-blurred');
}

// ── 음성 화면 렌더링 ─────────────────────────────────────
function renderVoice(){
  document.getElementById('vRef').textContent    = DB.verse.ref;
  document.getElementById('vText').textContent   = DB.verse.text;
  document.getElementById('voiceStage').textContent = voiceStage+'차';
  renderSteps(voiceStage);
  document.getElementById('recognized').textContent    = '—';
  document.getElementById('simBar').style.width        = '0';
  document.getElementById('simLabel').textContent      = '유사도 분석 대기 중';
  document.getElementById('voiceDiff').style.display   = 'none';
  document.getElementById('voiceDiff').innerHTML       = '';
  document.getElementById('voiceNext').disabled        = true;
  document.getElementById('micBtn').disabled           = false;
  document.getElementById('voiceRestart').style.display = 'none';
  document.getElementById('voiceRepeat').style.display  = 'none';
  document.getElementById('manualBox').style.display    = 'none';
  document.getElementById('voiceManual').value          = '';
  document.getElementById('voiceManual').readOnly       = false;
  document.getElementById('voiceManualCheck').disabled  = false;
  voiceRecoveryCount=0; voiceStopRequested=false;
  // 단계 바뀔 때 블러 초기화
  const _vbox = document.getElementById('verseBox');
  const _vbtn = document.getElementById('blurToggleBtn');
  if(_vbox){ _vbox.classList.remove('verse-blurred');
    if(_vbox.removeEventListener){
      _vbox.removeEventListener('touchstart', _versePeekOn);
      _vbox.removeEventListener('touchend',   _versePeekOff);
      _vbox.removeEventListener('touchcancel',_versePeekOff);
    }
  }
  if(_vbtn) _vbtn.textContent = '🫣 숨기기';
  verseBlurred = false;
  const insecure = location.protocol==='file:' || (!window.isSecureContext && location.hostname!=='localhost');
  document.getElementById('micHint').textContent = insecure
    ? '⚠ 이 환경에선 마이크가 제한될 수 있어요 — 아래 대체 입력 사용'
    : '탭하여 녹음 시작';
}
function showManual(){
  document.getElementById('manualBox').style.display = 'block';
  document.getElementById('voiceManual').focus();
}
function manualVoiceCheck(){
  const t = document.getElementById('voiceManual').value.trim();
  if(!t){ toast('낭독한 내용을 입력하세요'); return; }
  document.getElementById('recognized').textContent = t;
  evalVoice(t);
}

// ── 암송 상태 초기화 / 재시작 ─────────────────────────────
function resetMemorizeState(){
  clearVoiceStartTimer();
  clearVoiceRecognition(true);
  recognizing=false;
  setMicRec(false);
  voiceStage=1; voiceScore1=0; voiceScore2=0; typeStage=1; typeScore1=0; typeScore2=0; typeCurrentScore=0;
  voiceInput1=''; voiceInput2=''; typeInput1=''; typeInput2=''; memorizeCompleted=false; reviewMode=false;
}
async function restartMemorize(){
  resetMemorizeState();
  renderVoice();
  go('s-voice');
  toast('음성 1차부터 다시 시작합니다');
  const ok = await requestMicPermissionAtSessionStart();
  if(ok) document.getElementById('micHint').textContent =
    isMobileBrowser() ? '녹음 버튼을 누르면 마이크 권한을 한 번만 허용해주세요' : '마이크 허용 완료 · 탭하여 녹음 시작';
}

// ── 암송 시작 진입점 ─────────────────────────────────────
async function startMemorize(){
  resetMemorizeState();
  renderVoice();
  go('s-voice');
  const ok = await requestMicPermissionAtSessionStart();
  if(ok) document.getElementById('micHint').textContent =
    isMobileBrowser() ? '녹음 버튼을 누르면 마이크 권한을 한 번만 허용해주세요' : '마이크 허용 완료 · 탭하여 녹음 시작';
}

// ── 구절 화면 렌더링 (암송 완료 여부 포함) ───────────────
function renderVerse(){
  renderMemberDateLabels();
  document.getElementById('verseRef').textContent  = DB.verse.ref;
  document.getElementById('verseText').textContent = DB.verse.text;
  const completed = loadRec().filter(r=>r.ref===DB.verse.ref)
    .sort((a,b)=>String(b.completedAt||'').localeCompare(String(a.completedAt||'')))[0];
  const progress = document.getElementById('verseCompletedProgress');
  const startBtn = document.getElementById('verseStartBtn');
  if(completed){
    voiceScore1 = completed.voiceScore1 || 100;
    voiceScore2 = completed.voiceScore2 || 100;
    typeScore1  = completed.typeScore1  || (completed.typingPassed ? 100 : 0);
    typeScore2  = completed.typeScore2  || (completed.typingPassed ? 100 : 0);
    voiceInput1 = completed.voiceInput1 || '';
    voiceInput2 = completed.voiceInput2 || '';
    typeInput1  = completed.typeInput1  || '';
    typeInput2  = completed.typeInput2  || '';
    memorizeCompleted = true;
    reviewMode = true;
    progress.style.display = 'block';
    document.getElementById('verseCompletedLabel').textContent = '완료!';
    startBtn.textContent = '처음부터 다시 암송하기';
    renderSteps(5);
  }else{
    progress.style.display = 'none';
    startBtn.textContent = '암송 시작';
  }
}

// ── 음성 결과 미리보기 / 평가 ─────────────────────────────
function previewVoice(text){
  // 1. 기본 유사도 (문자 레벨 Levenshtein)
  let sim = similarity(text, DB.verse.text);

  // 2. 단방향 발음 보정 후 유사도
  const simPhonetic = similarity(normalizeKorean(text), DB.verse.text);
  if(simPhonetic > sim) sim = simPhonetic;

  // 3. 자모(음소) 단위 비교 — ASR 재음절화·무음 ㅇ 차이 흡수
  const simJamo = similarity(jamoNormalize(text), jamoNormalize(DB.verse.text));
  if(simJamo > sim) sim = simJamo;

  // 4. 포함 채점(자모) — 앞뒤 여분/반복이 있어도 올바른 낭독은 ~100% 인정
  const simContain = containmentSimilarity(jamoNormalize(DB.verse.text), jamoNormalize(text));
  if(simContain > sim) sim = simContain;

  // 5. ★ 단어 재현율 — 구절 중간 단어 누락을 세밀하게 감지
  const wordRecall = wordRecallSimilarity(DB.verse.text, text);
  // 재현율 높고 포함 채점 높으면 가중 블렌드로 상향 (단어를 많이 맞췄으면 보상)
  const simBlend = Math.round(simContain * 0.6 + wordRecall * 0.4);
  if(simBlend > sim) sim = simBlend;

  // 6. ★ 발음 치환 후보별 포함 채점 — 특정 단어 발음 오류 보정
  for(const cand of getPhoneticCandidates(text)){
    const sc = containmentSimilarity(jamoNormalize(DB.verse.text), jamoNormalize(cand));
    if(sc > sim) sim = sc;
  }

  const pass = sim >= TH().voice;
  document.getElementById('simBar').style.width = sim+'%';
  document.getElementById('simLabel').innerHTML =
    `유사도 <b style="color:${pass?'var(--accent)':'var(--danger)'}">${sim}%</b>`+
    ` &nbsp;·&nbsp; 단어 재현율 ${wordRecall}%`+
    ` &nbsp;·&nbsp; 통과 기준 ${TH().voice}%`;
  renderVoiceDiff(text);
  return { sim, pass };
}

// ── 단어 단위 LCS diff 렌더링 ────────────────────────────
// 순차 문자 비교 대신 단어 레벨 LCS 정렬 → 삽입·삭제 단어 정확히 표시
function renderVoiceDiff(input){
  const diff = document.getElementById('voiceDiff');
  const target = DB.verse.text;
  if(!input||!input.trim()){ diff.style.display='none'; diff.innerHTML=''; return; }

  const tWords = tokenize(target);
  const iWords = tokenize(input);
  const njT = tWords.map(w=>jamoNormalize(normalize(w)));
  const njI = iWords.map(w=>jamoNormalize(normalize(w)));
  const m=njT.length, n=njI.length;

  // 단어 단위 LCS DP
  const dp=[];
  for(let i=0;i<=m;i++){ dp.push(new Array(n+1).fill(0)); }
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){
    dp[i][j] = similarity(njT[i-1],njI[j-1])>=_WORD_MATCH_TH
      ? dp[i-1][j-1]+1
      : Math.max(dp[i-1][j],dp[i][j-1]);
  }

  // 역추적으로 정렬 구성
  const aligned=[];
  let i=m, j=n;
  while(i>0||j>0){
    if(i>0&&j>0&&similarity(njT[i-1],njI[j-1])>=_WORD_MATCH_TH){
      aligned.unshift({tw:tWords[i-1],iw:iWords[j-1],ok:true});
      i--; j--;
    }else if(j>0&&(i===0||dp[i][j-1]>=dp[i-1][j])){
      j--; // transcript 여분 단어 — 건너뜀
    }else{
      aligned.unshift({tw:tWords[i-1],iw:null,ok:false});
      i--;
    }
  }

  const hasDiff = aligned.some(a=>!a.ok) ||
    normalize(input).length !== normalize(target).length;

  const parts = aligned.map(a=>{
    if(a.ok){
      const nTw=normalize(a.tw), nIw=normalize(a.iw);
      // 동일 단어
      if(nTw===nIw) return `<span class="g">${esc(a.tw)}</span>`;
      // 발음 유사 — 약간 다름 (title에 인식 결과 표시)
      return `<span class="b" title="인식: ${esc(a.iw)}">${esc(a.tw)}</span>`;
    }
    return `<span class="m">${esc(a.tw)}</span>`; // 누락 단어
  }).join('&nbsp;');

  const extra = normalize(input).length>normalize(target).length
    ? `<div class="hint" style="margin-top:4px">인식된 내용이 원문보다 ${normalize(input).length-normalize(target).length}글자 더 깁니다.</div>`:'';

  diff.style.display='block';
  diff.innerHTML = hasDiff
    ? `<span class="hint">초록=일치 &nbsp;·&nbsp; 빨강=다름 &nbsp;·&nbsp; 점선=빠진 단어</span>&nbsp;${parts}${extra}`
    : `<span class="hint">완전히 일치합니다.</span>&nbsp;${parts}`;
}
function evalVoice(text){
  const { sim, pass } = previewVoice(text);
  document.getElementById('voiceRestart').style.display = sim < 100 ? 'block' : 'none';
  if(pass){
    if(voiceStage===1){ voiceScore1=sim; voiceInput1=text; }
    else              { voiceScore2=sim; voiceInput2=text; }
    renderSteps(voiceStage);
    document.getElementById('voiceNext').disabled   = false;
    document.getElementById('micBtn').disabled      = true;
    document.getElementById('voiceManual').readOnly = true;
    document.getElementById('voiceManualCheck').disabled = true;
    document.getElementById('micHint').textContent  = '입력 완료 · 다시 하려면 아래 버튼을 누르세요';
    document.getElementById('voiceRepeat').style.display = 'block';
    toast('✓ '+voiceStage+'차 통과!');
  }else{
    // 통과 못한 경우: 진행 중인 recognition 정리 후 재시도 안내
    recognizing = false;
    setMicRec(false);
    clearVoiceRecognition(true);
    document.getElementById('voiceNext').disabled   = true;  // 기준 미달 시 다음 단계 반드시 잠금
    document.getElementById('micBtn').disabled      = false; // 마이크 재사용 가능
    document.getElementById('voiceManual').readOnly = false;
    document.getElementById('voiceManualCheck').disabled = false;
    document.getElementById('voiceRepeat').style.display = 'block';
    document.getElementById('micHint').textContent = '🎙️ 탭하여 다시 녹음 시작';
    toast('기준 미달 — 다시 낭독해주세요');
  }
}
function voiceNext(){
  if(voiceStage===1){ voiceStage=2; renderVoice(); }
  else{ typeStage=1; renderTyping(); go('s-typing'); }
}
