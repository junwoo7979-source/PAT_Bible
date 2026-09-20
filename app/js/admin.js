// ====== PAT Bible — admin.js ======
// 관리자 페이지 탭 관리 (구절 등록 · 예배 · 비밀번호)

// ── 관리자 탭 전환 ────────────────────────────────────
function switchAdminTab(tabName) {
  // 모든 탭 숨기기
  document.getElementById('adminTabVerse').style.display = 'none';
  document.getElementById('adminTabPassword').style.display = 'none';
  const _worTab = document.getElementById('adminTabWorship'); if(_worTab) _worTab.style.display = 'none';

  // 모든 탭 버튼 비활성화
  document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.remove('active'));

  // 선택한 탭 표시
  // ★ 2026-09-20: '교회 정보'(church)·'시상 관리'(award)·'등록가정'(families) 탭 삭제
  const tabMap = {
    verse: 'adminTabVerse',
    worship: 'adminTabWorship',
    password: 'adminTabPassword'
  };

  const tabId = tabMap[tabName];
  const tabEl = document.getElementById(tabId);
  if (tabEl) {
    tabEl.style.display = 'block';
  }

  // 탭 제목 업데이트
  const titleMap = {
    verse: '📖 구절 등록',
    worship: '✝️ 예배',
    password: '🔑 비밀번호'
  };
  const titleEl = document.getElementById('adminTabTitle');
  if (titleEl) {
    titleEl.textContent = titleMap[tabName] || '관리';
  }

  // 선택한 버튼 활성화 (event.target이 안정적이지 않을 수 있으므로 직접 찾기)
  // ★ index.html 의 .admin-tab 버튼 순서와 1:1 대응 — 버튼 순서를 바꾸면 여기도 함께 고칠 것
  const tabButtons = {
    verse: document.querySelectorAll('.admin-tab')[0],
    worship: document.querySelectorAll('.admin-tab')[1],
    password: document.querySelectorAll('.admin-tab')[2]
  };
  const btn = tabButtons[tabName];
  if (btn) btn.classList.add('active');

  // 각 탭별 초기화 작업
  if (tabName === 'worship') {
    if (typeof loadWorshipToAdmin === 'function') loadWorshipToAdmin();
  }
}

// ★ 2026-09-20: '등록가정' 탭 삭제에 따라 renderFamiliesList() 제거.
//   서버 API(getFamiliesList)는 로그인·가족 조회에서 계속 쓰이므로 그대로 둔다.

// ★ 2026-09-20: '시상 관리' 탭 삭제에 따라 시상 전용 로직을 통째로 제거했다.
//   (개인/가족 1년 실천율 계산, 가족 순위, 가족 검색·상세, 시상 대상 생성)
//   서버 집계 API(getAwardRanking)와 functions/aggregate.js 는 그대로 두었다.

// ── ★ 2026-07-18: 관리자 본인 비밀번호 변경 ────────────────────────────────
// 최초 계정(admin/1234)은 서버(bcrypt)에 등록돼 있고, 여기서 변경하면 즉시 반영된다.
async function doAdminChangeMyPassword() {
  const oldPw = (document.getElementById('adminMyPwOld')?.value || '').trim();
  const newPw = (document.getElementById('adminMyPwNew')?.value || '').trim();
  const newPw2 = (document.getElementById('adminMyPwNew2')?.value || '').trim();
  const adminId = localStorage.getItem('pat_admin_id') || '';

  if (!adminId) { toast('관리자 로그인 정보가 없습니다. 다시 로그인하세요'); return; }
  if (!oldPw) { toast('현재 비밀번호를 입력하세요'); return; }
  if (!/^(?=.{8,}$)[^A-Za-z0-9]+[A-Za-z]+[0-9]+$/.test(newPw)) {
    toast('새 비밀번호는 특수문자 → 영문 → 숫자 순서로 8자 이상이어야 합니다 (예: #grace2026)');
    return;
  }
  if (newPw !== newPw2) { toast('새 비밀번호가 서로 일치하지 않습니다'); return; }
  if (newPw === oldPw) { toast('현재 비밀번호와 다른 비밀번호를 사용하세요'); return; }
  if (!(window.PAT_DB && PAT_DB.ready())) { toast('서버 연결이 필요합니다'); return; }

  const r = await PAT_DB.updateAdminPassword(adminId, oldPw, newPw);
  if (r && r.ok) {
    // 로컬 자격 갱신 → 이후 관리자 쓰기 요청 헤더에 새 비번 사용
    try {
      localStorage.setItem('pat_admin_pw', newPw);
      localStorage.removeItem('pat_admin_token'); // 레거시 전역 토큰 완전 폐기
    } catch (e) {}
    ['adminMyPwOld', 'adminMyPwNew', 'adminMyPwNew2'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    toast('✓ 관리자 비밀번호가 변경되었습니다');
    return;
  }
  toast((r && r.error) || '비밀번호 변경에 실패했습니다');
}
