// ====== PAT Bible — prayer.js ======
// 기도 기록 화면

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
  }
  if(badge) badge.style.display = (todayData?.done) ? 'inline-block' : 'none';
  if(saveBtn) saveBtn.textContent = (todayData?.done) ? '🙏 기도 수정' : '🙏 기도 완료';

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
