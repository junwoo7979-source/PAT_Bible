// ====== PAT Bible — voice.js ======
// 마이크 스트림 관리, SpeechRecognition 엔진, 음성 인식 로직

// ── 음성·암송 상태 변수 ────────────────────────────────────
let voiceStage=1, voiceScore1=0, voiceScore2=0, recognizing=false, recog=null, typeStage=1;
let typeScore1=0, typeScore2=0, typeCurrentScore=0;
let voiceInput1='', voiceInput2='', typeInput1='', typeInput2='';
let memorizeCompleted=false, reviewMode=false;
let voiceReadyAt=0, voiceStartTimer=null;
const VOICE_RELEASE_DELAY=150;
const VOICE_RECOVERY_LIMIT=5;
let voiceRecoveryCount=0, voiceStopRequested=false;
let voiceMicPermissionReady=false;
let globalMicStream=null;
let micPermissionRequestedThisSession=false;

// ── 환경 감지 ─────────────────────────────────────────────
function isMobileBrowser(){
  const ua = (typeof navigator!=='undefined'?navigator.userAgent:'')||'';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}
function isKakaoInAppBrowser(){
  const ua = (typeof navigator!=='undefined'?navigator.userAgent:'')||'';
  return /KAKAOTALK/i.test(ua);
}

