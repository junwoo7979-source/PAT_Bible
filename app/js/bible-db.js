// ====== PAT Bible — bible-db.js ======
// IndexedDB 저장소 래퍼. 성경 본문/읽기표/완료기록을 기기 내부에 저장한다.
// 스토어: books, chapters, verses, reading_plan, app_meta, reading_progress
// 브라우저 전용(테스트에서는 로드하지 않음). 순수 로직은 bible-passage.js 참조.

window.PAT_BIBLE_DB = (() => {
  const DB_NAME = 'pat_bible';
  const DB_VER  = 1;
  let _dbPromise = null;

  function supported(){ return typeof indexedDB !== 'undefined' && !!indexedDB; }

  function open(){
    if(_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if(!supported()){ reject(new Error('IndexedDB 미지원')); return; }
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if(!db.objectStoreNames.contains('books')){
          const s = db.createObjectStore('books', {keyPath:'bookId'});
          s.createIndex('byOrder', 'order', {unique:false});
        }
        if(!db.objectStoreNames.contains('chapters')){
          const s = db.createObjectStore('chapters', {keyPath:'chapterId'});
          s.createIndex('byBook', 'bookId', {unique:false});
        }
        if(!db.objectStoreNames.contains('verses')){
          const s = db.createObjectStore('verses', {keyPath:'verseId'});
          // 장 단위 조회 인덱스: [bookId, chapterNumber]
          s.createIndex('byChapter', ['bookId','chapterNumber'], {unique:false});
        }
        if(!db.objectStoreNames.contains('reading_plan')){
          const s = db.createObjectStore('reading_plan', {keyPath:'planId'});
          s.createIndex('byDate', 'date', {unique:false});
        }
        if(!db.objectStoreNames.contains('app_meta')){
          db.createObjectStore('app_meta', {keyPath:'key'});
        }
        if(!db.objectStoreNames.contains('reading_progress')){
          // id = `${userId}|${date}|${planId}` → 유니크 제약 = 중복 완료 방지
          const s = db.createObjectStore('reading_progress', {keyPath:'id'});
          s.createIndex('byUserDate', ['userId','date'], {unique:false});
          s.createIndex('bySynced', 'synced', {unique:false});
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    return _dbPromise;
  }

  function _tx(db, store, mode){ return db.transaction(store, mode).objectStore(store); }
  function _wrap(req){ return new Promise((res,rej)=>{ req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); }); }

  // 여러 건 일괄 저장(하나의 트랜잭션 → 빠르고 원자적)
  async function putAll(store, items){
    if(!items || !items.length) return 0;
    const db = await open();
    return new Promise((res,rej)=>{
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      for(const it of items) os.put(it);
      tx.oncomplete = () => res(items.length);
      tx.onerror    = () => rej(tx.error);
      tx.onabort    = () => rej(tx.error);
    });
  }

  async function put(store, item){ const db=await open(); return _wrap(_tx(db,store,'readwrite').put(item)); }
  async function get(store, key){ const db=await open(); return _wrap(_tx(db,store,'readonly').get(key)); }
  async function count(store){ const db=await open(); return _wrap(_tx(db,store,'readonly').count()); }

  async function getAll(store){ const db=await open(); return _wrap(_tx(db,store,'readonly').getAll()); }

  // 인덱스 + IDBKeyRange 조회
  async function getByIndex(store, index, range){
    const db=await open();
    return _wrap(_tx(db,store,'readonly').index(index).getAll(range));
  }

  // 한 장(bookId, chapter)의 절 전체 (verseNumber 오름차순 정렬)
  async function getChapterVerses(bookId, chapter){
    const range = IDBKeyRange.only([bookId, chapter]);
    const rows = await getByIndex('verses','byChapter', range);
    return (rows||[]).sort((a,b)=> (a.verseNumber||0)-(b.verseNumber||0));
  }

  // app_meta 헬퍼
  async function metaGet(key){ const r=await get('app_meta', key); return r ? r.value : undefined; }
  async function metaSet(key, value){ return put('app_meta', {key, value}); }

  // reading_progress: 유저·날짜 기준 조회
  async function progressByUserDate(userId, date){
    return getByIndex('reading_progress','byUserDate', IDBKeyRange.only([userId, date]));
  }
  async function unsyncedProgress(){
    // synced=false 인 것만 (인덱스는 0/1 저장 → 0 조회)
    return getByIndex('reading_progress','bySynced', IDBKeyRange.only(0));
  }

  return {
    supported, open, putAll, put, get, getAll, count, getByIndex,
    getChapterVerses, metaGet, metaSet, progressByUserDate, unsyncedProgress
  };
})();
