/**
 * PAT Bible — Firebase Functions API 연동 모듈 (v2)
 *
 * ★ 연결 방식: Cloud Functions REST API (Long-Polling 방식)
 *   - Firestore SDK를 직접 사용하지 않음 → QUIC/WebChannel 연결 없음
 *   - experimentalForceLongPolling: true 와 동일한 효과 (fetch + setInterval 폴링)
 *   - ERR_QUIC_PROTOCOL_ERROR 원천 차단
 *   - [resub] resubscribing listener 무한루프 없음
 *
 * ★ 구버전 SDK 잔존 방지:
 *   - 페이지 로드 시 window.__FIREBASE_DEFAULTS__ 를 설정하여
 *     혹시 캐시된 구버전 Firebase SDK가 로드되더라도 실시간 리스너를 비활성화
 */

// ── 구버전 Firebase SDK 실시간 리스너 비활성화 방어막 ──────────────
// 구 SW 캐시에 Firebase SDK가 남아 있을 경우, 초기화 시 experimentalForceLongPolling을
// 적용하고 실시간 스트리밍(WebChannel/QUIC)을 차단한다.
(function blockLegacyFirestoreSDK() {
  try {
    // Firebase SDK 글로벌 기본값 설정 (SDK가 로드될 경우 이 값을 참조함)
    window.__FIREBASE_DEFAULTS__ = window.__FIREBASE_DEFAULTS__ || {};
    window.__FIREBASE_DEFAULTS__._config = window.__FIREBASE_DEFAULTS__._config || {};
    window.__FIREBASE_DEFAULTS__._config.firestore = {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: false,
      useFetchStreams: false,
    };

    // onSnapshot 같은 실시간 리스너가 실행되려 할 때 경고 출력 (디버그용)
    if (typeof window !== 'undefined' && !window._legacySDKBlocked) {
      window._legacySDKBlocked = true;
      console.log('[PAT_DB] ✅ Long-Polling 모드 강제 적용 (QUIC/WebChannel 차단)');
    }
  } catch (e) {
    // 무시
  }
})();

