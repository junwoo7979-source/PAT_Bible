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
    const mark=showReview&&n<active?'✓':n;
    const detail=showReview&&score?`<small>${score}% · ${review?'다시 검수':'확인'}</small>`:'';
    const body=`<span class="no">${mark}</span>${nm}${detail}`;
    if(showReview&&score) return `<button type="button" class="st ${cls} ${review?'review':''}" onclick="reviewStep(${n})">${body}</button>`;
    return `<div class="st ${cls}">${body}</div>`;
  }).join('');
  ['stepsVoice','stepsTyping','stepsComplete','stepsVerse'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.innerHTML=html;
  });
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
  const sim  = similarity(text, DB.verse.text);
  const pass = sim >= TH().voice;
  document.getElementById('simBar').style.width = sim+'%';
  document.getElementById('simLabel').innerHTML =
    `유사도 <b style="color:${pass?'var(--accent)':'var(--danger)'}">${sim}%</b> · 통과 기준 ${TH().voice}%`;
  renderVoiceDiff(text);
  return { sim, pass };
}
function renderVoiceDiff(input){
  const diff    = document.getElementById('voiceDiff');
  const target  = DB.verse.text;
  const nInput  = normalize(input);
  const nTarget = normalize(target);
  if(!nInput){ diff.style.display='none'; diff.innerHTML=''; return; }
  let html='', pos=0, hasDiff=false;
  for(const tc of target){
    const ntc = normalize(tc);
    if(!ntc){ html += (tc===' '?'&nbsp;':`<span class="n">${esc(tc)}</span>`); continue; }
    if(pos < nInput.length){
      const ok = nInput[pos]===ntc;
      if(!ok) hasDiff=true;
      html += `<span class="${ok?'g':'b'}">${esc(tc)}</span>`;
      pos++;
    }else{ hasDiff=true; html += `<span class="m">${esc(tc)}</span>`; }
  }
  if(nInput.length !== nTarget.length) hasDiff=true;
  const extra = nInput.length>nTarget.length
    ? `<div class="hint">인식된 내용이 원문보다 ${nInput.length-nTarget.length}글자 더 깁니다.</div>` : '';
  diff.style.display = 'block';
  diff.innerHTML = hasDiff
    ? `<span class="hint">다른 부분: 초록=일치, 빨강=다름, 점선=빠짐</span>${html}${extra}`
    : `<span class="hint">완전히 일치합니다.</span>${html}`;
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
    toast('기준 미달 — 다시 낭독해주세요');
  }
}
function voiceNext(){
  if(voiceStage===1){ voiceStage=2; renderVoice(); }
  else{ typeStage=1; renderTyping(); go('s-typing'); }
}
