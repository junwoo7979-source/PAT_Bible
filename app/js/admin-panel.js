// ====== PAT Bible — admin-panel.js ======
// 플랫폼 관리자 대시보드 + 회원관리 화면 로직.
// ★ 기존 교회 관리자(s-admin)와 완전히 분리된 별도 화면(s-admin-dashboard / s-admin-users).
// ★ 모든 데이터는 보호된 Cloud Functions(listUsers/getUser/updateUserStatus)로만 가져오며,
//   매 요청 Firebase ID 토큰(Authorization: Bearer)을 실어 서버가 admin claim을 재검증한다.

(function () {
  'use strict';

  var _users = [];       // 마지막으로 불러온 회원 목록(원본)
  var _adminEmail = '';  // 현재 로그인 관리자 이메일

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function fmtDate(iso) {
    if (!iso) return '-';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '-';
      return d.getFullYear() + '.' +
        String(d.getMonth() + 1).padStart(2, '0') + '.' +
        String(d.getDate()).padStart(2, '0');
    } catch (e) { return '-'; }
  }

  // 보호 API 호출 — ID 토큰을 Bearer로 실어 Functions 호출
  async function adminApi(pathAndQuery, opts) {
    opts = opts || {};
    var base = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiBase) || '';
    if (!window.PAT_ADMIN_AUTH) throw new Error('AUTH_UNAVAILABLE');
    var token = await window.PAT_ADMIN_AUTH.getIdToken();
    if (!token) throw new Error('NO_TOKEN');
    var headers = { 'Authorization': 'Bearer ' + token };
    if (opts.body) headers['Content-Type'] = 'application/json';
    var res = await fetch(base + pathAndQuery, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data && data.error ? data.error : ('HTTP_' + res.status));
    return data;
  }

  // ── 대시보드 ──────────────────────────────────────────────
  async function renderAdminDashboard() {
    // 현재 관리자 이메일 표시
    try {
      if (window.PAT_ADMIN_AUTH) {
        var st = await window.PAT_ADMIN_AUTH.requireAdmin();
        _adminEmail = (st && st.email) || '';
      }
    } catch (e) {}
    var who = document.getElementById('adminWhoami');
    if (who) who.textContent = _adminEmail || '관리자';

    var statEl = document.getElementById('adminStats');
    if (statEl) statEl.innerHTML = '<p class="muted center" style="padding:20px 0">불러오는 중…</p>';

    try {
      var data = await adminApi('/listUsers?limit=200');
      _users = (data && data.users) || [];
      var total = _users.length;
      var active = _users.filter(function (u) { return (u.status || 'active') === 'active'; }).length;
      var suspended = _users.filter(function (u) { return u.status === 'suspended'; }).length;
      var verified = _users.filter(function (u) { return u.emailVerified; }).length;

      if (statEl) {
        statEl.innerHTML =
          statCard('전체 회원', total, 'var(--accent)') +
          statCard('활성', active, 'var(--accent)') +
          statCard('정지', suspended, 'var(--danger)') +
          statCard('이메일 인증', verified, 'var(--muted)');
      }
    } catch (e) {
      if (statEl) statEl.innerHTML = errorBox(e.message);
    }
  }

  function statCard(label, value, color) {
    return '<div class="admin-stat">' +
      '<div class="admin-stat-num" style="color:' + color + '">' + value + '</div>' +
      '<div class="admin-stat-label">' + esc(label) + '</div></div>';
  }

  function errorBox(code) {
    var msg = friendlyError(code);
    return '<div style="padding:16px;border:1px solid var(--danger);border-radius:var(--radius);' +
      'background:var(--danger-soft-bg);color:var(--danger-soft-text)">' + esc(msg) + '</div>';
  }

  function friendlyError(code) {
    switch (code) {
      case 'NO_TOKEN':
      case 'UNAUTHENTICATED': return '세션이 만료되었습니다. 다시 로그인하세요.';
      case 'INVALID_TOKEN': return '인증이 만료되었습니다. 다시 로그인하세요.';
      case 'FORBIDDEN': return '관리자 권한이 없습니다.';
      case 'AUTH_UNAVAILABLE': return '관리자 인증이 설정되지 않았습니다.';
      case 'CANNOT_SUSPEND_SELF': return '본인 계정은 정지할 수 없습니다.';
      case 'NOT_FOUND': return '대상을 찾을 수 없습니다.';
      default: return '요청을 처리할 수 없습니다. 잠시 후 다시 시도하세요.';
    }
  }

  // ── 회원관리 ──────────────────────────────────────────────
  async function renderAdminUsers() {
    var listEl = document.getElementById('adminUsersList');
    if (listEl) listEl.innerHTML = '<p class="muted center" style="padding:24px 0">불러오는 중…</p>';
    var q = (document.getElementById('adminUserSearch') || {}).value || '';
    var status = (document.getElementById('adminUserStatusFilter') || {}).value || '';

    var qs = '/listUsers?limit=200';
    if (q.trim()) qs += '&q=' + encodeURIComponent(q.trim());
    if (status) qs += '&status=' + encodeURIComponent(status);

    try {
      var data = await adminApi(qs);
      _users = (data && data.users) || [];
      drawUsers(_users);
    } catch (e) {
      if (listEl) listEl.innerHTML = errorBox(e.message);
    }
  }

  function drawUsers(users) {
    var listEl = document.getElementById('adminUsersList');
    var countEl = document.getElementById('adminUsersCount');
    if (countEl) countEl.textContent = users.length + '명';
    if (!listEl) return;
    if (!users.length) {
      listEl.innerHTML = '<p class="muted center" style="padding:24px 0">해당하는 회원이 없습니다.</p>';
      return;
    }
    listEl.innerHTML = users.map(function (u) {
      var suspended = u.status === 'suspended';
      var badge = suspended
        ? '<span class="admin-badge admin-badge-off">정지</span>'
        : '<span class="admin-badge admin-badge-on">활성</span>';
      var verified = u.emailVerified
        ? '<span class="admin-badge admin-badge-neutral">인증</span>' : '';
      var btnLabel = suspended ? '활성화' : '정지';
      var btnClass = suspended ? 'admin-row-btn on' : 'admin-row-btn off';
      var uid = esc(u.uid || '');
      return '<div class="admin-user-row">' +
        '<div class="admin-user-info">' +
          '<div class="admin-user-name">' + esc(u.displayName || '(이름 없음)') + ' ' + badge + ' ' + verified + '</div>' +
          '<div class="admin-user-email">' + esc(u.email || '') + '</div>' +
          '<div class="admin-user-meta">가입 ' + fmtDate(u.createdAt) + ' · 최근 ' + fmtDate(u.lastLoginAt) + '</div>' +
        '</div>' +
        '<button class="' + btnClass + '" data-uid="' + uid + '" data-next="' + (suspended ? 'active' : 'suspended') + '" ' +
          'onclick="adminToggleUserStatus(this)">' + btnLabel + '</button>' +
      '</div>';
    }).join('');
  }

  // 상태 토글(정지 ↔ 활성)
  async function adminToggleUserStatus(btn) {
    if (!btn || btn.dataset.busy === '1') return;
    var uid = btn.dataset.uid;
    var next = btn.dataset.next;
    if (!uid || !next) return;
    if (next === 'suspended' && !confirm('이 회원을 정지할까요?')) return;

    btn.dataset.busy = '1';
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = '처리 중…';
    try {
      await adminApi('/updateUserStatus', { method: 'POST', body: { uid: uid, status: next } });
      if (typeof toast === 'function') toast(next === 'suspended' ? '정지되었습니다' : '활성화되었습니다');
      await renderAdminUsers(); // 목록 갱신
    } catch (e) {
      if (typeof toast === 'function') toast(friendlyError(e.message));
      btn.disabled = false; btn.textContent = orig; btn.dataset.busy = '0';
    }
  }

  // 검색/필터 입력 시 (디바운스)
  var _searchTimer = null;
  function onAdminUserFilterChange() {
    if (_searchTimer) clearTimeout(_searchTimer);
    _searchTimer = setTimeout(renderAdminUsers, 250);
  }

  // ── 가족방 관리 (2026-07-18) ─────────────────────────────
  async function renderAdminFamilies() {
    var listEl = document.getElementById('adminFamiliesList');
    if (listEl) listEl.innerHTML = '<p class="muted center" style="padding:24px 0">불러오는 중…</p>';
    var q = (document.getElementById('adminFamilySearch') || {}).value || '';

    var qs = '/listFamilies?limit=300';
    if (q.trim()) qs += '&q=' + encodeURIComponent(q.trim());

    try {
      var data = await adminApi(qs);
      drawFamilies((data && data.families) || []);
    } catch (e) {
      if (listEl) listEl.innerHTML = errorBox(e.message);
    }
  }

  function drawFamilies(families) {
    var listEl = document.getElementById('adminFamiliesList');
    var countEl = document.getElementById('adminFamiliesCount');
    if (countEl) countEl.textContent = families.length + '개';
    if (!listEl) return;
    if (!families.length) {
      listEl.innerHTML = '<p class="muted center" style="padding:24px 0">해당하는 가족방이 없습니다.</p>';
      return;
    }
    listEl.innerHTML = families.map(function (f) {
      var typeBadge = f.groupType === '구역'
        ? '<span class="admin-badge admin-badge-neutral">구역</span>'
        : '<span class="admin-badge admin-badge-on">가정</span>';
      var place = [f.parish, f.district].filter(Boolean).join(' · ');
      return '<div class="admin-user-row">' +
        '<div class="admin-user-info">' +
          '<div class="admin-user-name">' + esc(f.roomName || '(이름 없음)') + ' ' + typeBadge + '</div>' +
          '<div class="admin-user-email">대표 ' + esc(f.leaderName || '-') +
            ' · 구성원 ' + (f.memberCount || 0) + '명' +
            (f.email ? ' · ' + esc(f.email) : '') + '</div>' +
          '<div class="admin-user-meta">교회 ' + esc(f.churchCode || '-') +
            (place ? ' · ' + esc(place) : '') +
            ' · 생성 ' + fmtDate(f.createdAt) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  var _familySearchTimer = null;
  function onAdminFamilyFilterChange() {
    if (_familySearchTimer) clearTimeout(_familySearchTimer);
    _familySearchTimer = setTimeout(renderAdminFamilies, 250);
  }

  window.renderAdminDashboard = renderAdminDashboard;
  window.renderAdminUsers = renderAdminUsers;
  window.adminToggleUserStatus = adminToggleUserStatus;
  window.onAdminUserFilterChange = onAdminUserFilterChange;
  window.renderAdminFamilies = renderAdminFamilies;
  window.onAdminFamilyFilterChange = onAdminFamilyFilterChange;
})();
