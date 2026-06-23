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

// ── 날짜 기반 세션 관리 ────────────────────────────────────
let _memorizeSessionDate = null;  // 현재 암송 세션이 시작된 날짜
function getTodayDateString(){ return new Date().toISOString().slice(0, 10); }
function checkAndResetByDate(){
  const today = getTodayDateString();
  if(_memorizeSessionDate !== today){
    // 날짜가 변경되었으면 암송 진행 상태 초기화
    console.log(`[DATE-RESET] 날짜 변경 감지: ${_memorizeSessionDate} → ${today}`);
    resetMemorizeProgress();
    _memorizeSessionDate = today;
  }
}
function resetMemorizeProgress(){
  // 음성 인식 초기화
  voiceStage = 1;
  voiceScore1 = 0;
  voiceScore2 = 0;
  voiceInput1 = '';
  voiceInput2 = '';

  // 텍스트 입력 초기화
  typeStage = 1;
  typeScore1 = 0;
  typeScore2 = 0;
  typeCurrentScore = 0;
  typeInput1 = '';
  typeInput2 = '';

  // 진행 상태 초기화
  memorizeCompleted = false;
  reviewMode = false;

  // ★ 중요: localStorage의 어제 기록도 초기화
  try {
    localStorage.removeItem('pat_records');
    localStorage.removeItem('pat_daily_tasks');
    console.log('[DATE-RESET] ✅ localStorage도 초기화됨');
  } catch(e) {
    console.error('[DATE-RESET] localStorage 초기화 실패:', e.message);
  }

  console.log('[DATE-RESET] ✅ 암송 진행 상태 완전 초기화 완료');
}

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
// 한국어 발음 유사 문자 매핑 (음성 인식 오류 보정)
// BUG-V02 FIX: 자기 자신을 가리키는 무의미한 항목 제거, 실제 발음 혼동 쌍만 유지
const korPhoneticMap={
  '같':'까','까':'같',
  '지':'치','치':'지',
  '하므로':'함으로','함으로':'하므로',
  '롤':'를','를':'롤',
};
function normalizeKorean(s){
  s=(s||'').replace(/[\s.,!?;:'"·…]/g,'');
  // 한국어 발음 유사 치환 시도 (1글자 유사도 향상)
  let result=s;
  for(let orig in korPhoneticMap){
    if(s.includes(orig)){
      const alt=korPhoneticMap[orig];
      const replaced=s.replace(new RegExp(orig,'g'),alt);
      // 원본과 대체본 중 원문과 더 유사한 것 선택
      if(replaced.length===s.length) result=replaced;
    }
  }
  return result.toLowerCase();
}
function normalize(s){ return (s||'').replace(/[\s.,!?;:'"·…]/g,'').toLowerCase(); }
// 자모(음소) 단위 정규화 — 음절 분해 + 무음 초성 ㅇ 제거.
// "목자시니" ↔ "목자신이" 처럼 ASR 재음절화/띄어쓰기 차이를 음소 레벨에서 동일하게 봄.
const _JAMO_CHO  = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const _JAMO_JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const _JAMO_JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function jamoNormalize(s){
  s=(s||'').replace(/[\s.,!?;:'"·…]/g,'');
  let out='';
  for(const ch of s){
    const code=ch.charCodeAt(0);
    if(code>=0xAC00 && code<=0xD7A3){
      const idx=code-0xAC00;
      const cho=Math.floor(idx/588), jung=Math.floor((idx%588)/28), jong=idx%28;
      if(cho!==11) out+=_JAMO_CHO[cho];   // 초성 ㅇ(무음) 제거 — 종성 ㅇ(받침)은 유지
      out+=_JAMO_JUNG[jung];
      if(jong) out+=_JAMO_JONG[jong];
    } else { out+=ch.toLowerCase(); }
  }
  return out;
}
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
// 포함(containment) 유사도 — target(구절)이 transcript 안에 얼마나 들어있나.
// transcript 앞/뒤 여분(잡음·Whisper 반복 생성)은 무료(자유 시작/종료), target 누락·치환만 감점.
// → 올바로 낭독하면 뒤에 반복이 붙어도 ~100% 유지.
function containmentSimilarity(target, transcript){
  const a=normalize(target), b=normalize(transcript);
  if(!a || !b) return 0;
  const m=a.length, n=b.length;
  let prev=new Array(n+1).fill(0);     // dp[0][j]=0 → b 어디서든 시작 무료
  for(let i=1;i<=m;i++){
    const cur=new Array(n+1);
    cur[0]=i;                          // target i글자가 transcript에 전혀 없음 → i 감점
    for(let j=1;j<=n;j++){
      cur[j]=Math.min(
        prev[j-1] + (a[i-1]===b[j-1]?0:1), // 매치/치환
        prev[j] + 1,                        // target 글자 누락
        cur[j-1] + 1                         // transcript 중간 여분
      );
    }
    prev=cur;
  }
  let best=Infinity; for(let j=0;j<=n;j++) if(prev[j]<best) best=prev[j]; // dp[m][*] 최소 → 종료 무료
  return Math.round((1 - best/m)*100);
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
      // ★ 권한 요청 실패 시 showManual() 호출하지 않음
      // 토스트 메시지만 표시 → toggleMic()에서 재시도 가능
      if(err.name==='NotAllowedError'||err.name==='PermissionDeniedError'){
        toast('마이크 권한이 차단되었습니다 — 다시 시도해주세요');
      }else{
        toast('마이크를 사용할 수 없습니다 — 장치를 확인해주세요');
      }
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

  // ★ 마이크 권한이 없으면 요청해야 함!
  const ok = await acquireGlobalMicStream();
  if(ok) return true;

  // ★ 권한 요청 실패 시 showManual() 호출 금지!
  // toggleMic()에서 재시도 가능하도록 유지
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
  // ★ 모든 경로에서 버튼을 반드시 활성화하도록 보장
  try{
    // ★ 마이크 실패 후 재시도 시 권한 상태 초기화 (문제 해결)
    // 이전 실패로 voiceMicPermissionReady=false인 경우, 다시 요청하도록 강제
    const alreadyReady = voiceMicPermissionReady && (isMobileBrowser() || hasLiveGlobalMicStream());
    if(!alreadyReady){
      micBtn.disabled = true;
      document.getElementById('micHint').textContent = '마이크 권한 확인 중...';
      // ★ globalMicStream 무효화 시 권한 상태 리셋
      if(!hasLiveGlobalMicStream()){
        voiceMicPermissionReady = false;  // 강제 리셋 → 재요청 유도
      }
    }
    const hasMicPermission = await ensureMicrophonePermission();
    if(!hasMicPermission){
      return;
    }
  }catch(err){
    console.error('[VOICE-ERROR] toggleMic catch:', err);
  }finally{
    micBtn.disabled = false;  // ★ 모든 경로에서 반드시 활성화
  }
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

// ── 중복 n-gram 제거 (모듈 레벨 — BUG-V04 FIX: 클로저 재생성 제거) ──────
// isFinal 세그먼트 연결 후 중복 n-gram 제거
// Android Chrome이 반복 패턴을 보내는 경우 처리
function collapseRepeatedNgrams(text){
  let result=(text||'').trim();
  const words=result.split(/\s+/).filter(Boolean);
  if(words.length<2) return result;

  let changed=true;
  let iteration=0;
  while(changed && iteration<10){
    iteration++;
    changed=false;

    for(let i=words.length-1;i>0;i--){
      if(words[i]===words[i-1]){
        console.log('[VOICE-LOG] collapseRepeatedNgrams iter'+iteration+' — 인접 중복['+i+']:"'+words[i]+'"');
        words.splice(i,1);
        changed=true;
      }
    }

    if(!changed && words.length>=4){
      outer: for(let size=Math.min(words.length,8);size>=3;size--){
        for(let i=0;i<words.length-size;i++){
          for(let j=i+size;j<=words.length-size;j++){
            const match=words.slice(i,i+size).every((w,k)=>w===words[j+k]);
            if(match){
              console.log('[VOICE-LOG] collapseRepeatedNgrams iter'+iteration+' — n-gram['+j+'] size:'+size);
              words.splice(j,size);
              changed=true;
              break outer;
            }
          }
        }
      }
    }
  }

  return words.join(' ');
}

// ── SpeechRecognition 엔진 ────────────────────────────────
function startVoiceRecognition(SR, isRecovery=false){
  console.log('[VOICE-LOG] startVoiceRecognition isRecovery:'+isRecovery+' stage:'+voiceStage+' prevRecog:'+(recog?'live':'null')+' recov:'+voiceRecoveryCount);
  document.getElementById('voiceRestart').style.display = 'none';
  let finalText='', latestText='', handled=false;
  let recogStartedAt=0; // onstart 시각 — 초기 잡소리 제거 기준
  let lastProcessedFinalIndex=-1; // 마지막으로 처리한 isFinal 인덱스 — 중복 제거
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
      console.log('[VOICE-LOG] onresult elapsed:'+_elapsed+'ms isFinal:'+_last.isFinal+' results.length:'+e.results.length+' lastProcessed:'+lastProcessedFinalIndex);
      // onstart 직후 N ms 이내 result는 탭 소리·주변 잡음일 가능성이 높으므로 무시
      if(recogStartedAt && _elapsed < STARTUP_NOISE_GUARD) return;

      // isFinal=true인 모든 결과를 현재 상태로 수집 (내용 변경 감지용)
      const allFinalText=[];
      for(let i=0;i<e.results.length;i++){
        if(e.results[i].isFinal){
          const transcript=e.results[i][0].transcript.trim();
          if(transcript) allFinalText.push(transcript);
        }
      }
      const currentFinalText=allFinalText.join(' ');

      // 중요: isFinal=true인 첫 번째 결과만 한 번 처리하기
      // 이후 onresult 콜백에서 동일하거나 포함된 내용은 무시
      let shouldUpdate=false;
      if(lastProcessedFinalIndex===-1 && currentFinalText){
        // 첫 isFinal 내용
        shouldUpdate=true;
        lastProcessedFinalIndex=0; // 표식: 적어도 하나의 isFinal이 처리됨
      }else if(lastProcessedFinalIndex>=0 && currentFinalText && !finalText.includes(currentFinalText)){
        // 이전 finalText에 현재 내용이 포함되지 않음 → 새로운 내용이 추가됨
        shouldUpdate=true;
      }

      if(shouldUpdate){
        const oldFinalText=finalText;
        finalText=collapseRepeatedNgrams((finalText?(finalText+' '):'')+currentFinalText);
        if(finalText!==oldFinalText){
          console.log('[VOICE-LOG] finalText 업데이트: "'+oldFinalText+'" → "'+finalText+'"');
        }
      }

      // interim (아직 isFinal 아님) 결과 렌더링
      const last=e.results[e.results.length-1];
      const interimText=last.isFinal?'':last[0].transcript.trim();
      latestText=(interimText?mergeSpeechText(finalText,interimText):finalText).trim();
      // 최종 텍스트도 중복 제거하여 화면 표시 시 이미 깔끔한 상태 유지
      latestText=collapseRepeatedNgrams(latestText);
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
