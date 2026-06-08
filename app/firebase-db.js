/**
 * PAT Bible — Firebase Firestore 연동 모듈
 * FIREBASE_READY = true 일 때 활성화, false 면 localStorage 전용으로 폴백
 *
 * Firestore 컬렉션 구조:
 *   churches/{churchCode}/
 *   churches/{churchCode}/verses/{verseId}
 *   churches/{churchCode}/families/{familyId}
 *   churches/{churchCode}/records/{recordId}
 */

window.PAT_DB = (() => {
  let db = null;
  let _unsubVerse = null;
  let _unsubFamily = null;

  // ── 초기화 ──────────────────────────────────────────────
  function init() {
    if (!window.FIREBASE_READY) return false;
    try {
      const app = firebase.initializeApp(window.FIREBASE_CONFIG);
      db = firebase.firestore(app);
      db.settings({ experimentalForceLongPolling: true }); // 방화벽 환경 대응
      console.log('[PAT_DB] Firestore 연결됨');
      return true;
    } catch (e) {
      console.warn('[PAT_DB] 초기화 실패, 로컬 모드로 전환:', e.message);
      db = null;
      return false;
    }
  }

  function ready() { return !!db; }

  // ── 기기 고유 ID (localStorage) ─────────────────────────
  function getDeviceId() {
    let id = localStorage.getItem('pat_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('pat_device_id', id);
    }
    return id;
  }

  // ── 교회 ref ────────────────────────────────────────────
  function churchRef(code) {
    return db.collection('churches').doc(code || '11111');
  }

  // ════════════════════════════════════════════════════════
  // 구절 (Verse)
  // ════════════════════════════════════════════════════════

  /** 관리자: 구절 저장 */
  async function saveVerse(churchCode, verse) {
    if (!ready()) return false;
    try {
      await churchRef(churchCode).collection('verses').add({
        ref: verse.ref,
        text: verse.text,
        weekOf: verse.weekOf,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      console.warn('[PAT_DB] saveVerse 실패:', e.message);
      return false;
    }
  }

  /** 성도: 최신 구절 1회 로드 */
  async function getLatestVerse(churchCode) {
    if (!ready()) return null;
    try {
      const snap = await churchRef(churchCode).collection('verses')
        .orderBy('createdAt', 'desc').limit(1).get();
      if (snap.empty) return null;
      const d = snap.docs[0].data();
      return { id: snap.docs[0].id, ref: d.ref, text: d.text, weekOf: d.weekOf };
    } catch (e) {
      console.warn('[PAT_DB] getLatestVerse 실패:', e.message);
      return null;
    }
  }

  /** 구절 실시간 리스너 — 관리자가 새 구절 등록하면 모든 기기에 자동 반영 */
  function subscribeVerse(churchCode, callback) {
    if (!ready()) return;
    if (_unsubVerse) _unsubVerse();
    _unsubVerse = churchRef(churchCode).collection('verses')
      .orderBy('createdAt', 'desc').limit(1)
      .onSnapshot(snap => {
        if (snap.empty) return;
        const d = snap.docs[0].data();
        callback({ id: snap.docs[0].id, ref: d.ref, text: d.text, weekOf: d.weekOf });
      }, e => console.warn('[PAT_DB] subscribeVerse 오류:', e.message));
  }

  // ════════════════════════════════════════════════════════
  // 가족방 (Family)
  // ════════════════════════════════════════════════════════

  /** 가족방 저장 / 갱신 */
  async function saveFamily(churchCode, profile) {
    if (!ready()) return null;
    try {
      let familyId = localStorage.getItem('pat_family_id');
      const data = {
        roomName: profile.roomName,
        leaderName: profile.leaderName,
        parish: profile.parish,
        district: profile.district,
        churchCode,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      if (familyId) {
        await churchRef(churchCode).collection('families').doc(familyId).set(data, { merge: true });
      } else {
        const docRef = await churchRef(churchCode).collection('families').add({
          ...data,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        familyId = docRef.id;
        localStorage.setItem('pat_family_id', familyId);
      }
      return familyId;
    } catch (e) {
      console.warn('[PAT_DB] saveFamily 실패:', e.message);
      return null;
    }
  }

  /** 가족방 멤버 출석 등록 (기기 단위) */
  async function joinFamily(churchCode, familyId, displayName) {
    if (!ready() || !familyId) return;
    try {
      const deviceId = getDeviceId();
      await churchRef(churchCode).collection('families').doc(familyId)
        .collection('members').doc(deviceId).set({
          displayName: displayName || '익명',
          deviceId,
          joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    } catch (e) {
      console.warn('[PAT_DB] joinFamily 실패:', e.message);
    }
  }

  /** 가족방 구성원 + 완료 현황 실시간 리스너 */
  function subscribeFamily(churchCode, familyId, callback) {
    if (!ready() || !familyId) return;
    if (_unsubFamily) _unsubFamily();
    _unsubFamily = churchRef(churchCode).collection('families').doc(familyId)
      .collection('members').onSnapshot(async snap => {
        const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // 각 멤버의 이번 주 완료 여부 확인
        const verseRef = window.DB?.verse?.ref;
        if (verseRef) {
          const completions = await Promise.all(members.map(async m => {
            const rSnap = await churchRef(churchCode).collection('records')
              .where('deviceId', '==', m.deviceId)
              .where('verseRef', '==', verseRef)
              .limit(1).get();
            return { ...m, done: !rSnap.empty };
          }));
          callback(completions);
        } else {
          callback(members.map(m => ({ ...m, done: false })));
        }
      }, e => console.warn('[PAT_DB] subscribeFamily 오류:', e.message));
  }

  // ════════════════════════════════════════════════════════
  // 암송 기록 (Records)
  // ════════════════════════════════════════════════════════

  /** 암송 완료 기록 저장 */
  async function saveRecord(churchCode, record) {
    if (!ready()) return false;
    try {
      const deviceId = getDeviceId();
      const familyId = localStorage.getItem('pat_family_id') || null;
      const profile = (() => {
        try { return JSON.parse(localStorage.getItem('pat_family_profile') || 'null'); }
        catch { return null; }
      })();
      await churchRef(churchCode).collection('records').add({
        deviceId,
        familyId,
        parish: profile?.parish || '',
        district: profile?.district || '',
        leaderName: profile?.leaderName || '',
        verseRef: record.ref,
        voiceScore1: record.voiceScore1 || 0,
        voiceScore2: record.voiceScore2 || 0,
        typeScore1: record.typeScore1 || 0,
        typeScore2: record.typeScore2 || 0,
        badge: record.badge || 'weekly_complete',
        completedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      console.warn('[PAT_DB] saveRecord 실패:', e.message);
      return false;
    }
  }

  /** 이번 주 구절 완료 여부 확인 (중복 저장 방지) */
  async function hasRecord(churchCode, verseRef) {
    if (!ready()) return false;
    try {
      const deviceId = getDeviceId();
      const snap = await churchRef(churchCode).collection('records')
        .where('deviceId', '==', deviceId)
        .where('verseRef', '==', verseRef)
        .limit(1).get();
      return !snap.empty;
    } catch (e) { return false; }
  }

  // ════════════════════════════════════════════════════════
  // 대시보드 집계
  // ════════════════════════════════════════════════════════

  /** 교회 전체 / 교구별 통계 */
  async function getDashboardStats(churchCode, verseRef) {
    if (!ready()) return null;
    try {
      const snap = await churchRef(churchCode).collection('records')
        .where('verseRef', '==', verseRef).get();
      const records = snap.docs.map(d => d.data());

      // 교구별 집계 (deviceId 기준 중복 제거)
      const byParish = {};
      const seen = new Set();
      records.forEach(r => {
        const key = r.deviceId + '_' + r.verseRef;
        if (seen.has(key)) return;
        seen.add(key);
        const p = r.parish || '미지정';
        byParish[p] = (byParish[p] || 0) + 1;
      });
      return { total: seen.size, byParish };
    } catch (e) {
      console.warn('[PAT_DB] getDashboardStats 실패:', e.message);
      return null;
    }
  }

  /** 내 가족방 이번 주 완료 인원 */
  async function getFamilyStats(churchCode, familyId, verseRef) {
    if (!ready() || !familyId) return null;
    try {
      const snap = await churchRef(churchCode).collection('records')
        .where('familyId', '==', familyId)
        .where('verseRef', '==', verseRef).get();
      const deviceIds = new Set(snap.docs.map(d => d.data().deviceId));
      return { done: deviceIds.size };
    } catch (e) { return null; }
  }

  // ════════════════════════════════════════════════════════
  // 구독 해제
  // ════════════════════════════════════════════════════════
  function unsubscribeAll() {
    if (_unsubVerse) { _unsubVerse(); _unsubVerse = null; }
    if (_unsubFamily) { _unsubFamily(); _unsubFamily = null; }
  }

  return {
    init, ready, getDeviceId,
    saveVerse, getLatestVerse, subscribeVerse,
    saveFamily, joinFamily, subscribeFamily,
    saveRecord, hasRecord,
    getDashboardStats, getFamilyStats,
    unsubscribeAll,
  };
})();