// ── 텍스트 정규화 / 유사도 ────────────────────────────────
function normalize(s){ return (s||'').replace(/[\s.,!?;:'"·…]/g,'').toLowerCase(); }
function similarity(a,b){
  a=normalize(a); b=normalize(b);
  if(!a||!b) return 0;
  const m=a.length, n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  const dist=dp[m][n]; const maxL=Math.max(m,n);
  return Math.round((1-dist/maxL)*100);
}

// ── Recognition 정리 ─────────────────────────────────────
function clearVoiceRecognition(cancel=false){
  console.log('[VOICE-LOG] clearVoiceRecognition cancel:'+cancel+' recog:'+(recog?'live':'null'));
  const activeRecog = recog;
  recog = null;
  if(!activeRecog) return;
  voiceReadyAt = Math.max(voiceReadyAt, Date.now()+VOICE_RELEASE_DELAY);
  activeRecog.onstart=null; activeRecog.onresult=null;
  activeRecog.onerror=null; activeRecog.onend=null;
  if(cancel){
    try{ activeRecog.abort ? activeRecog.abort() : activeRecog.stop(); }catch(err){}
  }
}
function clearVoiceStartTimer(){
  if(!voiceStartTimer) return;
  clearTimeout(voiceStartTimer);
  voiceStartTimer = null;
}

// ── 전역 마이크 스트림 관리 ──────────────────────────────
// 암송 세션 전체에서 스트림을 유지하여 권한 창 반복 방지
let globalMicStreamPromise = null;

function hasLiveGlobalMicStream(){
  return !!(globalMicStream && globalMicStream.getTracks().some(t=>t.readyState==='live'));
}
function acquireGlobalMicStream(){
  const nav = window.navigator;
  if(!nav || !nav.mediaDevices || !nav.mediaDevices.getUserMedia) return Promise.resolve(true);
  if(hasLiveGlobalMicStream()){ voiceMicPermissionReady=true; return Promise.resolve(true); }
  globalMicStream = null;
  if(globalMicStreamPromise) return globalMicStreamPromise;
  globalMicStreamPromise = (async()=>{
    micPermissionRequestedThisSession = true;
    try{
      globalMicStream = await nav.mediaDevices.getUserMedia({ audio:true });
      voiceMicPermissionReady = true;
      return true;
    }catch(err){
      voiceMicPermissionReady = false;
      if(err.name==='NotAllowedError'||err.name==='PermissionDeniedError'){
        toast('마이크 권한을 허용해야 음성 암송을 시작할 수 있습니다');
      }else{
        toast('마이크를 사용할 수 없습니다 — 장치를 확인해주세요');
      }
      document.getElementById('voiceRestart').style.display='block';
      showManual();
      return false;
    }finally{ globalMicStreamPromise=null; }
  })();
  return globalMicStreamPromise;
}
async function requestMicPermissionAtSessionStart(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const insecure = location.protocol==='file:' || (!window.isSecureContext && location.hostname!=='localhost');
  if(!SR || insecure) return true;
  if(isKakaoInAppBrowser()){ showInAppBrowserMicNotice(); return false; }
  if(isMobileBrowser()){
    micPermissionRequestedThisSession = true;
    voiceMicPermissionReady = true;
    document.getElementById('micHint').textContent = '녹음 버튼을 누르면 마이크 권한을 한 번만 허용해주세요';
    return true;
  }
  if(hasLiveGlobalMicStream()){ voiceMicPermissionReady=true; return true; }
  const micBtn = document.getElementById('micBtn');
  micBtn.disabled = true;
  document.getElementById('micHint').textContent = '처음 한 번만 마이크 권한을 허용해주세요';
  const ok = await acquireGlobalMicStream();
  micBtn.disabled = false;
  return ok;
}
function releaseGlobalMicStream(){
  // track.stop() 하지 않음 — 스트림 유지로 다음 세션 권한 창 방지
  globalMicStreamPromise = null;
}
function destroyGlobalMicStream(){
  globalMicStreamPromise = null;
  if(!globalMicStream) return;
  globalMicStream.getTracks().forEach(t=>t.stop());
  globalMicStream = null;
  voiceMicPermissionReady = false;
  micPermissionRequestedThisSession = false;
}
async function ensureMicrophonePermission(){
  if(voiceMicPermissionReady && (isMobileBrowser() || hasLiveGlobalMicStream())) return true;
  voiceMicPermissionReady = false;
  document.getElementById('voiceRestart').style.display = 'block';
  if(micPermissionRequestedThisSession){
    toast('마이크 권한이 차단되었습니다 — 주소창 사이트 설정에서 마이크를 허용해주세요');
  }else{
    toast('암송 시작 버튼에서 마이크를 처음 한 번 허용해주세요');
  }
  showManual();
  return false;
}
async function prewarmMicPermission(){ return; } // 자동 권한 요청 금지

// ── 인앱 브라우저 안내 ────────────────────────────────────
function showInAppBrowserMicNotice(){
  const existing = document.getElementById('inAppMicNotice');
  if(existing){ existing.style.display='block'; return; }
  const notice = document.createElement('div');
  notice.id = 'inAppMicNotice';
  notice.className = 'card';
  notice.style.borderColor = 'var(--danger)';
  notice.style.marginTop   = '14px';
  notice.innerHTML =
    '<h2>카카오톡 안에서는 마이크가 불안정합니다</h2>' +
    '<p class="muted" style="margin:6px 0 12px">카카오톡 인앱 브라우저는 마이크 권한을 저장하지 않아 허용창이 반복될 수 있습니다. 오른쪽 위 메뉴에서 "다른 브라우저로 열기"를 선택한 뒤 Chrome 또는 Safari에서 테스트해주세요.</p>' +
    '<button class="btn ghost" onclick="copyAppLinkForBrowser()">앱 주소 복사</button>';
  const voiceScreen = document.getElementById('s-voice');
  const verse = document.getElementById('vRef')?.parentElement;
  voiceScreen.insertBefore(notice, verse ? verse.nextSibling : voiceScreen.children[3]);
  showManual();
}
function copyAppLinkForBrowser(){
  const url = 'https://junwoo7979-source.github.io/PAT_Bible/app/';
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(()=>toast('앱 주소가 복사되었습니다')).catch(()=>prompt('아래 주소를 복사하세요:', url));
  }else{ prompt('아래 주소를 복사하세요:', url); }
}

// ── 마이크 버튼 토글 ─────────────────────────────────────
async function toggleMic(){
  console.log('[VOICE-LOG] toggleMic recognizing:'+recognizing+' stopReq:'+voiceStopRequested+' recov:'+voiceRecoveryCount);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const insecure = location.protocol==='file:' || (!window.isSecureContext && location.hostname!=='localhost');
  if(!SR || insecure){
    toast(!SR ? '이 브라우저는 음성인식을 지원하지 않습니다' : '브라우저 보안 정책으로 마이크가 제한됩니다');
    showManual();
    return;
  }
  if(recognizing){
    voiceStopRequested=true;
    clearVoiceStartTimer(); // 복구 대기 타이머도 즉시 취소
    if(recog){ recog.stop(); }
    else { recognizing=false; setMicRec(false); toast('녹음을 종료했습니다'); } // recog=null인 복구 gap 처리
    return;
  }
  const micBtn = document.getElementById('micBtn');
  // 권한이 이미 확보된 경우 disabled/힌트 처리 생략 → 즉각 반응
  const alreadyReady = voiceMicPermissionReady && (isMobileBrowser() || hasLiveGlobalMicStream());
  if(!alreadyReady){
    micBtn.disabled = true;
    document.getElementById('micHint').textContent = '마이크 권한 확인 중...';
  }
  const hasMicPermission = await ensureMicrophonePermission();
  micBtn.disabled = false;
  if(!hasMicPermission) return;
  // 새 인식 시작 — 이전 통과 상태 초기화 (재시도 시 다음 단계 잠금)
  document.getElementById('voiceNext').disabled = true;
  document.getElementById('voiceRepeat').style.display = 'none';
  voiceRecoveryCount=0; voiceStopRequested=false;
  clearVoiceRecognition(true);
  const wait = Math.max(0, voiceReadyAt-Date.now());
  if(wait){
    if(voiceStartTimer) return;
    document.getElementById('micHint').textContent = '마이크 준비 중... 잠시만 기다려주세요';
    voiceStartTimer = setTimeout(()=>{ voiceStartTimer=null; startVoiceRecognition(SR); }, wait);
    return;
  }
  startVoiceRecognition(SR);
}
async function restartVoiceRecognitionSafely(SR, isRecovery=false){
  if(voiceStopRequested){ recognizing=false; setMicRec(false); return; } // 정지 요청 시 재시작 차단
  if(!voiceMicPermissionReady){
    toast('마이크 권한을 먼저 허용한 뒤 다시 시작해주세요');
    document.getElementById('voiceRestart').style.display = 'block';
    showManual();
    return;
  }
  startVoiceRecognition(SR, isRecovery);
}

// ── SpeechRecognition 엔진 ────────────────────────────────
function startVoiceRecognition(SR, isRecovery=false){
  console.log('[VOICE-LOG] startVoiceRecognition isRecovery:'+isRecovery+' stage:'+voiceStage+' prevRecog:'+(recog?'live':'null')+' recov:'+voiceRecoveryCount);
  document.getElementById('voiceRestart').style.display = 'none';
  let finalText='', latestText='', handled=false;
  let recogStartedAt=0; // onstart 시각 — 초기 잡소리 제거 기준
  const STARTUP_NOISE_GUARD=150; // 시작 후 N ms 동안 result 무시 (탭 소리 등 차단)

  const mergeSpeechText=(base,fragment)=>{
    const current=(base||'').trim(); const next=(fragment||'').trim();
    if(!current) return next; if(!next) return current;
    if(next.startsWith(current)) return next;
    if(current.endsWith(next)) return current;
    const max=Math.min(current.length,next.length);
    for(let len=max;len>0;len--){
      if(current.slice(-len)===next.slice(0,len)) return current+next.slice(len);
    }
    return current+' '+next;
  };
  const collapseRepeatedVersePrefix=(text)=>{
    let cleaned=(text||'').trim();
    const words=DB.verse.text.split(/\s+/).filter(Boolean);
    for(let size=Math.min(words.length,12);size>=2;size--){
      const prefix=words.slice(0,size).join(' ');
      let index=cleaned.indexOf(prefix,prefix.length);
      while(index>0){
        cleaned=(cleaned.slice(0,index).trimEnd()+' '+cleaned.slice(index+prefix.length).trimStart()).trim();
        index=cleaned.indexOf(prefix,prefix.length);
      }
    }
    return cleaned;
  };
  const recover=(msg)=>{
    console.log('[VOICE-LOG] recover mobile:'+isMobileBrowser()+' stopReq:'+voiceStopRequested+' count:'+voiceRecoveryCount+'/'+VOICE_RECOVERY_LIMIT+' msg:'+(msg||''));
    // 사용자 정지 요청 또는 복구 한도 초과 → 완전히 종료
    if(voiceStopRequested||voiceRecoveryCount>=VOICE_RECOVERY_LIMIT){
      recognizing=false; setMicRec(false);
      toast(msg||'음성이 인식되지 않았습니다 — 다시 시도하거나 대체 입력 사용');
      document.getElementById('voiceRestart').style.display='block';
      document.getElementById('voiceRepeat').style.display='block';
      document.getElementById('micHint').textContent='🎙️ 탭하여 다시 녹음 시작';
      if(!isMobileBrowser()) showManual();
      return;
    }
    // 자동 재시작 — recognizing=true 유지, UI 변화 없음 (seamless, 사용자 체감 꺼짐 없음)
    voiceRecoveryCount++;
    // recognizing은 true 유지: toggleMic() 정지 흐름 보존, 버튼 ⏹️ 그대로 유지
    // setMicReconnecting() 제거: 🔄 깜빡임 없음 — onstart에서 setMicRec(true) 호출되면 자동 복원
    document.getElementById('manualBox').style.display='none';
    const wait=Math.max(VOICE_RELEASE_DELAY, voiceReadyAt-Date.now());
    clearVoiceStartTimer();
    voiceStartTimer=setTimeout(()=>{ voiceStartTimer=null; restartVoiceRecognitionSafely(SR, true); }, wait);
  };
  const fail=(msg)=>{
    console.log('[VOICE-LOG] fail msg:"'+msg+'" handled:'+handled);
    if(handled) return; handled=true;
    recognizing=false; setMicRec(false);
    clearVoiceRecognition();
    toast(msg); showManual();
  };

  const isIOS = /iPad|iPhone|iPod/.test((typeof navigator!=='undefined'?navigator.userAgent:'')||'')
    && !(typeof window!=='undefined'&&window.MSStream);
  try{
    recog=new SR(); recog.lang='ko-KR'; recog.interimResults=true;
    recog.continuous=!isIOS;
    recognizing=true;
    // 첫 시작만 "연결 중" 힌트 표시 — recovery 재시작은 "재연결 중" 유지
    if(!isRecovery){
      document.getElementById('micHint').textContent='🔴 마이크 연결 중... 잠시 후 말씀하세요';
    }
    recog.onstart=()=>{
      recogStartedAt=Date.now();
      console.log('[VOICE-LOG] onstart — 마이크 활성화 stage:'+voiceStage+' isRecovery:'+isRecovery+' time:'+recogStartedAt);
      setMicRec(true);
    };
    recog.onresult=(e)=>{
      const _elapsed=Date.now()-recogStartedAt;
      const _last=e.results[e.results.length-1];
      console.log('[VOICE-LOG] onresult isFinal:'+_last.isFinal+' elapsed:'+_elapsed+'ms results:'+e.results.length+' "'+_last[0].transcript.substring(0,40)+'"');
      // onstart 직후 N ms 이내 result는 탭 소리·주변 잡음일 가능성이 높으므로 무시
      if(recogStartedAt && _elapsed < STARTUP_NOISE_GUARD) return;
      finalText='';
      for(let i=0;i<e.results.length;i++){
        const r=e.results[i];
        if(r.isFinal) finalText=collapseRepeatedVersePrefix(mergeSpeechText(finalText,r[0].transcript));
      }
      const last=e.results[e.results.length-1];
      const interimText=last.isFinal?'':last[0].transcript;
      latestText=(interimText?mergeSpeechText(finalText,interimText):finalText).trim();
      document.getElementById('recognized').textContent=latestText;
      previewVoice(latestText);
    };
    recog.onerror=(e)=>{
      const err=(e&&e.error)||'unknown';
      console.log('[VOICE-LOG] onerror err:"'+err+'" handled:'+handled+' stopReq:'+voiceStopRequested+' recov:'+voiceRecoveryCount);
      if(['no-speech','network','aborted'].includes(err)){
        if(handled) return; handled=true;
        clearVoiceRecognition();
        recover('음성 인식이 잠시 끊겼습니다 — 자동으로 다시 시작합니다');
        return;
      }
      fail('음성 인식 오류('+err+') — 아래 대체 입력 사용');
    };
    recog.onend=()=>{
      console.log('[VOICE-LOG] onend handled:'+handled+' stopReq:'+voiceStopRequested+' text:"'+(latestText||'').substring(0,30)+'" recov:'+voiceRecoveryCount);
      if(handled) return; handled=true;
      clearVoiceRecognition();
      if(voiceStopRequested){
        recognizing=false; setMicRec(false);
        if(latestText.trim()) evalVoice(latestText);
        else toast('녹음을 종료했습니다');
      }else if(latestText.trim()&&similarity(latestText,DB.verse.text)>=TH().voice){
        recognizing=false; setMicRec(false);
        evalVoice(latestText);
      }else{
        recover(latestText.trim()
          ?'음성 인식이 중간에 끊겼습니다 — 자동으로 계속 듣습니다'
          :'음성이 인식되지 않았습니다 — 자동으로 다시 시작합니다');
      }
    };
    console.log('[VOICE-LOG] recog.start() — continuous:'+recog.continuous+' interimResults:'+recog.interimResults+' lang:'+recog.lang);
    recog.start();
    // UI는 onstart 이벤트에서 업데이트 — 실제 마이크 활성 시점과 일치시킴
  }catch(err){ fail('마이크를 시작할 수 없습니다 — 아래 대체 입력 사용'); }
}

// ── 마이크 버튼 상태 ─────────────────────────────────────
function setMicPreparing(){
  const b = document.getElementById('micBtn');
  b.classList.remove('rec'); b.textContent = '🎙️';
  document.getElementById('micHint').textContent = '마이크 준비 중... 잠시만 기다려주세요';
}
// 자동 재연결 중 — rec 클래스 유지로 버튼 깜빡임 방지
function setMicReconnecting(){
  const b = document.getElementById('micBtn');
  b.classList.add('rec'); b.textContent = '🔄';
  document.getElementById('micHint').textContent = '🔄 재연결 중...';
}
function setMicRec(on){
  const b = document.getElementById('micBtn');
  b.classList.toggle('rec',on); b.textContent = on?'⏹️':'🎙️';
  document.getElementById('micHint').textContent = on?'녹음 중... 탭하여 종료':'탭하여 녹음 시작';
}
function simulateVoice(){
  setMicRec(true);
  document.getElementById('micHint').textContent = '인식 중...(체험 모드)';
  setTimeout(()=>{
    setMicRec(false);
    const words = DB.verse.text.split(' ');
    const keep  = Math.ceil(words.length*0.9);
    const simulated = words.slice(0,keep).join(' ');
    document.getElementById('recognized').textContent = simulated+' …';
    evalVoice(simulated);
  }, 1200);
}

// ── 앱 종료 시 마이크 스트림 해제 ─────────────────────────
if(typeof window !== 'undefined' && window.addEventListener){
  window.addEventListener('pagehide',    destroyGlobalMicStream);
  window.addEventListener('beforeunload', destroyGlobalMicStream);
}
