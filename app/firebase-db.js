/**
 * PAT Bible — Cloud Firestore REST API 연동 모듈
 * Firebase SDK 대신 Cloud Firestore REST API 직접 사용
 * (Firebase ToS 없이 GCP Cloud Firestore로 동작)
 *
 * Firestore 컬렉션 구조:
 *   churches/{churchCode}/verses/{verseId}
 *   churches/{churchCode}/families/{familyId}
 *   churches/{churchCode}/families/{familyId}/members/{deviceId}
 *   churches/{churchCode}/records/{recordId}
 */

window.PAT_DB = (() => {
  const PROJECT = 'pat-bible-app';
  const API_KEY = 'AIzaSyCsENXeyM9uMRCPZ7c9IQPtPXq31jb6wHM';
  const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

  let _polling = null;
  let _lastVerseId = null;

  // ── 활성화 여부 ───────────────────────────────────────
  function ready() { return !!window.FIREBASE_READY; }

  function init() {
    if (!ready()) { console.log('[PAT_DB] 로컬 모드'); return false; }
    console.log('[PAT_DB] Cloud Firestore REST 모드 활성화');
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

  // ── Firestore REST 헬퍼 ───────────────────────────────
  function url(path) {
    return `${BASE}/${path}?key=${API_KEY}`;
  }

  /** Firestore 값 → JS 값 변환 */
  function fsToJs(val) {
    if (!val) return null;
    if (val.stringValue !== undefined) return val.stringValue;
    if (val.integerValue !== undefined) return parseInt(val.integerValue);
    if (val.doubleValue !== undefined) return parseFloat(val.doubleValue);
    if (val.booleanValue !== undefined) return val.booleanValue;
    if (val.timestampValue !== undefined) return val.timestampValue;
    if (val.mapValue) return fsDocToObj(val.mapValue.fields || {});
    if (val.arrayValue) return (val.arrayValue.values || []).map(fsToJs);
    return null;
  }

  /** Firestore 문서 fields → JS 객체 */
  function fsDocToObj(fields) {
    const obj = {};
    for (const [k, v] of Object.entries(fields)) obj[k] = fsToJs(v);
    return obj;
  }

  /** JS 값 → Firestore 값 변환 */
  function jsToFs(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'string') return { stringValue: val };
    if (typeof val === 'number') return Number.isInteger(val)
      ? { integerValue: String(val) } : { doubleValue: val };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (val instanceof Date) return { timestampValue: val.toISOString() };
    if (Array.isArray(val)) return { arrayValue: { values: val.map(jsToFs) } };
    if (typeof val === 'object') {
      const fields = {};
      for (const [k, v] of Object.entries(val)) fields[k] = jsToFs(v);
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  /** JS 객체 → Firestore 문서 */
  function objToFsDoc(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      if (k === 'serverTimestamp') { fields[k] = { timestampValue: new Date().toISOString() }; continue; }
      fields[k] = jsToFs(v);
    }
    return { fields };
  }

  /** GET 요청 */
  async function fsGet(path) {
    const r = await fetch(url(path));
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.fields) return null;
    return { id: d.name.split('/').pop(), ...fsDocToObj(d.fields) };
  }

  /** 쿼리 (최근 N개 정렬) */
  async function fsQuery(collection, orderField, limit = 10) {
    const body = {
      structuredQuery: {
        from: [{ collectionId: collection.split('/').pop() }],
        orderBy: [{ field: { fieldPath: orderField }, direction: 'DESCENDING' }],
        limit,
      }
    };
    // collectionGroup 기준 path 설정
    const parts = collection.split('/');
    const parentPath = parts.slice(0, -1).join('/');
    const endpoint = `${BASE}${parentPath ? '/' + parentPath : ''}:runQuery?key=${API_KEY}`;
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) return [];
    const arr = await r.json();
    return arr.filter(x => x.document).map(x => ({
      id: x.document.name.split('/').pop(),
      ...fsDocToObj(x.document.fields || {})
    }));
  }

  /** 조건 쿼리 */
  async function fsQueryWhere(parentPath, collection, filters = [], limit = 50) {
    const endpoint = `${BASE}/${parentPath}:runQuery?key=${API_KEY}`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: filters.length === 1 ? {
          fieldFilter: {
            field: { fieldPath: filters[0].field },
            op: filters[0].op || 'EQUAL',
            value: jsToFs(filters[0].value),
          }
        } : {
          compositeFilter: {
            op: 'AND',
            filters: filters.map(f => ({
              fieldFilter: {
                field: { fieldPath: f.field },
                op: f.op || 'EQUAL',
                value: jsToFs(f.value),
              }
            }))
          }
        },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit,
      }
    };
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) return [];
    const arr = await r.json();
    return arr.filter(x => x.document).map(x => ({
      id: x.document.name.split('/').pop(),
      ...fsDocToObj(x.document.fields || {})
    }));
  }

  /** POST (문서 추가) */
  async function fsAdd(path, data) {
    const doc = objToFsDoc({ ...data, createdAt: new Date().toISOString() });
    const r = await fetch(url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc)
    });
    if (!r.ok) throw new Error(`fsAdd ${r.status}`);
    const d = await r.json();
    return d.name.split('/').pop();
  }

  /** PATCH (문서 업데이트) */
  async function fsPatch(path, data) {
    const doc = objToFsDoc({ ...data, updatedAt: new Date().toISOString() });
    const r = await fetch(url(path) + '&updateMask.fieldPaths=' + Object.keys(data).concat('updatedAt').join('&updateMask.fieldPaths='), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc)
    });
    return r.ok;
  }

  /** SET (문서 덮어쓰기) */
  async function fsSet(path, data) {
    const doc = objToFsDoc(data);
    const r = await fetch(url(path), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc)
    });
    return r.ok;
  }

  // ════════════════════════════════════════════════════════
  // 구절 (Verse)
  // ════════════════════════════════════════════════════════

  async function saveVerse(churchCode, verse) {
    if (!ready()) return false;
    try {
      await fsAdd(`churches/${churchCode}/verses`, {
        ref: verse.ref, text: verse.text, weekOf: verse.weekOf
      });
      return true;
    } catch(e) { console.warn('[PAT_DB] saveVerse:', e.message); return false; }
  }

  async function getLatestVerse(churchCode) {
    if (!ready()) return null;
    try {
      const endpoint = `${BASE}/churches/${churchCode}:runQuery?key=${API_KEY}`;
      const body = {
        structuredQuery: {
          from: [{ collectionId: 'verses' }],
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit: 1,
        }
      };
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) return null;
      const arr = await r.json();
      const docs = arr.filter(x => x.document);
      if (!docs.length) return null;
      const d = fsDocToObj(docs[0].document.fields || {});
      return { id: docs[0].document.name.split('/').pop(), ...d };
    } catch(e) { console.warn('[PAT_DB] getLatestVerse:', e.message); return null; }
  }

  /** 5초마다 폴링으로 구절 변경 감지 (Firestore REST는 실시간 스트림 없음) */
  function subscribeVerse(churchCode, callback) {
    if (!ready()) return;
    if (_polling) clearInterval(_polling);
    _polling = setInterval(async () => {
      try {
        const verse = await getLatestVerse(churchCode);
        if (verse && verse.id !== _lastVerseId) {
          _lastVerseId = verse.id;
          if (_lastVerseId) callback(verse); // 최초 로드 제외
        }
      } catch(e) {}
    }, 5000);
    // 즉시 1회 로드
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
      let familyId = localStorage.getItem('pat_family_id');
      const data = {
        roomName: profile.roomName, leaderName: profile.leaderName,
        parish: profile.parish, district: profile.district, churchCode,
        familyPassword: profile.familyPassword || '',
        members: Array.isArray(profile.members) ? profile.members : []
      };
      if (familyId) {
        await fsPatch(`churches/${churchCode}/families/${familyId}`, data);
      } else {
        familyId = await fsAdd(`churches/${churchCode}/families`, data);
        localStorage.setItem('pat_family_id', familyId);
      }
      return familyId;
    } catch(e) { console.warn('[PAT_DB] saveFamily:', e.message); return null; }
  }

  async function findFamilyByPassword(churchCode, familyPassword) {
    if (!ready() || !familyPassword) return null;
    try {
      const families = await fsQueryWhere(
        `churches/${churchCode}`,
        'families',
        [{ field: 'familyPassword', value: familyPassword }],
        1
      );
      return families[0] || null;
    } catch(e) { console.warn('[PAT_DB] findFamilyByPassword:', e.message); return null; }
  }

  async function joinFamily(churchCode, familyId, displayName) {
    if (!ready() || !familyId) return;
    try {
      const deviceId = getDeviceId();
      await fsSet(`churches/${churchCode}/families/${familyId}/members/${deviceId}`, {
        displayName: displayName || '성도', deviceId,
        joinedAt: new Date().toISOString()
      });
    } catch(e) { console.warn('[PAT_DB] joinFamily:', e.message); }
  }

  async function getFamilyMembers(churchCode, familyId) {
    if (!ready() || !familyId) return [];
    try {
      const r = await fetch(url(`churches/${churchCode}/families/${familyId}/members`));
      if (!r.ok) return [];
      const d = await r.json();
      return (d.documents || []).map(doc => ({
        id: doc.name.split('/').pop(), ...fsDocToObj(doc.fields || {})
      }));
    } catch(e) { return []; }
  }

  function subscribeFamily(churchCode, familyId, callback) {
    // REST API 폴링 (10초마다)
    if (!ready() || !familyId) return;
    const poll = async () => {
      const members = await getFamilyMembers(churchCode, familyId);
      const verseRef = window.DB?.verse?.ref;
      if (!verseRef) { callback(members.map(m => ({ ...m, done: false }))); return; }
      const myRecords = await fsQueryWhere(
        `churches/${churchCode}`, 'records',
        [{ field: 'familyId', value: familyId }, { field: 'verseRef', value: verseRef }]
      );
      const doneIds = new Set(myRecords.map(r => r.deviceId));
      callback(members.map(m => ({ ...m, done: doneIds.has(m.deviceId) })));
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
      await fsAdd(`churches/${churchCode}/records`, {
        deviceId, familyId,
        parish: profile?.parish || '', district: profile?.district || '',
        leaderName: profile?.leaderName || '',
        verseRef: record.ref,
        voiceScore1: record.voiceScore1 || 0, voiceScore2: record.voiceScore2 || 0,
        typeScore1: record.typeScore1 || 0, typeScore2: record.typeScore2 || 0,
        badge: record.badge || 'weekly_complete',
      });
      return true;
    } catch(e) { console.warn('[PAT_DB] saveRecord:', e.message); return false; }
  }

  async function hasRecord(churchCode, verseRef) {
    if (!ready()) return false;
    try {
      const deviceId = getDeviceId();
      const docs = await fsQueryWhere(`churches/${churchCode}`, 'records',
        [{ field: 'deviceId', value: deviceId }, { field: 'verseRef', value: verseRef }], 1);
      return docs.length > 0;
    } catch(e) { return false; }
  }

  // ════════════════════════════════════════════════════════
  // 대시보드 집계
  // ════════════════════════════════════════════════════════

  async function getDashboardStats(churchCode, verseRef) {
    if (!ready()) return null;
    try {
      const docs = await fsQueryWhere(`churches/${churchCode}`, 'records',
        [{ field: 'verseRef', value: verseRef }], 200);
      const byParish = {};
      const seen = new Set();
      docs.forEach(r => {
        const key = r.deviceId + '_' + r.verseRef;
        if (seen.has(key)) return;
        seen.add(key);
        const p = r.parish || '미지정';
        byParish[p] = (byParish[p] || 0) + 1;
      });
      return { total: seen.size, byParish };
    } catch(e) { console.warn('[PAT_DB] getDashboardStats:', e.message); return null; }
  }

  async function getFamilyStats(churchCode, familyId, verseRef) {
    if (!ready() || !familyId) return null;
    try {
      const docs = await fsQueryWhere(`churches/${churchCode}`, 'records',
        [{ field: 'familyId', value: familyId }, { field: 'verseRef', value: verseRef }], 50);
      const deviceIds = new Set(docs.map(d => d.deviceId));
      return { done: deviceIds.size };
    } catch(e) { return null; }
  }

  function unsubscribeAll() {
    if (_polling) { clearInterval(_polling); _polling = null; }
  }

  return {
    init, ready, getDeviceId,
    saveVerse, getLatestVerse, subscribeVerse,
    saveFamily, findFamilyByPassword, joinFamily, getFamilyMembers, subscribeFamily,
    saveRecord, hasRecord,
    getDashboardStats, getFamilyStats,
    unsubscribeAll,
  };
})();
