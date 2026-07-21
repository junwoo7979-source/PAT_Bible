// ====== PAT Bible — reading-progress.js ======
// 오늘 읽기 완료 기록. 로컬(IndexedDB) 우선 저장 → 온라인 복구 시 서버 동기화.
// 유니크 제약(id=userId|date|planId)으로 중복 완료를 원천 차단한다.
// 순수 로직(progressId / mergeServer)은 node 테스트로 검증한다.

(function(global){
  'use strict';

  // 중복 방지 키: 같은 (userId,date,planId)는 항상 같은 id → put 시 덮어씀(행 1개 유지)
  function progressId(userId, date, planId){
    return String(userId||'anon')+'|'+String(date||'')+'|'+String(planId||'');
  }

  // 서버 기록 배열과 로컬 배열 병합: id 기준, synced=true 우선(중복 저장 방지)
  function mergeServer(localRows, serverRows){
    const byId = {};
    (localRows||[]).forEach(r=>{ byId[r.id]=r; });
    (serverRows||[]).forEach(r=>{
      const ex = byId[r.id];
      if(!ex){ byId[r.id] = {...r, synced:1}; }
      else { byId[r.id] = {...ex, ...r, synced:1}; }  // 서버 확정 → synced 처리
    });
    return Object.keys(byId).map(k=>byId[k]);
  }

  // ── v2: 읽기·듣기 분리 완료 필드 ──────────────────────
  // 레거시 행(status:'done')은 "읽기 완료"로만 해석한다(듣기 완료로 승격 금지).
  // 기존 필드 id,userId,date,planId,status,completedAt,synced 와 id 값은 그대로 보존.
  function normalizeProgress(row){
    if(!row) return row;
    if(row.progressSchemaVersion === 2) return row;      // 멱등
    const readDone = row.status === 'done';
    return {
      ...row,
      progressSchemaVersion: 2,
      readDone: readDone,
      listenDone: false,
      readAt: readDone ? (row.completedAt || null) : null,
      listenAt: null
    };
  }

  // mode: 'read' | 'listen'. 최초 completedAt 보존, status 파생, synced 초기화(재동기 대상).
  function applyCompletion(row, mode, at){
    const r = normalizeProgress(row);
    const next = {...r, synced: 0};
    if(mode === 'listen'){ next.listenDone = true; next.listenAt = r.listenAt || at; }
    else { next.readDone = true; next.readAt = r.readAt || at; }
    next.status = (next.readDone || next.listenDone) ? 'done' : 'pending';
    next.completedAt = r.completedAt || at;              // 최초 완료 시각 보존
    return next;
  }

  // 두 완료 모드를 의도적으로 모두 해제(사용자 명시 액션 전용)
  function clearCompletion(row){
    const r = normalizeProgress(row);
    return {
      ...r,
      readDone: false, listenDone: false,
      readAt: null, listenAt: null,
      status: 'pending', completedAt: null,
      synced: 0
    };
  }

  const PURE = { progressId, mergeServer, normalizeProgress, applyCompletion, clearCompletion };
  if(typeof module!=='undefined' && module.exports){ module.exports = PURE; }
  if(global && global.window===global){ Object.assign(global, PURE); }
  if(typeof window==='undefined') return;   // node(테스트) 종료

  // ── 브라우저 전용 ────────────────────────────────────
  const DB = window.PAT_BIBLE_DB;

  function _todayDate(){
    try{ return (typeof todayKey==='function') ? todayKey() : new Date().toISOString().slice(0,10); }
    catch(e){ return new Date().toISOString().slice(0,10); }
  }
  function _userId(){
    try{
      if(typeof currentPrayerMember==='function'){ const m=currentPrayerMember(); if(m) return m; }
    }catch(e){}
    try{ return localStorage.getItem('pat_member_name') || 'anon'; }catch(e){ return 'anon'; }
  }

  // 완료 저장(멱등). 같은 모드가 이미 완료면 재저장 안 함.
  async function _applyMode(planId, mode, opts){
    opts = opts||{};
    const userId = opts.userId || _userId();
    const date   = opts.date   || _todayDate();
    const id = progressId(userId, date, planId);
    if(!DB || !DB.supported()) return {ok:false, id, reason:'no-idb'};
    const existing = await DB.get('reading_progress', id).catch(()=>null);
    const base = normalizeProgress(existing || {
      id, userId, date, planId, status:'pending', completedAt:null, synced:0
    });
    const doneField = (mode==='listen') ? 'listenDone' : 'readDone';
    if(base[doneField]) return {ok:true, id, already:true};
    const row = applyCompletion(base, mode, new Date().toISOString());
    await DB.put('reading_progress', row);
    _flushSoon();
    return {ok:true, id, row};
  }

  async function markReadComplete(planId, opts){ return _applyMode(planId, 'read', opts); }
  async function markListenComplete(planId, opts){ return _applyMode(planId, 'listen', opts); }
  // 기존 호출부 호환 별칭 — 읽기 완료와 동일
  async function markComplete(planId, opts){ return markReadComplete(planId, opts); }

  // 두 완료 모드 모두 해제(사용자 명시 액션 전용)
  async function clearComplete(planId, opts){
    opts = opts||{};
    const userId = opts.userId || _userId();
    const date   = opts.date   || _todayDate();
    const id = progressId(userId, date, planId);
    if(!DB || !DB.supported()) return {ok:false, id, reason:'no-idb'};
    const existing = await DB.get('reading_progress', id).catch(()=>null);
    if(!existing) return {ok:true, id, already:true};
    const row = clearCompletion(existing);
    await DB.put('reading_progress', row);
    _flushSoon();
    return {ok:true, id, row};
  }

  async function isComplete(planId, opts){
    opts = opts||{};
    const userId = opts.userId || _userId();
    const date   = opts.date   || _todayDate();
    if(!DB || !DB.supported()) return false;
    const r = await DB.get('reading_progress', progressId(userId,date,planId)).catch(()=>null);
    if(!r) return false;
    const n = normalizeProgress(r);
    return !!(n.readDone || n.listenDone);
  }

  async function listToday(opts){
    opts = opts||{};
    const userId = opts.userId || _userId();
    const date   = opts.date   || _todayDate();
    if(!DB || !DB.supported()) return [];
    return DB.progressByUserDate(userId, date).catch(()=>[]);
  }

  // 서버 동기화(온라인 복구 시). 서버 훅이 있으면 미동기 기록을 밀어 넣고 synced 처리.
  // 훅이 없으면 로컬에 안전하게 남겨둠(비파괴). → 기존 백엔드 변경 불필요.
  let _flushing = false;
  async function syncToServer(){
    if(_flushing) return;
    if(!DB || !DB.supported()) return;
    if(typeof navigator!=='undefined' && navigator.onLine===false) return;
    const pusher = window.PAT_DB && window.PAT_DB.saveReadingProgress; // 선택적 서버 훅
    if(typeof pusher!=='function') return;   // 서버 미연동 → 로컬 보존만
    _flushing = true;
    try{
      const pending = await DB.unsyncedProgress().catch(()=>[]);
      for(const r of pending){
        try{
          const row = normalizeProgress(r);   // 서버 push 전 v2 정규화(id 기준 병합 유지)
          await pusher(row);                  // 서버 upsert(중복은 서버 id로 방지)
          await DB.put('reading_progress', {...row, synced:1});
        }catch(e){ /* 실패 → 다음 기회에 재시도 */ }
      }
    } finally { _flushing = false; }
  }

  let _t=null;
  function _flushSoon(){ clearTimeout(_t); _t=setTimeout(syncToServer, 1500); }

  if(typeof window!=='undefined'){
    window.addEventListener('online', syncToServer);
  }

  window.PAT_READING_PROGRESS = {
    markComplete,                 // 호환 별칭(읽기 완료)
    markReadComplete, markListenComplete, clearComplete,
    isComplete, listToday, syncToServer
  };
})(typeof globalThis!=='undefined'?globalThis:this);
