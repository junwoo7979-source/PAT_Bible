// ====== PAT Bible — worship.js (v130) ======
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
  const _DB = (typeof DB !== 'undefined') ? DB : null;
  const nameEl = document.getElementById('worshipChurchName');
  if (nameEl) nameEl.textContent = (_DB && _DB.church && _DB.church.name) ? _DB.church.name : '';

  const box = document.getElementById('worshipContent');
  if (!box) return;

  const w = (_DB && _DB.worship) ? _DB.worship : null;
  const hasContent = w && ((w.title && w.title.trim()) || (w.content && w.content.trim()));

  if (!hasContent){
    box.innerHTML =
      '<div class="card" style="text-align:center;padding:28px 16px">' +
      '<div style="font-size:34px;margin-bottom:8px">✝️</div>' +
      '<p class="muted">등록된 예배 안내가 없습니다</p>' +
      '<p class="muted" style="font-size:calc(var(--fs) - 3px);margin-top:4px">교회 관리자가 예배 안내를 등록하면 여기에 표시됩니다</p>' +
      '</div>';
    const _extra0 = document.getElementById('worshipExtra'); if (_extra0) _extra0.innerHTML = '';
    return;
  }

  const title = w.title ? w.title.trim() : '';
  const content = w.content ? w.content.trim() : '';
  const contentHtml = _worEsc(content).replace(/\n/g, '<br>');

  box.innerHTML =
    '<div class="card">' +
      (title ? '<h2 style="color:var(--accent);margin-bottom:10px">' + _worEsc(title) + '</h2>' : '') +
      '<div style="background:rgba(120,120,120,0.12);border:1px solid var(--line);' +
        'border-radius:12px;padding:16px 16px;line-height:1.95;font-size:var(--fs);' +
        'font-weight:700;color:var(--text)">' + contentHtml + '</div>' +
    '</div>';

  // 예배 본문 아래: 찬송가·성경 본문(대한성서공회 API 연동 예정) 렌더
  renderWorshipExtra(content);
}

// ══════════════════════════════════════════════════════════════
// 찬송가 · 성경 본문 자동 표시 (대한성서공회 API 연동 준비)
// ──────────────────────────────────────────────────────────────
// enabled=false 인 동안엔 "연동 예정" 안내 + 감지된 참조만 표시.
// API 승인/연동 시: BIBLE_API.enabled=true 로 바꾸고 아래 fetchHymn/
//   fetchPassage 두 함수 안의 TODO만 채우면 찬송가·본문이 자동 표시됨.
// ══════════════════════════════════════════════════════════════
const BIBLE_API = {
  enabled: false,                 // ← 대한성서공회 API 연동되면 true 로
  version: 'GAE',                 // 개역개정(예시) — 승인된 역본 코드로 교체
  // endpoint/key 등은 서버 프록시(Functions)로 두는 것을 권장(키 노출 방지)
  passageProxy: '',               // 예: '.../getBiblePassage'
  hymnProxy: ''                   // 예: '.../getHymn'
};

// 예배 안내 본문에서 찬송가 번호 · 성경 본문 참조를 추출
function parseWorshipRefs(content){
  const text = String(content || '');
  const hymns = [];
  const passages = [];

  // 찬송가: "찬송가 425 장", "새찬송가 425장", "찬 425장" 등
  const hymnRe = /(?:새)?찬(?:송가)?\s*제?\s*(\d{1,3})\s*장?/g;
  let m;
  while ((m = hymnRe.exec(text)) !== null){
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 700 && hymns.indexOf(n) === -1) hymns.push(n);
  }

  // 성경 본문: "말씀/본문/성경 : 고린도전서 15장 50~58" 형태의 줄에서 참조 추출
  text.split(/\n/).forEach(line => {
    const mm = line.match(/(?:말씀|본문|성경|봉독)\s*[:：]?\s*(.+)$/);
    if (mm && mm[1]){
      const ref = mm[1].trim();
      if (ref && passages.indexOf(ref) === -1) passages.push(ref);
    }
  });

  return { hymns, passages };
}

