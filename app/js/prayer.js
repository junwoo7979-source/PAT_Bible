// ====== PAT Bible — prayer.js ======
// 기도 기록 화면

// ── 기도 음성 입력 ────────────────────────────────────
// ★ 암송과 동일한 엔진으로 통일: 녹음(MediaRecorder) → Groq Whisper(클라우드) 전사 → 폴백 브라우저 Whisper
let prayerRec=null, prayerChunks=[], prayerRecording=false, prayerStream=null;
let prayerStartTime=0, prayerTimeoutId=null;
const PRAYER_MAX_DURATION=90000; // 1분 30초

function switchPrayerTab(tab){
  const textPanel=document.getElementById('prayerTextPanel');
  const voicePanel=document.getElementById('prayerVoicePanel');
  const btnText=document.getElementById('prayerTabText');
  const btnVoice=document.getElementById('prayerTabVoice');

  if(tab==='text'){
    textPanel.style.display='block';
    voicePanel.style.display='none';
    btnText.style.background='var(--accent)';
    btnText.style.color='#fff';
    btnVoice.style.background='var(--surface)';
    btnVoice.style.color='var(--text)';
    if(prayerRecording) stopPrayerMic();
  }else{
    textPanel.style.display='none';
    voicePanel.style.display='block';
    btnText.style.background='var(--surface)';
    btnText.style.color='var(--text)';
    btnVoice.style.background='var(--accent)';
    btnVoice.style.color='#fff';
  }
}

function togglePrayerMic(){
  if(prayerRecording) stopPrayerMic();
  else startPrayerMic();
}

// Blob → base64 (data URL 접두사 제거) — groq-asr.js와 동일
function _prayerBlobToB64(blob){
  return new Promise((resolve, reject)=>{
    const fr=new FileReader();
    fr.onload=()=>{ const s=String(fr.result||''); resolve(s.slice(s.indexOf(',')+1)); };
    fr.onerror=reject;
    fr.readAsDataURL(blob);
  });
}

function _prayerResetMicUI(){
  if(prayerTimeoutId){ clearInterval(prayerTimeoutId); prayerTimeoutId=null; }
  const btn=document.getElementById('prayerMicBtn');
  if(btn){ btn.classList.remove('rec'); btn.textContent='🎤'; }
  const tl=document.getElementById('prayerTimeLeft'); if(tl) tl.textContent='1:30';
}

async function startPrayerMic(){
  // 마이크 스트림 확보 (TWA/폰 환경)
  if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)){
    toast('이 기기에서는 음성 입력을 지원하지 않습니다'); return;
  }
  try { prayerStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch(err){
    console.error('[PRAYER-VOICE] 마이크 권한 오류:', err);
    toast('마이크 권한을 허용해주세요 (설정 > 권한 > 마이크)');
    return;
  }

  prayerChunks=[];
  let mime='';
  ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'].some(m=>{
    if(window.MediaRecorder && MediaRecorder.isTypeSupported(m)){ mime=m; return true; } return false;
  });
  try { prayerRec = mime ? new MediaRecorder(prayerStream, { mimeType: mime }) : new MediaRecorder(prayerStream); }
  catch(e){ prayerRec = new MediaRecorder(prayerStream); }

  prayerRec.ondataavailable = e => { if(e.data && e.data.size) prayerChunks.push(e.data); };
  prayerRec.onstop = async () => {
    prayerRecording=false;
    try { if(prayerStream) prayerStream.getTracks().forEach(t=>t.stop()); } catch(e){}
    prayerStream=null;
    _prayerResetMicUI();

    const blob=new Blob(prayerChunks, { type:(prayerRec&&prayerRec.mimeType)||mime||'audio/webm' });
    if(!blob.size){ toast('녹음이 비어 있습니다 — 다시 시도하세요'); document.getElementById('prayerMicHint').textContent='탭하여 기도 녹음 시작'; return; }
    const mt=(prayerRec&&prayerRec.mimeType)||mime||'audio/webm';

    let text='';
    // 1차: Groq(클라우드) Whisper — 암송과 동일 엔진
    const hint=document.getElementById('prayerMicHint'); if(hint) hint.textContent='☁️ 음성 인식 중...';
    if(window.PAT_DB && PAT_DB.ready && PAT_DB.ready() && PAT_DB.transcribeAudio){
      try { const b64=await _prayerBlobToB64(blob); text=await PAT_DB.transcribeAudio(b64, mt, 'ko'); }
      catch(err){ console.warn('[PRAYER-ASR] Groq 실패 → Whisper 폴백:', err && err.message); }
    }
    // 2차(폴백): 브라우저 Whisper (whisper-asr.js의 transcribeBlob)
    if(!text && typeof transcribeBlob==='function'){
      if(hint) hint.textContent='🧠 음성 변환 중...';
      try { text=await transcribeBlob(blob); }
      catch(err){ console.error('[PRAYER-ASR] 폴백 실패:', err); }
    }
    if(hint) hint.textContent='탭하여 기도 녹음 시작';

    if(text){
      const textEl=document.getElementById('prayerText');
      const cur=textEl.value.trim();
      textEl.value=((cur?cur+'\n\n':'')+text).slice(0,300);
      updatePrayerTextLength();
      const rec=document.getElementById('prayerRecognized'); if(rec) rec.textContent='';
      switchPrayerTab('text');
      toast('🎤 음성 입력 완료');
    } else {
      const rec=document.getElementById('prayerRecognized'); if(rec) rec.textContent='';
      toast('음성이 인식되지 않았습니다 — 다시 시도하세요');
    }
  };

  try { prayerRec.start(); }
  catch(e){ toast('녹음을 시작할 수 없습니다'); try{ prayerStream.getTracks().forEach(t=>t.stop()); }catch(_){} prayerStream=null; return; }

  prayerRecording=true;
  prayerStartTime=Date.now();
  document.getElementById('prayerMicBtn').classList.add('rec');
  document.getElementById('prayerMicBtn').textContent='⏹️';
  document.getElementById('prayerMicHint').textContent='기도 중... 탭하여 종료';
  const rec=document.getElementById('prayerRecognized'); if(rec) rec.textContent='🎙️ 녹음 중... 끝나면 종료를 누르면 자동으로 인식됩니다';

  // 90초 제한 타이머
  prayerTimeoutId=setInterval(()=>{
    const remaining=Math.max(0, PRAYER_MAX_DURATION-(Date.now()-prayerStartTime));
    const min=Math.floor(remaining/60000);
    const sec=Math.floor((remaining%60000)/1000);
    const tl=document.getElementById('prayerTimeLeft'); if(tl) tl.textContent=min+':'+(sec<10?'0':'')+sec;
    if(remaining<=0){ toast('1분 30초 제한에 도달했습니다'); stopPrayerMic(); }
  }, 100);
}