// ── PAT_DB 모듈 ───────────────────────────────────────────────────
window.PAT_DB = (() => {
  const CONFIG = window.FIREBASE_CONFIG || {};
  const API = CONFIG.apiBase || 'https://us-central1-pat-bible-app.cloudfunctions.net';

  // ── 활성화 여부 ─────────────────────────────────────────────────
  function ready() { return !!window.FIREBASE_READY; }

  function init() {
    if (!ready()) { console.log('[PAT_DB] 로컬 모드'); return false; }
    console.log('[PAT_DB] Firebase Functions REST API 모드 (Long-Polling)');
    return true;
  }

  // ── 기기 고유 ID ─────────────────────────────────────────────────
  function getDeviceId() {
    let id = localStorage.getItem('pat_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('pat_device_id', id);
    }
    return id;
  }

  // ── API 헬퍼 ────────────────────────────────────────────────────
  // Long-Polling 방식: 매 요청은 독립적인 fetch (스트리밍 없음, QUIC 미사용)
  async function apiGet(path, params = {}, retries = 2) {
    const qs = new URLSearchParams(params).toString();
    const url = `${API}/${path}${qs ? '?' + qs : ''}`;
    for (let i = 0; i <= retries; i++) {
      try {
        const r = await fetch(url, {
          method: 'GET',
          cache: 'no-store',    // 캐시 없이 항상 서버에서 직접 조회
          headers: { 'Accept': 'application/json' },
        });
        if (!r.ok) throw new Error(`API ${path} ${r.status}`);
        return await r.json();
      } catch (e) {
        if (i === retries) throw e;
        await new Promise(r => setTimeout(r, 600 * (i + 1)));
      }
    }
  }

  async function apiPost(path, body = {}, retries = 2) {
    const url = `${API}/${path}`;
    for (let i = 0; i <= retries; i++) {
      try {
        const headers = authHeaders(path);
        headers['Content-Type'] = 'application/json; charset=utf-8';
        const r = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(`API ${path} ${r.status}`);
        return await r.json();
      } catch (e) {
        if (i === retries) throw e;
        await new Promise(r => setTimeout(r, 600 * (i + 1)));
      }
    }
  }

  function storedToken(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

  function authHeaders(path) {
    const headers = { 'Content-Type': 'application/json' };
    const clientToken = CONFIG.clientToken || storedToken('pat_client_token');
    const adminToken = CONFIG.adminToken || storedToken('pat_admin_token');
    const adminId = storedToken('pat_admin_id');
    const adminPassword = storedToken('pat_admin_pw');
    const adminWrite = path === 'saveVerse' || path === 'saveConfig' || path === 'getMissionHistory';
    if (clientToken) headers['x-pat-client-token'] = clientToken;
    if (adminWrite && adminToken) headers['x-pat-admin-token'] = adminToken;
    if (adminWrite && !adminToken && adminId && adminPassword) {
      headers['x-pat-admin-id'] = adminId;
      headers['x-pat-admin-password'] = adminPassword;
    }
    return headers;
  }

  // ════════════════════════════════════════════════════════════════
  // 멀티 교회 — 등록 / 관리자 로그인 / 코드 확인
  // ════════════════════════════════════════════════════════════════
  async function registerChurch(code, name, adminId, adminPw) {
    if (!ready()) return { ok: false, error: '서버 연결이 필요합니다' };
    try {
      const r = await fetch(`${API}/registerChurch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ code, name, adminId, adminPw }),
        cache: 'no-store',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: data.error || ('오류 ' + r.status) };
      return data;
    } catch (e) { return { ok: false, error: e.message }; }
  }

  async function adminLogin(adminId, adminPw) {
    if (!ready()) return { ok: false, error: '서버 연결이 필요합니다' };
    try {
      const r = await fetch(`${API}/adminLogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ adminId, adminPw }),
        cache: 'no-store',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: data.error || ('오류 ' + r.status) };
      return data;
    } catch (e) { return { ok: false, error: e.message }; }
  }

  async function checkChurchCode(code) {
    if (!ready()) return null;
    try { return await apiGet('checkChurchCode', { code }); } catch (e) { return null; }
  }

  async function checkAdminId(adminId) {
    if (!ready()) return null;
    try { return await apiGet('checkAdminId', { adminId }); } catch (e) { return null; }
  }

  // ── 문의·오류 신고 ──────────────────────────────────────────────
  async function submitReport(payload) {
    if (!ready()) return false;
    try {
      const r = await fetch(`${API}/submitReport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload || {}),
        cache: 'no-store',
      });
      return r.ok;
    } catch (e) { return false; }
  }

  async function getReports(token) {
    if (!ready()) return null;
    try {
      const r = await fetch(`${API}/getReports`, {
        headers: { 'x-pat-dev-token': token },
        cache: 'no-store',
      });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  async function deleteReport(token, id) {
    if (!ready()) return false;
    try {
      const r = await fetch(`${API}/deleteReport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pat-dev-token': token },
        body: JSON.stringify({ id }),
        cache: 'no-store',
      });
      return r.ok;
    } catch (e) { return false; }
  }

  // ════════════════════════════════════════════════════════════════
  // 구절 (Verse)
  // ════════════════════════════════════════════════════════════════
  async function saveVerse(churchCode, verse) {
    if (!ready()) { console.error('[PAT_DB] Firebase not ready'); return false; }
    try {
      const result = await apiPost('saveVerse', {
        churchCode, ref: verse.ref, text: verse.text, weekOf: verse.weekOf,
      });
      console.log('[PAT_DB] saveVerse 성공:', result);
      return true;
    } catch (e) {
      console.error('[PAT_DB] saveVerse 실패:', e.message);
      return false;
    }
  }

  async function getLatestVerse(churchCode) {
    if (!ready()) return null;
    try {
      const data = await apiGet('getVerse', { churchCode });
      return data.verse || null;
    } catch (e) { console.warn('[PAT_DB] getLatestVerse:', e.message); return null; }
  }

  async function getConfig(churchCode) {
    if (!ready()) return null;
    try {
      const data = await apiGet('getConfig', { churchCode });
      return data.config || null;
    } catch (e) { console.warn('[PAT_DB] getConfig:', e.message); return null; }
  }

  async function saveConfig(churchCode, appTitle, verse, parishTotals, parishConfig) {
    if (!ready()) return false;
    try {
      await apiPost('saveConfig', { churchCode, appTitle, verse, parishTotals, parishConfig });
      return true;
    } catch (e) {
      console.error('[PAT_DB] saveConfig 실패:', e.message);
      return false;
    }
  }

  // ✝️ 예배 안내 저장 (Admin) — saveConfig 엔드포인트에 worship만 부분 저장
  async function saveWorship(churchCode, worship) {
    if (!ready()) return false;
    try {
      await apiPost('saveConfig', { churchCode, worship });
      return true;
    } catch (e) {
      console.error('[PAT_DB] saveWorship 실패:', e.message);
      return false;
    }
  }

  // ── Long-Polling 구독 (setInterval 방식, WebChannel/QUIC 없음) ──
  let _polling = null;
  let _configPolling = null;
  let _lastVerseHash = null;
  let _lastConfigHash = null;

  function subscribeVerse(churchCode, callback) {
    if (!ready()) return;
    if (_polling) clearInterval(_polling);

    function getVerseHash(verse) {
      if (!verse) return null;
      return verse.ref + '|' + verse.text + '|' + (verse.weekOf || '');
    }

    // 초기값 즉시 로드
    getLatestVerse(churchCode).then(verse => {
      if (verse) { _lastVerseHash = getVerseHash(verse); callback(verse); }
    });

    // 5초 폴링 (Long-Polling 방식)
    _polling = setInterval(async () => {
      try {
        const verse = await getLatestVerse(churchCode);
        const hash = getVerseHash(verse);
        if (hash && hash !== _lastVerseHash) {
          _lastVerseHash = hash;
          callback(verse);
        }
      } catch (e) {
        // 네트워크 오류는 조용히 무시 (다음 폴링에서 재시도)
      }
    }, 5000);
  }

  function subscribeConfig(churchCode, callback) {
    if (!ready()) return;
    if (_configPolling) clearInterval(_configPolling);

    function getConfigHash(config) {
      if (!config) return null;
      const v = config.verse ? config.verse.ref + '|' + config.verse.text : '';
      const w = config.worship ? (config.worship.title || '') + '|' + (config.worship.content || '') : '';
      return (config.appTitle || '') + '|' + v + '|' + w;
    }

    // 초기값 즉시 로드
    getConfig(churchCode).then(config => {
      if (config) { _lastConfigHash = getConfigHash(config); callback(config); }
    });

    // 5초 폴링
    _configPolling = setInterval(async () => {
      try {
        const config = await getConfig(churchCode);
        const hash = getConfigHash(config);
        if (hash && hash !== _lastConfigHash) {
          _lastConfigHash = hash;
          callback(config);
        }
      } catch (e) {
        // 네트워크 오류는 조용히 무시
      }
    }, 5000);
  }

  function unsubscribeAll() {
    if (_polling) { clearInterval(_polling); _polling = null; }
    if (_configPolling) { clearInterval(_configPolling); _configPolling = null; }
  }

  // ════════════════════════════════════════════════════════════════
  // 가족방 (Family)
  // ════════════════════════════════════════════════════════════════
  async function saveFamily(churchCode, profile) {
    if (!ready()) return null;
    try {
      const familyId = profile.id || localStorage.getItem('pat_family_id') || undefined;
      const data = await apiPost('saveFamily', {
        churchCode,
        familyId,
        roomName: profile.roomName,
        leaderName: profile.leaderName,
        parish: profile.parish,
        district: profile.district,
        groupType: profile.groupType || undefined,
        familyPassword: profile.familyPassword || undefined,
        members: Array.isArray(profile.members) ? profile.members : [],
      });
      if (!familyId && data.familyId) localStorage.setItem('pat_family_id', data.familyId);
      return data.familyId;
    } catch (e) { console.warn('[PAT_DB] saveFamily:', e.message); return null; }
  }

  async function findFamilyByPassword(churchCode, familyPassword, familyIdOverride) {
    if (!ready() || !familyPassword) return null;
    try {
      const familyId = familyIdOverride || localStorage.getItem('pat_family_id') || undefined;
      const data = await apiPost('findFamily', { churchCode, familyPassword, familyId });
      const family = data.family || null;

      // ★ 2026-07-01: roomName 자동 생성 — Firebase에서 없으면 leaderName으로 생성
      if(family && !family.roomName && family.leaderName) {
        const last = family.leaderName.charCodeAt(family.leaderName.length - 1);
        const hasBatchim = last >= 0xAC00 && last <= 0xD7A3 && ((last - 0xAC00) % 28) > 0;
        family.roomName = family.leaderName + (hasBatchim ? '이' : '') + '네 가족';
      }
      return family;
    } catch (e) { console.warn('[PAT_DB] findFamilyByPassword:', e.message); return null; }
  }

  // 전역(현재 방 무관) 비밀번호 검색 — '다른 방 참여'용. familyId를 보내지 않아
  // 현재 활성 방에 묶이지 않고 교회 전체에서 비번 해시로 방을 찾는다.
  async function findFamilyByPasswordGlobal(churchCode, familyPassword) {
    if (!ready() || !familyPassword) return null;
    try {
      const data = await apiPost('findFamily', { churchCode, familyPassword });
      const family = data.family || null;

      // ★ 2026-07-01: roomName 자동 생성 — Firebase에서 없으면 leaderName으로 생성
      if(family && !family.roomName && family.leaderName) {
        const last = family.leaderName.charCodeAt(family.leaderName.length - 1);
        const hasBatchim = last >= 0xAC00 && last <= 0xD7A3 && ((last - 0xAC00) % 28) > 0;
        family.roomName = family.leaderName + (hasBatchim ? '이' : '') + '네 가족';
      }
      return family;
    } catch (e) { console.warn('[PAT_DB] findFamilyByPasswordGlobal:', e.message); return null; }
  }

  async function joinFamily(churchCode, familyId, displayName) {
    if (!ready() || !familyId) return;
    try {
      await apiPost('joinFamily', { churchCode, familyId, deviceId: getDeviceId(), displayName });
    } catch (e) { console.warn('[PAT_DB] joinFamily:', e.message); }
  }

  async function removeFamilyMember(churchCode, familyId, name) {
    if (!ready() || !familyId || !name) return false;
    try {
      await apiPost('removeFamilyMember', { churchCode, familyId, name });
      return true;
    } catch (e) { console.warn('[PAT_DB] removeFamilyMember:', e.message); return false; }
  }

  async function getFamilyMembers(churchCode, familyId) {
    if (!ready() || !familyId) return [];
    try {
      const data = await apiGet('getFamilyProgress', { churchCode, familyId });
      return data.members || [];
    } catch (e) { return []; }
  }

  async function getFamilyInfo(churchCode, familyId) {
    if (!ready() || !familyId) return null;
    try {
      const data = await apiGet('getFamilyProgress', { churchCode, familyId });
      return {
        roomName: data.roomName || '',
        leaderName: data.leaderName || '',
        parish: data.parish || '',
        district: data.district || '',
        groupType: data.groupType || '',
        members: data.members || [],
      };
    } catch (e) { return null; }
  }

  function subscribeFamily(churchCode, familyId, callback) {
    if (!ready() || !familyId) return;
    const poll = async () => {
      try {
        const verseRef = window.DB?.verse?.ref || '';
        const data = await apiGet('getFamilyProgress', { churchCode, familyId, verseRef });
        callback(data.members || []);
      } catch (e) {}
    };
    poll();
    setInterval(poll, 10000);
  }

  // ════════════════════════════════════════════════════════════════
  // 암송 기록 (Records)
  // ════════════════════════════════════════════════════════════════
  // 활성 방(localStorage)에 저장 — 기존 호출 호환
  async function saveRecord(churchCode, record) {
    if (!ready()) return false;
    const familyId = localStorage.getItem('pat_family_id') || '';
    if (!familyId) { console.warn('[PAT_DB] pat_family_id 없음 — 가족방 미등록'); return false; }
    const profile = (() => {
      try { return JSON.parse(localStorage.getItem('pat_family_profile') || 'null'); }
      catch { return null; }
    })();
    return saveRecordCtx(churchCode, record, {
      familyId,
      parish: profile?.parish || '',
      district: profile?.district || '',
      leaderName: profile?.leaderName || '',
      memberName: profile?.memberName || '',
      groupType: profile?.groupType || '가정',
    });
  }

  // ★ 3단계: 명시한 방(ctx)에 기록 저장 — '1회 완료 → 모든 소속 그룹 반영'에 사용.
  //   add-only(서버 .add) — 어떤 기존 기록도 덮어쓰지 않는다.
  async function saveRecordCtx(churchCode, record, ctx) {
    if (!ready()) return false;
    try {
      ctx = ctx || {};
      if (!ctx.familyId) { console.warn('[PAT_DB] saveRecordCtx: familyId 없음'); return false; }
      const payload = {
        churchCode, deviceId: getDeviceId(), familyId: ctx.familyId,
        parish: ctx.parish || '',
        district: ctx.district || '',
        leaderName: ctx.leaderName || '',
        memberName: ctx.memberName || '',
        groupType: (ctx.groupType === '구역') ? '구역' : '가정',
        verseRef: record.ref,
        voiceScore1: record.voiceScore1 || 0,
        voiceScore2: record.voiceScore2 || 0,
        typeScore1: record.typeScore1 || 0,
        typeScore2: record.typeScore2 || 0,
        badge: record.badge || 'weekly_complete',
      };
      await apiPost('saveRecord', payload);
      console.log('[PAT_DB] ✅ saveRecord 저장:', ctx.familyId, payload.memberName);
      return true;
    } catch (e) {
      console.error('[PAT_DB] ❌ saveRecordCtx 오류:', e.message);
      return false;
    }
  }

  async function hasRecord(churchCode, verseRef) {
    if (!ready()) return false;
    try {
      const data = await apiGet('hasRecord', { churchCode, verseRef, deviceId: getDeviceId() });
      return data.exists || false;
    } catch (e) { return false; }
  }

  // ════════════════════════════════════════════════════════════════
  // 대시보드 / 순위 / 통계
  // ════════════════════════════════════════════════════════════════
  async function getDashboardStats(churchCode, verseRef) {
    if (!ready()) return null;
    try {
      return await apiGet('getDashboard', { churchCode, verseRef });
    } catch (e) { console.warn('[PAT_DB] getDashboardStats:', e.message); return null; }
  }

  async function getFamiliesList(churchCode) {
    if (!ready()) return null;
    try {
      return await apiGet('getFamiliesList', { churchCode });
    } catch (e) { console.warn('[PAT_DB] getFamiliesList:', e.message); return null; }
  }

  async function getAwardRanking(churchCode, groupType) {
    if (!ready()) return null;
    try {
      const params = { churchCode };
      if (groupType) params.groupType = groupType;
      return await apiGet('getAwardRanking', params);
    } catch (e) { console.warn('[PAT_DB] getAwardRanking:', e.message); return null; }
  }

  async function getFamilyStats(churchCode, familyId, verseRef) {
    if (!ready() || !familyId) return null;
    try {
      const data = await apiGet('getFamilyProgress', { churchCode, familyId, verseRef });
      const done = (data.members || []).filter(m => m.done).length;
      return { done };
    } catch (e) { return null; }
  }

  async function getFamilyProgress(churchCode, familyId, verseRef) {
    if (!ready() || !familyId) return [];
    try {
      const data = await apiGet('getFamilyProgress', { churchCode, familyId, verseRef: verseRef || '' });
      return data.members || [];
    } catch (e) { console.warn('[PAT_DB] getFamilyProgress:', e.message); return []; }
  }

  // ════════════════════════════════════════════════════════════════
  // 음성 전사 / 비밀번호 재설정
  // ════════════════════════════════════════════════════════════════
  async function transcribeAudio(audioBase64, mimeType, language) {
    if (!ready()) return null;
    const data = await apiPost('transcribeAudio', {
      audioBase64, mimeType, language: language || 'ko',
    });
    return (data && data.text) || '';
  }

  async function resetFamilyPassword(churchCode, leaderName, parish, district, newPassword) {
    if (!ready()) return { ok: false, error: '서버 연결 안 됨' };
    try {
      const data = await apiPost('resetFamilyPassword', {
        churchCode, leaderName, parish, district, newPassword,
      });
      return data.ok ? { ok: true, familyId: data.familyId } : { ok: false, error: data.error || '재설정 실패' };
    } catch (e) {
      return { ok: false, error: e.message || '서버 오류' };
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 가족 기도 나눔 — 당일 가족 구성원끼리 서로 공유
  // ════════════════════════════════════════════════════════════════
  async function savePrayer(churchCode, { date, memberName, text }) {
    if (!ready()) return false;
    try {
      const familyId = localStorage.getItem('pat_family_id') || '';
      if (!familyId) { console.warn('[PAT_DB] savePrayer: familyId 없음'); return false; }
      await apiPost('savePrayer', { churchCode, familyId, date, memberName, text });
      return true;
    } catch (e) { console.warn('[PAT_DB] savePrayer:', e.message); return false; }
  }

  async function getPrayers(churchCode, date) {
    if (!ready()) return null;
    try {
      const familyId = localStorage.getItem('pat_family_id') || '';
      if (!familyId) return null;
      return await apiGet('getPrayers', { churchCode, familyId, date });
    } catch (e) { console.warn('[PAT_DB] getPrayers:', e.message); return null; }
  }

  // ── 수행 기록(history) 조회 ─────────────────────────────────────
  // 가족/개인 단위 — familyId 기반 (읽기 전용, 데이터 미변경)
  async function getMissionHistory(churchCode, familyId, from, to) {
    if (!ready()) return null;
    try {
      const params = { churchCode };
      if (familyId) params.familyId = familyId;
      if (from) params.from = from;
      if (to) params.to = to;
      return await apiGet('getMissionHistory', params);
    } catch (e) { console.warn('[PAT_DB] getMissionHistory:', e.message); return null; }
  }
  // 교회 전체(관리자, 연말 시상 근거) — POST + 관리자 인증
  async function getMissionHistoryAdmin(churchCode, from, to) {
    if (!ready()) return null;
    try {
      return await apiPost('getMissionHistory', { churchCode, from, to });
    } catch (e) { console.warn('[PAT_DB] getMissionHistoryAdmin:', e.message); return null; }
  }

  // ── public API ─────────────────────────────────────────────────
  return {
    init, ready, getDeviceId,
    registerChurch, adminLogin, checkChurchCode, checkAdminId,
    submitReport, getReports, deleteReport,
    saveVerse, getLatestVerse, subscribeVerse,
    saveFamily, findFamilyByPassword, findFamilyByPasswordGlobal, joinFamily, removeFamilyMember,
    getFamilyMembers, getFamilyInfo, subscribeFamily,
    saveRecord, saveRecordCtx, hasRecord,
    getDashboardStats, getFamilyStats, getFamilyProgress,
    transcribeAudio, getAwardRanking, getFamiliesList,
    resetFamilyPassword,
    savePrayer, getPrayers,
    getMissionHistory, getMissionHistoryAdmin,
    getConfig, saveConfig, saveWorship, subscribeConfig,
    unsubscribeAll,
  };
})();
