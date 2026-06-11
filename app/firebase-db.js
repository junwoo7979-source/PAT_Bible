/**
 * PAT Bible — Firebase Functions API 연동 모듈
 * Firestore REST 직접 호출 → Firebase Functions API 호출로 전환
 * API 키가 서버(Functions)에만 존재 — 클라이언트에 노출 없음
 */

window.PAT_DB = (() => {
  const CONFIG = window.FIREBASE_CONFIG || {};
  const API = CONFIG.apiBase || 'https://us-central1-pat-bible-app.cloudfunctions.net';

  // ── 활성화 여부 ───────────────────────────────────────
  function ready() { return !!window.FIREBASE_READY; }

  function init() {
    if (!ready()) { console.log('[PAT_DB] 로컬 모드'); return false; }
    console.log('[PAT_DB] Firebase Functions API 모드 활성화');
    return true;
  }

  // ── 기기 고유 ID ──────────────────────────────────────
  function getDeviceId() {
    let id = localStorage.getItem('pat_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('pat_device_id', id);
    }
    return id;
  }

  // ── API 헬퍼 ─────────────────────────────────────────
  async function apiGet(path, params = {}, retries = 2) {
    const qs = new URLSearchParams(params).toString();
    const url = `${API}/${path}${qs ? '?' + qs : ''}`;
    for (let i = 0; i <= retries; i++) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`API ${path} ${r.status}`);
        return await r.json();
      } catch (e) {
        if (i === retries) throw e;
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
      }
    }
  }

  async function apiPost(path, body = {}, retries = 2) {
    const url = `${API}/${path}`;
    for (let i = 0; i <= retries; i++) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: authHeaders(path),
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`API ${path} ${r.status}`);
        return await r.json();
      } catch (e) {
        if (i === retries) throw e;
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
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
    if (clientToken) headers['x-pat-client-token'] = clientToken;
    if (path === 'saveVerse' && adminToken) headers['x-pat-admin-token'] = adminToken;
    return headers;
  }

  // ════════════════════════════════════════════════════════
  // 구절 (Verse)
  // ════════════════════════════════════════════════════════

  async function saveVerse(churchCode, verse) {
    if (!ready()) return false;
    try {
      await apiPost('saveVerse', { churchCode, ref: verse.ref, text: verse.text, weekOf: verse.weekOf });
      return true;
    } catch (e) { console.warn('[PAT_DB] saveVerse:', e.message); return false; }
  }

  async function getLatestVerse(churchCode) {
    if (!ready()) return null;
    try {
      const data = await apiGet('getVerse', { churchCode });
      return data.verse || null;
    } catch (e) { console.warn('[PAT_DB] getLatestVerse:', e.message); return null; }
  }

  let _polling = null;
  let _lastVerseId = null;

  function subscribeVerse(churchCode, callback) {
    if (!ready()) return;
    if (_polling) clearInterval(_polling);
    _polling = setInterval(async () => {
      try {
        const verse = await getLatestVerse(churchCode);
        if (verse && verse.id !== _lastVerseId) {
          _lastVerseId = verse.id;
          if (_lastVerseId) callback(verse);
        }
      } catch (e) {}
    }, 5000);
    getLatestVerse(churchCode).then(verse => {
      if (verse) { _lastVerseId = verse.id; callback(verse); }
    });
  }

  // ════════════════════════════════════════════════════════
  // 가족방 (Family)
  // ════════════════════════════════════════════════════════

  async function saveFamily(churchCode, profile) {
    if (!ready()) return null;
    try {
      const familyId = localStorage.getItem('pat_family_id') || undefined;
      const data = await apiPost('saveFamily', {
        churchCode, familyId,
        roomName: profile.roomName, leaderName: profile.leaderName,
        parish: profile.parish, district: profile.district,
        familyPassword: profile.familyPassword || undefined,
        members: Array.isArray(profile.members) ? profile.members : [],
      });
      if (!familyId) localStorage.setItem('pat_family_id', data.familyId);
      return data.familyId;
    } catch (e) { console.warn('[PAT_DB] saveFamily:', e.message); return null; }
  }

  async function findFamilyByPassword(churchCode, familyPassword, familyIdOverride) {
    if (!ready() || !familyPassword) return null;
    try {
      const familyId = familyIdOverride || localStorage.getItem('pat_family_id') || undefined;
      const data = await apiPost('findFamily', { churchCode, familyPassword, familyId });
      return data.family || null;
    } catch (e) { console.warn('[PAT_DB] findFamilyByPassword:', e.message); return null; }
  }

  async function joinFamily(churchCode, familyId, displayName) {
    if (!ready() || !familyId) return;
    try {
      await apiPost('joinFamily', { churchCode, familyId, deviceId: getDeviceId(), displayName });
    } catch (e) { console.warn('[PAT_DB] joinFamily:', e.message); }
  }

  async function getFamilyMembers(churchCode, familyId) {
    if (!ready() || !familyId) return [];
    try {
      const data = await apiGet('getFamilyProgress', { churchCode, familyId });
      return data.members || [];
    } catch (e) { return []; }
  }

  function subscribeFamily(churchCode, familyId, callback) {
    if (!ready() || !familyId) return;
    const poll = async () => {
      try {
        const verseRef = window.DB?.verse?.ref;
        const data = await apiGet('getFamilyProgress', { churchCode, familyId, verseRef: verseRef || '' });
        callback(data.members || []);
      } catch (e) {}
    };
    poll();
    setInterval(poll, 10000);
  }

  // ════════════════════════════════════════════════════════
  // 암송 기록 (Records)
  // ════════════════════════════════════════════════════════

  async function saveRecord(churchCode, record) {
    if (!ready()) return false;
    try {
      const deviceId = getDeviceId();
      const familyId = localStorage.getItem('pat_family_id') || '';
      const profile = (() => {
        try { return JSON.parse(localStorage.getItem('pat_family_profile') || 'null'); } catch { return null; }
      })();
      await apiPost('saveRecord', {
        churchCode, deviceId, familyId,
        parish: profile?.parish || '', district: profile?.district || '',
        leaderName: profile?.leaderName || '',
        verseRef: record.ref,
        voiceScore1: record.voiceScore1 || 0, voiceScore2: record.voiceScore2 || 0,
        typeScore1: record.typeScore1 || 0, typeScore2: record.typeScore2 || 0,
        badge: record.badge || 'weekly_complete',
      });
      return true;
    } catch (e) { console.warn('[PAT_DB] saveRecord:', e.message); return false; }
  }

  async function hasRecord(churchCode, verseRef) {
    if (!ready()) return false;
    try {
      const data = await apiGet('hasRecord', { churchCode, verseRef, deviceId: getDeviceId() });
      return data.exists || false;
    } catch (e) { return false; }
  }

  // ════════════════════════════════════════════════════════
  // 대시보드 집계
  // ════════════════════════════════════════════════════════

  async function getDashboardStats(churchCode, verseRef) {
    if (!ready()) return null;
    try {
      return await apiGet('getDashboard', { churchCode, verseRef });
    } catch (e) { console.warn('[PAT_DB] getDashboardStats:', e.message); return null; }
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

  function unsubscribeAll() {
    if (_polling) { clearInterval(_polling); _polling = null; }
  }

  async function resetFamilyPassword(churchCode, leaderName, parish, district, newPassword) {
    if (!ready()) return { ok: false, error: '서버 연결 안 됨' };
    try {
      const data = await apiPost('resetFamilyPassword', {
        churchCode, leaderName, parish, district, newPassword,
      });
      return data.ok ? { ok: true, familyId: data.familyId } : { ok: false, error: data.error || '재설정 실패' };
    } catch (e) {
      // 404: 가족방 못 찾음, 기타: 서버 오류
      const msg = e.message || '서버 오류';
      return { ok: false, error: msg };
    }
  }

  return {
    init, ready, getDeviceId,
    saveVerse, getLatestVerse, subscribeVerse,
    saveFamily, findFamilyByPassword, joinFamily, getFamilyMembers, subscribeFamily,
    saveRecord, hasRecord,
    getDashboardStats, getFamilyStats, getFamilyProgress,
    resetFamilyPassword,
    unsubscribeAll,
  };
})();