function stopPrayerMic(){
  if(!prayerRecording) return;
  // 타이머 정지 + 버튼 즉시 복귀(전사는 onstop에서 비동기 처리)
  if(prayerTimeoutId){ clearInterval(prayerTimeoutId); prayerTimeoutId=null; }
  const btn=document.getElementById('prayerMicBtn');
  if(btn){ btn.classList.remove('rec'); btn.textContent='🎤'; }
  try { if(prayerRec && prayerRec.state!=='inactive') prayerRec.stop(); }
  catch(e){ prayerRecording=false; }
}

function updatePrayerTextLength(){
  const text=document.getElementById('prayerText').value;
  document.getElementById('prayerTextLength').textContent=text.length;
}

function prayerKey(dateStr){ return 'pat_prayer_'+dateStr; }

function loadPrayer(dateStr){
  try{ return JSON.parse(localStorage.getItem(prayerKey(dateStr))||'null'); }
  catch(e){ return null; }
}

function savePrayer(){
  const text = document.getElementById('prayerText').value.trim();
  const today = todayKey();
  const data  = { text, done: true, savedAt: Date.now() };
  localStorage.setItem(prayerKey(today), JSON.stringify(data));
  toast('🙏 기도가 저장되었습니다');
  renderPrayer();
}

function renderPrayer(){
  const today = todayKey();
  const now   = new Date();
  const days  = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];

  // 날짜 레이블
  const dateEl = document.getElementById('prayerDateLabel');
  if(dateEl) dateEl.textContent =
    (now.getMonth()+1)+'월 '+now.getDate()+'일 ('+days[now.getDay()]+')';

  // 오늘 기도 상태 로드
  const todayData = loadPrayer(today);
  const textEl    = document.getElementById('prayerText');
  const badge     = document.getElementById('prayerDoneBadge');
  const saveBtn   = document.getElementById('prayerSaveBtn');

  if(textEl && todayData){
    textEl.value = todayData.text || '';
    // 텍스트 길이 업데이트
    updatePrayerTextLength();
  }
  if(badge) badge.style.display = (todayData?.done) ? 'inline-block' : 'none';
  if(saveBtn) saveBtn.textContent = (todayData?.done) ? '🙏 기도 수정' : '🙏 기도 완료';

  // 텍스트 입력 이벤트 리스너
  if(textEl && !textEl.__eventAdded){
    textEl.addEventListener('input', updatePrayerTextLength);
    textEl.__eventAdded=true;
  }

  // 최근 7일 기도 기록
  const histEl = document.getElementById('prayerHistory');
  if(!histEl) return;

  const records = [];
  for(let i=0; i<7; i++){
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key  = d.toISOString().slice(0,10);
    const data = loadPrayer(key);
    if(data){
      const label = i===0 ? '오늘' : i===1 ? '어제' :
        (d.getMonth()+1)+'월 '+d.getDate()+'일 ('+days[d.getDay()]+')';
      records.push({ label, text: data.text, done: data.done });
    }
  }

  if(!records.length){
    histEl.innerHTML = '<p class="muted" style="text-align:center;padding:16px 0">아직 기도 기록이 없습니다 🙏</p>';
    return;
  }

  histEl.innerHTML = records.map(r => `
    <div style="padding:12px 0;border-bottom:1px solid var(--line)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:calc(var(--fs)-3px);font-weight:700;color:var(--muted)">${r.label}</span>
        <span style="font-size:calc(var(--fs)-4px);color:var(--accent)">✓ 완료</span>
      </div>
      ${r.text ? `<p style="font-size:calc(var(--fs)-2px);line-height:1.7;color:var(--text)">${esc(r.text)}</p>` : '<p class="muted" style="font-size:calc(var(--fs)-3px)">내용 없음</p>'}
    </div>
  `).join('').replace(/<div[^>]*>[\s\S]*?<\/div>\s*$/, s => s.replace('border-bottom:1px solid var(--line)','border-bottom:none'));
}
