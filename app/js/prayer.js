// ====== PAT Bible — prayer.js ======
// 기도 기록 화면

// ── 기도 음성 입력 ────────────────────────────────────
let prayerRecog=null, prayerRecognizing=false, prayerRecognizedText='';
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
    if(prayerRecognizing) stopPrayerMic();
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
  if(prayerRecognizing) stopPrayerMic();
  else startPrayerMic();
}

function startPrayerMic(){
  const SR=window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){
    toast('음성 인식을 지원하지 않습니다');
    return;
  }

  prayerRecog=new SR();
  prayerRecog.lang='ko-KR';
  prayerRecog.interimResults=true;
  prayerRecognizing=true;
  prayerRecognizedText='';
  prayerStartTime=Date.now();

  document.getElementById('prayerMicBtn').classList.add('rec');
  document.getElementById('prayerMicBtn').textContent='⏹️';
  document.getElementById('prayerMicHint').textContent='기도 중... 탭하여 종료';
  document.getElementById('prayerRecognized').textContent='';

  // 시간 업데이트
  prayerTimeoutId=setInterval(()=>{
    const elapsed=Date.now()-prayerStartTime;
    const remaining=Math.max(0, PRAYER_MAX_DURATION-elapsed);
    const min=Math.floor(remaining/60000);
    const sec=Math.floor((remaining%60000)/1000);
    document.getElementById('prayerTimeLeft').textContent=min+':'+(sec<10?'0':'')+sec;

    if(remaining<=0){
      toast('1분 30초 제한에 도달했습니다');
      stopPrayerMic();
    }
  }, 100);

  prayerRecog.onstart=()=>{
    console.log('[PRAYER-VOICE] started');
  };

  prayerRecog.onresult=(e)=>{
    let interim='';
    for(let i=0;i<e.results.length;i++){
      const transcript=e.results[i][0].transcript.trim();
      if(e.results[i].isFinal){
        prayerRecognizedText+=(prayerRecognizedText?' ':'')+transcript;
      }else{
        interim=transcript;
      }
    }
    const display=prayerRecognizedText+(interim?' '+interim:'');
    document.getElementById('prayerRecognized').textContent=display.slice(0,300);
    document.getElementById('prayerVoiceLength').textContent=display.length;
  };

  prayerRecog.onend=()=>{
    console.log('[PRAYER-VOICE] ended');
  };

  prayerRecog.onerror=(e)=>{
    console.log('[PRAYER-VOICE] error:', e.error);
    toast('음성 인식 오류');
    stopPrayerMic();
  };

  prayerRecog.start();
}

function stopPrayerMic(){
  if(!prayerRecognizing) return;
  prayerRecognizing=false;

  if(prayerRecog){
    try{ prayerRecog.abort(); }catch(e){}
    prayerRecog=null;
  }

  if(prayerTimeoutId){
    clearInterval(prayerTimeoutId);
    prayerTimeoutId=null;
  }

  const btn=document.getElementById('prayerMicBtn');
  btn.classList.remove('rec');
  btn.textContent='🎤';
  document.getElementById('prayerMicHint').textContent='탭하여 기도 녹음 시작';
  document.getElementById('prayerTimeLeft').textContent='1:30';

  // 음성 인식 결과를 텍스트 입력란에 추가
  if(prayerRecognizedText){
    const textEl=document.getElementById('prayerText');
    const currentText=textEl.value.trim();
    const newText=(currentText?(currentText+'\n\n'):'')+prayerRecognizedText.slice(0,300);
    textEl.value=newText.slice(0,300);
    updatePrayerTextLength();
    switchPrayerTab('text');
    toast('🎤 음성 입력 완료');
  }
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
