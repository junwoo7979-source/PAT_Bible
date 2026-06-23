// ====== PAT Bible — groq-asr.js ======
// 클라우드 음성인식: 녹음(MediaRecorder) → Firebase Function(Groq Whisper large-v3) → 텍스트 → 기존 채점.
// 폰은 음성만 업로드하고 서버(GPU)가 전사 → 구형폰에서도 ~1~2초. (네트워크 필요)

// ★ Groq 활성화 스위치 — API 키(시크릿)+함수 배포가 끝나면 true로 바꾸면 즉시 Groq(1~2초) 사용.
//   false면 그대로 브라우저 Whisper 사용(성능 저하 없음).
const GROQ_ENABLED = false;

let _gRec = null, _gChunks = [], _gRecording = false;
let _groqDown = false;   // Groq(함수/키) 미준비 감지 → 이후 곧장 Whisper 폴백

function _gHint(t){ const e = document.getElementById('micHint'); if(e) e.textContent = t; }

// 전사 텍스트 공통 처리 (표시 + 채점)
function _gHandle(text){
  const el = document.getElementById('recognized'); if(el) el.textContent = text || '(인식 결과 없음)';
  if(text){
    if(typeof previewVoice === 'function') previewVoice(text);
    if(typeof evalVoice === 'function') evalVoice(text);
    _gHint('탭하여 녹음 시작');
  } else {
    toast('음성이 인식되지 않았습니다 — 다시 시도하세요'); _gHint('탭하여 녹음 시작');
  }
}

// Blob → base64 (data URL 접두사 제거)
function _blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => { const s = String(fr.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

// 마이크 토글 (녹음 시작/종료) — 기존 toggleMic/whisperToggleMic 대체
async function groqToggleMic(){
  if(_gRecording){
    try { if(_gRec && _gRec.state !== 'inactive') _gRec.stop(); } catch(e){}
    return;
  }
  // 권한 (기존 헬퍼 재사용)
  let ok = true;
  try { if(typeof ensureMicrophonePermission === 'function') ok = await ensureMicrophonePermission(); } catch(e){ ok = false; }
  if(!ok) return;

  let stream = (typeof globalMicStream !== 'undefined' && globalMicStream) ? globalMicStream : null;
  if(!stream){
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch(e){ toast('마이크를 시작할 수 없습니다 — 아래 대체 입력 사용'); if(typeof showManual === 'function') showManual(); return; }
  }

  _gChunks = [];
  let mime = '';
  ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'].some(m => {
    if(window.MediaRecorder && MediaRecorder.isTypeSupported(m)){ mime = m; return true; } return false;
  });
  try { _gRec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
  catch(e){ _gRec = new MediaRecorder(stream); }

  _gRec.ondataavailable = e => { if(e.data && e.data.size) _gChunks.push(e.data); };
  _gRec.onstop = async () => {
    _gRecording = false;
    if(typeof setMicRec === 'function') setMicRec(false);
    const blob = new Blob(_gChunks, { type: (_gRec && _gRec.mimeType) || mime || 'audio/webm' });
    if(!blob.size){ toast('녹음이 비어 있습니다 — 다시 시도하세요'); _gHint('탭하여 녹음 시작'); return; }
    const mt = (_gRec && _gRec.mimeType) || mime || 'audio/webm';
    // 1차: Groq(클라우드) 전사 — 폰 부담 0, ~1~2초 (GROQ_ENABLED일 때만)
    if(GROQ_ENABLED && !_groqDown && window.PAT_DB && PAT_DB.ready && PAT_DB.ready() && PAT_DB.transcribeAudio){
      _gHint('☁️ 음성 인식 중...');
      try {
        const b64 = await _blobToBase64(blob);
        const text = await PAT_DB.transcribeAudio(b64, mt, 'ko');
        _gHandle(text); return;
      } catch(err){
        console.warn('[GROQ-ASR] Groq 미준비 → Whisper 폴백:', err && err.message);
        _groqDown = true;   // 키/함수 미설정 → 이후 곧장 Whisper
      }
    }
    // 2차(폴백): 브라우저 Whisper
    if(typeof transcribeBlob === 'function'){
      _gHint('🧠 음성 변환 중...');
      try { const text = await transcribeBlob(blob); _gHandle(text); }
      catch(err){ console.error('[ASR] 폴백 실패:', err); toast('음성 인식 실패 — 아래 대체 입력 사용'); if(typeof showManual==='function') showManual(); _gHint('탭하여 녹음 시작'); }
    } else {
      toast('음성 인식 실패 — 아래 대체 입력 사용'); if(typeof showManual==='function') showManual(); _gHint('탭하여 녹음 시작');
    }
  };

  try { _gRec.start(); } catch(e){ toast('녹음을 시작할 수 없습니다'); return; }
  _gRecording = true;
  if(typeof setMicRec === 'function') setMicRec(true);
}

if(typeof window !== 'undefined'){
  window.groqToggleMic = groqToggleMic;
}
