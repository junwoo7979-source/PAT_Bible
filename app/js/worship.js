// ====== PAT Bible — worship.js (v127) ======
// ✝️ 예배 안내: 관리자가 입력 → 전 성도의 "예배" 메뉴에 실시간 표시.
//   데이터는 교회 config.worship = { title, content } 에 저장(교회 공통).

// HTML 이스케이프 (esc 전역 함수가 있으면 사용, 없으면 자체 폴백)
function _worEsc(s){
  if (typeof esc === 'function') return esc(s);
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// 성도 화면 렌더 ─────────────────────────────────────────────
function renderWorship(){
  const nameEl = document.getElementById('worshipChurchName');
  if (nameEl) nameEl.textContent = (window.DB && DB.church && DB.church.name) ? DB.church.name : '';

  const box = document.getElementById('worshipContent');
  if (!box) return;

  const w = (window.DB && DB.worship) ? DB.worship : null;
  const hasContent = w && ((w.title && w.title.trim()) || (w.content && w.content.trim()));

  if (!hasContent){
    box.innerHTML =
      '<div class="card" style="text-align:center;padding:28px 16px">' +
      '<div style="font-size:34px;margin-bottom:8px">✝️</div>' +
      '<p class="muted">등록된 예배 안내가 없습니다</p>' +
      '<p class="muted" style="font-size:calc(var(--fs) - 3px);margin-top:4px">교회 관리자가 예배 안내를 등록하면 여기에 표시됩니다</p>' +
      '</div>';
    return;
  }

  const title = w.title ? w.title.trim() : '';
  const content = w.content ? w.content.trim() : '';
  const contentHtml = _worEsc(content).replace(/\n/g, '<br>');

  box.innerHTML =
    '<div class="card">' +
      (title ? '<h2 style="color:var(--accent);margin-bottom:10px">' + _worEsc(title) + '</h2>' : '') +
      '<div style="line-height:1.9;font-size:var(--fs)">' + contentHtml + '</div>' +
    '</div>';
}

// 관리자: 현재 예배 안내를 입력창에 로드 ───────────────────────
function loadWorshipToAdmin(){
  const w = (window.DB && DB.worship) ? DB.worship : null;
  const t = document.getElementById('inWorshipTitle');
  const c = document.getElementById('inWorshipContent');
  if (t) t.value = w && w.title ? w.title : '';
  if (c) c.value = w && w.content ? w.content : '';
}

// 관리자: 예배 안내 등록(저장) ─────────────────────────────────
async function registerWorship(){
  const title = (document.getElementById('inWorshipTitle').value || '').trim();
  const content = (document.getElementById('inWorshipContent').value || '').trim();
  if (!title && !content){ toast('예배 제목이나 내용을 입력하세요'); return; }

  const worship = { title, content };
  DB.worship = worship;
  try { localStorage.setItem('pat_worship', JSON.stringify(worship)); } catch(e){}

  if (window.PAT_DB && PAT_DB.ready() && PAT_DB.saveWorship && DB.church && DB.church.code){
    const ok = await PAT_DB.saveWorship(DB.church.code, worship);
    if (ok) toast('✅ 예배 안내 저장됨! 전 성도에게 동기화됩니다');
    else toast('⚠️ 로컬 저장만 완료 (클라우드 동기화 실패 — 관리자 토큰 확인)');
  } else {
    toast('✓ 예배 안내 등록 완료 (로컬 모드)');
  }
}

// 관리자: 예배 안내 지우기 ─────────────────────────────────────
async function clearWorship(){
  DB.worship = null;
  try { localStorage.setItem('pat_worship', 'null'); } catch(e){}
  const t = document.getElementById('inWorshipTitle'); if (t) t.value = '';
  const c = document.getElementById('inWorshipContent'); if (c) c.value = '';

  if (window.PAT_DB && PAT_DB.ready() && PAT_DB.saveWorship && DB.church && DB.church.code){
    const ok = await PAT_DB.saveWorship(DB.church.code, null);
    if (ok) toast('🗑️ 예배 안내를 지웠습니다');
    else toast('⚠️ 로컬만 지움 (클라우드 동기화 실패)');
  } else {
    toast('🗑️ 예배 안내를 지웠습니다 (로컬)');
  }
}
