// ====== PAT Bible — whisper-asr.js ======
// 브라우저 내장 Whisper(transformers.js) 음성 인식 — Web SpeechRecognition 대체.
// 흐름: 녹음(MediaRecorder) → Whisper 변환 → 기존 채점(evalVoice/previewVoice) 재사용.
// 모델은 최초 1회만 다운로드되고 이후 브라우저 캐시에서 즉시 로드됨.

const WHISPER_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';
const WHISPER_MODEL = 'Xenova/whisper-base';    // WASM 환경 최적(속도/정확도 균형). large-v3-turbo는 WASM에서 728MB·전사 68s로 사용 불가 확인
const WHISPER_DTYPE = 'q8';

let _whisperPipe = null;
let _whisperLoadingP = null;
let _wRec = null, _wChunks = [], _wRecording = false;
let _whLastPct = -1, _whBackend = '';

function _whHint(t){ const e = document.getElementById('micHint'); if(e) e.textContent = t; }

// transformers.js + 모델 lazy 로드 (최초 1회 다운로드 → 브라우저 캐시)
async function loadWhisper(){
  if(_whisperPipe) return _whisperPipe;
  if(_whisperLoadingP) return _whisperLoadingP;
  _whisperLoadingP = (async () => {
    _whHint('🧠 음성엔진 준비 중...');
    const { pipeline, env } = await import(WHISPER_CDN);
    env.allowLocalModels = false;                       // HuggingFace Hub에서 로드
    // ★ WASM 멀티스레드로 속도 확보(WebGPU는 일부 기기/헤드리스에서 추론이 행(hang)되어 미사용)
    try {
      if(env.backends?.onnx?.wasm){
        env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
      }
    } catch(_){}
    const onProg = (p) => {
      if(p && p.status === 'progress' && typeof p.progress === 'number'){
        const pct = Math.round(p.progress);
        if(pct !== _whLastPct){ _whLastPct = pct; _whHint('🧠 음성엔진 다운로드 ' + pct + '%'); }
      }
    };
    _whisperPipe = await pipeline('automatic-speech-recognition', WHISPER_MODEL, { dtype: WHISPER_DTYPE, progress_callback: onProg });
    _whBackend = 'wasm';
    console.log('[WHISPER] 백엔드:', _whBackend, '/ threads:', (env.backends?.onnx?.wasm?.numThreads));
    _whHint('탭하여 녹음 시작');
    return _whisperPipe;
  })();
  return _whisperLoadingP;
}
function preloadWhisper(){ loadWhisper().catch(err => console.warn('[WHISPER] preload 실패:', err && err.message)); }

// 녹음 Blob → 16kHz mono Float32Array (Whisper 입력 형식)
async function _blobToFloat32(blob){
  const buf = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx({ sampleRate: 16000 });
  try{
    const decoded = await ctx.decodeAudioData(buf);
    let data = decoded.getChannelData(0);
    if(decoded.sampleRate !== 16000){            // 일부 브라우저는 컨텍스트 rate 무시 → 수동 리샘플
      const ratio = decoded.sampleRate / 16000;
      const outLen = Math.floor(data.length / ratio);
      const out = new Float32Array(outLen);
      for(let i = 0; i < outLen; i++) out[i] = data[Math.floor(i * ratio)];
      data = out;
    }
    return data;
  } finally { try { ctx.close && ctx.close(); } catch(e){} }
}

// Blob → 한국어 텍스트
async function transcribeBlob(blob){
  const pipe = await loadWhisper();
  const audio = await _blobToFloat32(blob);
  const out = await pipe(audio, {
    language: 'korean', task: 'transcribe',
    chunk_length_s: 30, return_timestamps: false,
    no_repeat_ngram_size: 3,   // 침묵 구간 반복 생성 억제
  });
  return (((out && out.text) || '')).replace(/\s+/g, ' ').trim();
}

// 마이크 토글 (기존 toggleMic 대체) — 녹음 시작/종료
async function whisperToggleMic(){
  if(_wRecording){                                       // 녹음 중 → 종료
    try { if(_wRec && _wRec.state !== 'inactive') _wRec.stop(); } catch(e){}
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

  preloadWhisper();                                      // 모델 로드 병행(진행률 표시)
  _wChunks = [];
  let mime = '';
  ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'].some(m => {
    if(window.MediaRecorder && MediaRecorder.isTypeSupported(m)){ mime = m; return true; } return false;
  });
  try { _wRec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
  catch(e){ _wRec = new MediaRecorder(stream); }

  _wRec.ondataavailable = e => { if(e.data && e.data.size) _wChunks.push(e.data); };
  _wRec.onstop = async () => {
    _wRecording = false;
    if(typeof setMicRec === 'function') setMicRec(false);
    const blob = new Blob(_wChunks, { type: (_wRec && _wRec.mimeType) || mime || 'audio/webm' });
    if(!blob.size){ toast('녹음이 비어 있습니다 — 다시 시도하세요'); _whHint('탭하여 녹음 시작'); return; }
    _whHint('🧠 음성 변환 중...');
    try{
      const text = await transcribeBlob(blob);
      const el = document.getElementById('recognized'); if(el) el.textContent = text || '(인식 결과 없음)';
      if(text){
        if(typeof previewVoice === 'function') previewVoice(text);
        if(typeof evalVoice === 'function') evalVoice(text);
        _whHint('탭하여 녹음 시작');
      } else {
        toast('음성이 인식되지 않았습니다 — 다시 시도하세요'); _whHint('탭하여 녹음 시작');
      }
    } catch(err){
      console.error('[WHISPER] 변환 실패:', err);
      toast('음성 변환 실패 — 아래 대체 입력 사용'); if(typeof showManual === 'function') showManual(); _whHint('탭하여 녹음 시작');
    }
  };

  try { _wRec.start(); } catch(e){ toast('녹음을 시작할 수 없습니다'); return; }
  _wRecording = true;
  if(typeof setMicRec === 'function') setMicRec(true);
}

// 음성 화면 진입 시 모델 미리 로드 (첫 녹음 지연 최소화)
if(typeof window !== 'undefined' && typeof window.go === 'function' && !window._whisperGoWrapped){
  window._whisperGoWrapped = true;
  const _origGo = window.go;
  window.go = function(id, a, b){ _origGo(id, a, b); if(id === 's-verse') preloadWhisper(); };
}

if(typeof window !== 'undefined'){
  window.whisperToggleMic = whisperToggleMic;
  window.preloadWhisper = preloadWhisper;
  window.transcribeBlob = transcribeBlob;   // 테스트용 노출
  window.loadWhisper = loadWhisper;
}
