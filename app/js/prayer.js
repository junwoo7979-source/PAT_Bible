// ====== PAT Bible — prayer.js ======
// 기도 기록 화면

// ── 기도 음성 입력 ────────────────────────────────────
// ★ 암송 마이크와 100% 동일: 녹음(MediaRecorder, 정지 누를 때까지) → Groq Whisper large-v3 전사.
//   내장 SpeechRecognition은 안드로이드에서 무음 시 자동 종료(마이크 꺼짐) 문제가 있어 사용하지 않는다.
//   (깨짐의 원인이던 소형 whisper-base 폴백도 사용하지 않음 — 실패 시 안내 후 텍스트 입력 권장)
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

// ── 녹음 → Groq Whisper large-v3 (암송 마이크와 동일 방식) ──
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
    // Groq(클라우드) Whisper — 고품질 한국어 전사
    //   ※ 소형 whisper-base 폴백은 기도 자유 발화에서 환각으로 깨지므로 사용하지 않는다.
    const hint=document.getElementById('prayerMicHint'); if(hint) hint.textContent='☁️ 음성 인식 중...';
    if(window.PAT_DB && PAT_DB.ready && PAT_DB.ready() && PAT_DB.transcribeAudio){
      try { const b64=await _prayerBlobToB64(blob); text=await PAT_DB.transcribeAudio(b64, mt, 'ko'); }
      catch(err){ console.warn('[PRAYER-ASR] Groq 실패:', err && err.message); }
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
  // 녹음 종료 (전사는 onstop에서 비동기 처리)
  if(!prayerRecording) return;
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

// ── 가족 기도 나눔 (당일 공유) ──────────────────────────────────
// 데이터 모델: localStorage 'pat_fprayer_{familyId}_{date}' = { [memberName]: { text, savedAt } }
// Firebase 동기화: PAT_DB.savePrayer / PAT_DB.getPrayers (다른 폰의 가족도 열람 가능)

function prayerKey(dateStr){ return 'pat_prayer_'+dateStr; } // (기존 개인 기도 호환용)

function _prayerFamilyProfile(){
  try { return JSON.parse(localStorage.getItem('pat_family_profile')||'null'); }
  catch(e){ return null; }
}
function _prayerFamilyId(){
  try { return localStorage.getItem('pat_family_id')||''; } catch(e){ return ''; }
}
function _prayerChurchCode(){
  try { return localStorage.getItem('pat_church_code') || (window.DB && DB.church && DB.church.code) || ''; }
  catch(e){ return ''; }
}
function currentPrayerMember(){
  const p=_prayerFamilyProfile();
  return (p && (p.memberName || p.leaderName)) || '';
}
function prayerMemberList(){
  const p=_prayerFamilyProfile();
  let names=[];
  if(p && Array.isArray(p.members)){
    names = p.members
      .map(m => (typeof m==='string') ? m : (m && (m.displayName || m.name)) || '')
      .map(s => String(s).trim())
      .filter(Boolean);
  }
  const me=currentPrayerMember();
  if(me && !names.includes(me)) names=[me, ...names];
  return [...new Set(names)];
}

function fprayerKey(dateStr){ return 'pat_fprayer_'+_prayerFamilyId()+'_'+dateStr; }
function loadFamilyPrayers(dateStr){
  try { return JSON.parse(localStorage.getItem(fprayerKey(dateStr))||'{}'); }
  catch(e){ return {}; }
}
function storeFamilyPrayers(dateStr, board){
  try { localStorage.setItem(fprayerKey(dateStr), JSON.stringify(board)); } catch(e){}
}

async function savePrayer(){
  const text  = document.getElementById('prayerText').value.trim();
  const today = todayKey();
  const me    = currentPrayerMember();
  if(!me){ toast('가족 정보를 찾을 수 없습니다 — 다시 로그인 해주세요'); return; }

  // 1) 로컬 즉시 반영
  const board = loadFamilyPrayers(today);
  if(text) board[me] = { text, savedAt: Date.now() };
  else delete board[me];
  storeFamilyPrayers(today, board);
  // 개인 기도 호환 키도 함께 보존 (기존 동작 유지)
  localStorage.setItem(prayerKey(today), JSON.stringify({ text, done: !!text, savedAt: Date.now() }));

  toast(text ? '🙏 기도가 저장되었습니다' : '기도를 비웠습니다');
  renderPrayer();

  // 2) Firebase 동기화 — 가족이 서로 볼 수 있도록
  if(window.PAT_DB && PAT_DB.ready && PAT_DB.ready() && PAT_DB.savePrayer){
    try {
      await PAT_DB.savePrayer(_prayerChurchCode(), { date: today, memberName: me, text });
      renderPrayer();
    } catch(e){ console.warn('[PRAYER] 동기화 실패:', e && e.message); }
  }
}

function renderPrayerChips(board){
  const el=document.getElementById('prayerMemberChips');
  if(!el) return;
  const members=prayerMemberList();
  const me=currentPrayerMember();
  if(!members.length){ el.innerHTML=''; el.style.display='none'; return; }
  el.style.display='flex';
  el.innerHTML = members.map(n=>{
    const prayed = board[n] && board[n].text;
    const isMe   = n===me;
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:20px;`
      + `font-size:calc(var(--fs)-3px);font-weight:700;white-space:nowrap;`
      + `background:${isMe?'var(--accent)':'var(--surface)'};color:${isMe?'#04231a':'var(--text)'};`
      + `border:1px solid ${isMe?'var(--accent)':'var(--line)'}">`
      + `${prayed?'🙏':'<span style=\"opacity:.4\">○</span>'} ${esc(n)}${isMe?' (나)':''}</span>`;
  }).join('');
}

function renderPrayerFeed(board){
  const el=document.getElementById('prayerHistory');
  if(!el) return;
  const entries=Object.keys(board)
    .map(n=>({ name:n, text:(board[n]&&board[n].text)||'', savedAt:(board[n]&&board[n].savedAt)||0 }))
    .filter(e=>e.text)
    .sort((a,b)=> b.savedAt - a.savedAt);

  if(!entries.length){
    el.innerHTML='<p class="muted" style="text-align:center;padding:16px 0">오늘 가족의 기도가 아직 없어요 🙏</p>';
    return;
  }
  const me=currentPrayerMember();
  el.innerHTML = entries.map(e=>{
    const t=e.savedAt ? new Date(e.savedAt) : null;
    const time = t ? ((t.getHours()<12?'오전':'오후')+' '+(((t.getHours()%12)||12))+':'+String(t.getMinutes()).padStart(2,'0')) : '';
    const mine = e.name===me;
    return `<div style="padding:12px 0;border-bottom:1px solid var(--line)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:calc(var(--fs)-2px);font-weight:700;color:var(--text)">🙏 ${esc(e.name)}님의 기도${mine?' <span style=\"color:var(--accent);font-size:calc(var(--fs)-4px)\">· 나</span>':''}</span>
        <span style="font-size:calc(var(--fs)-4px);color:var(--muted)">${time}</span>
      </div>
      <p style="font-size:calc(var(--fs)-2px);line-height:1.7;color:var(--text)">${esc(e.text)}</p>
    </div>`;
  }).join('').replace(/<div([^>]*)>([\s\S]*?)<\/div>\s*$/, (m)=> m.replace('border-bottom:1px solid var(--line)','border-bottom:none'));
}

// ★ 앱을 켜둔 채 자정을 넘기면 어제 기도가 남아 보이지 않도록,
//   날짜가 바뀌면 기도 화면(활성 상태)을 자동으로 다시 그린다.
let _prayerDayWatch = null, _prayerWatchDay = '';
function _ensurePrayerDayWatch(){
  if(_prayerDayWatch) return;
  _prayerDayWatch = setInterval(()=>{
    const d = (typeof todayKey==='function') ? todayKey() : '';
    if(!d) return;
    if(_prayerWatchDay && d !== _prayerWatchDay){
      _prayerWatchDay = d;
      const sc = document.getElementById('s-prayer');
      if(sc && sc.classList.contains('active')) renderPrayer();
    } else {
      _prayerWatchDay = d;
    }
  }, 30000);
}

function renderPrayer(){
  const today = todayKey();
  _prayerWatchDay = today;
  _ensurePrayerDayWatch();
  const now   = new Date();
  const days  = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];

  // 날짜 레이블
  const dateEl = document.getElementById('prayerDateLabel');
  if(dateEl) dateEl.textContent =
    (now.getMonth()+1)+'월 '+now.getDate()+'일 ('+days[now.getDay()]+')';

  const me      = currentPrayerMember();
  const board   = loadFamilyPrayers(today);
  const mine    = board[me];
  const textEl  = document.getElementById('prayerText');
  const badge   = document.getElementById('prayerDoneBadge');
  const saveBtn = document.getElementById('prayerSaveBtn');
  const selfEl  = document.getElementById('prayerMemberSelf');

  if(selfEl) selfEl.textContent = me ? (me+'님의 오늘 기도') : '오늘의 기도';

  // 본인 기도 입력칸 채우기 (사용자가 입력 중이 아니면)
  if(textEl && document.activeElement!==textEl){
    textEl.value = (mine && mine.text) || '';
    if(typeof updatePrayerTextLength==='function') updatePrayerTextLength();
  }
  if(badge)   badge.style.display = (mine && mine.text) ? 'inline-block' : 'none';
  if(saveBtn) saveBtn.textContent = (mine && mine.text) ? '🙏 기도 수정' : '🙏 기도 완료';

  if(textEl && !textEl.__eventAdded){
    textEl.addEventListener('input', updatePrayerTextLength);
    textEl.__eventAdded=true;
  }

  // 로컬 데이터로 즉시 렌더
  renderPrayerChips(board);
  renderPrayerFeed(board);

  // Firebase에서 가족 전체 기도 병합 (다른 폰의 가족 포함)
  if(window.PAT_DB && PAT_DB.ready && PAT_DB.ready() && PAT_DB.getPrayers){
    PAT_DB.getPrayers(_prayerChurchCode(), today).then(res=>{
      if(!res || !Array.isArray(res.prayers)) return;
      const merged = loadFamilyPrayers(today);
      res.prayers.forEach(p=>{
        if(p.memberName) merged[p.memberName] = { text: p.text||'', savedAt: p.updatedAt||0 };
      });
      storeFamilyPrayers(today, merged);
      renderPrayerChips(merged);
      renderPrayerFeed(merged);
      // 본인 기도칸도 서버값으로 보정 (입력 중이 아니면)
      const tEl=document.getElementById('prayerText');
      if(tEl && document.activeElement!==tEl){
        const mn=merged[me];
        tEl.value=(mn && mn.text) || '';
        if(typeof updatePrayerTextLength==='function') updatePrayerTextLength();
        const b=document.getElementById('prayerDoneBadge');
        const sb=document.getElementById('prayerSaveBtn');
        if(b)  b.style.display=(mn && mn.text)?'inline-block':'none';
        if(sb) sb.textContent=(mn && mn.text)?'🙏 기도 수정':'🙏 기도 완료';
      }
    }).catch(()=>{});
  }
}