// 성도 화면: 예배 본문 아래 찬송가·본문 섹션
function renderWorshipExtra(content){
  const box = document.getElementById('worshipExtra');
  if (!box) return;

  const refs = parseWorshipRefs(content);
  if (!refs.hymns.length && !refs.passages.length){ box.innerHTML = ''; return; }

  const chip = (t) =>
    '<span style="display:inline-block;background:rgba(120,120,120,0.15);border:1px solid var(--line);' +
    'border-radius:999px;padding:4px 12px;margin:3px 4px 0 0;font-size:calc(var(--fs) - 2px);font-weight:700">' +
    _worEsc(t) + '</span>';

  if (!BIBLE_API.enabled){
    // 연동 예정 안내 + 감지된 참조 미리보기
    let html = '<div class="card" style="margin-top:12px">' +
      '<h2 style="margin-bottom:6px">📖 찬송가 · 본문</h2>' +
      '<p class="muted" style="font-size:calc(var(--fs) - 3px);margin-bottom:10px">' +
      '🔌 대한성서공회 API가 연동되면 아래 항목의 <b>찬송가 가사</b>와 <b>성경 본문</b>이 자동으로 표시됩니다.</p>';
    if (refs.hymns.length){
      html += '<div style="margin-bottom:8px"><b style="font-size:calc(var(--fs) - 1px)">🎵 찬송가</b><br>' +
        refs.hymns.map(n => chip(n + '장')).join('') + '</div>';
    }
    if (refs.passages.length){
      html += '<div><b style="font-size:calc(var(--fs) - 1px)">📕 본문</b><br>' +
        refs.passages.map(p => chip(p)).join('') + '</div>';
    }
    html += '</div>';
    box.innerHTML = html;
    return;
  }

  // ── API 연동 시: 로딩 스켈레톤 먼저 표시 후 비동기 로드 ──
  let html = '<div class="card" style="margin-top:12px"><h2 style="margin-bottom:10px">📖 찬송가 · 본문</h2>';
  refs.hymns.forEach((n, i) => {
    html += '<div id="wHymn' + i + '" style="margin-bottom:12px">' +
      '<b style="color:var(--accent)">🎵 찬송가 ' + n + '장</b>' +
      '<div class="muted" style="margin-top:4px">불러오는 중…</div></div>';
  });
  refs.passages.forEach((p, i) => {
    html += '<div id="wPass' + i + '" style="margin-bottom:12px">' +
      '<b style="color:var(--accent)">📕 ' + _worEsc(p) + '</b>' +
      '<div class="muted" style="margin-top:4px">불러오는 중…</div></div>';
  });
  html += '</div>';
  box.innerHTML = html;
  loadWorshipScripture(refs);
}

// API 연동 시 실제 데이터 채우기
async function loadWorshipScripture(refs){
  for (let i = 0; i < refs.hymns.length; i++){
    const el = document.getElementById('wHymn' + i);
    if (!el) continue;
    const body = el.querySelector('div');
    try {
      const data = await fetchHymn(refs.hymns[i]);
      body.className = '';
      body.style.cssText = 'margin-top:6px;line-height:1.9;white-space:pre-wrap';
      body.innerHTML = data ? _worEsc(data).replace(/\n/g,'<br>') : '<span class="muted">가사를 불러올 수 없습니다</span>';
    } catch(e){ body.innerHTML = '<span class="muted">불러오기 실패</span>'; }
  }
  for (let i = 0; i < refs.passages.length; i++){
    const el = document.getElementById('wPass' + i);
    if (!el) continue;
    const body = el.querySelector('div');
    try {
      const data = await fetchPassage(refs.passages[i]);
      body.className = '';
      body.style.cssText = 'margin-top:6px;line-height:1.95;background:rgba(120,120,120,0.10);border:1px solid var(--line);border-radius:10px;padding:12px';
      body.innerHTML = data ? _worEsc(data).replace(/\n/g,'<br>') : '<span class="muted">본문을 불러올 수 없습니다</span>';
    } catch(e){ body.innerHTML = '<span class="muted">불러오기 실패</span>'; }
  }
}

// ── 대한성서공회 API 어댑터 (연동 시 이 두 함수만 구현) ──────────
// 반환: 성공 시 텍스트(문자열), 실패/미연동 시 null
async function fetchHymn(number){
  if (!BIBLE_API.enabled || !BIBLE_API.hymnProxy) return null;
  // TODO(대한성서공회 API): 찬송가 number 가사 조회
  //   const r = await fetch(BIBLE_API.hymnProxy + '?no=' + number);
  //   const j = await r.json(); return j.lyrics || null;
  return null;
}
async function fetchPassage(ref){
  if (!BIBLE_API.enabled || !BIBLE_API.passageProxy) return null;
  // TODO(대한성서공회 API): 성경 본문 ref(예: "고린도전서 15장 50~58") 조회
  //   const r = await fetch(BIBLE_API.passageProxy + '?ref=' + encodeURIComponent(ref) + '&ver=' + BIBLE_API.version);
  //   const j = await r.json(); return j.text || null;
  return null;
}

// 관리자: 현재 예배 안내를 입력창에 로드 ───────────────────────
function loadWorshipToAdmin(){
  const w = (typeof DB !== 'undefined' && DB.worship) ? DB.worship : null;
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
