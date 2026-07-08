// ====== PAT Bible — bible-loader.js ======
// 최초 실행 시 krv.json → IndexedDB 시딩. 버전이 바뀔 때만 다시 저장(마이그레이션).
// 완료 기록(reading_progress)은 절대 건드리지 않는다(데이터 보존).
// 순수 로직(needsSeed / planRowsFromPatPlan)은 node 테스트로 검증한다.

(function(global){
  'use strict';

  // 저장된 버전과 파일 버전 비교 → 시딩 필요 여부
  function needsSeed(fileVersion, storedVersion, verseCount){
    if(!verseCount || verseCount<=0) return true;      // 데이터 없음
    return String(storedVersion||'') !== String(fileVersion||''); // 버전 변경
  }

  // PAT_PLAN({"MM-DD":[si,ot,nt,pr]}) → reading_plan 행 배열
  // planId = `${date}:${sectionType}` (안정적·유니크 → 중복 저장 방지)
  function planRowsFromPatPlan(plan, parseRefFn){
    const pr = parseRefFn || (typeof parseRef!=='undefined' ? parseRef : null);
    const SECTIONS = [['si',0],['ot',1],['nt',2],['pr',3]];
    const rows = [];
    Object.keys(plan||{}).forEach(date=>{
      const arr = plan[date] || [];
      SECTIONS.forEach(([sectionType, idx], order)=>{
        const raw = arr[idx] || '';
        if(!raw) return;
        let bookId=null, sc=null, sv=null, ec=null, ev=null;
        if(pr){
          const ref = pr(sectionType, raw);
          if(ref){
            bookId = ref.bookId;
            if(ref.spec){ sc=ref.spec.startCh; sv=ref.spec.startV; ec=ref.spec.endCh; ev=ref.spec.endV; }
          }
        }
        rows.push({
          planId: date+':'+sectionType,
          date, sectionType, order,
          displayText: raw,
          bookId, startChapter:sc, startVerse:sv, endChapter:ec, endVerse:ev
        });
      });
    });
    return rows;
  }

  const PURE = { needsSeed, planRowsFromPatPlan };
  if(typeof module!=='undefined' && module.exports){ module.exports = PURE; }
  if(global && global.window===global){ Object.assign(global, PURE); }
  if(typeof window==='undefined') return;   // node(테스트)면 여기서 종료

  // ── 아래는 브라우저 전용(IndexedDB 시딩) ──────────────────
  const DB = window.PAT_BIBLE_DB;
  const META_VER = 'bible_version';
  const META_PLAN = 'plan_version';

  async function _seedBible(json){
    if(json.books)   await DB.putAll('books',   json.books);
    if(json.chapters)await DB.putAll('chapters',json.chapters);
    if(json.verses)  await DB.putAll('verses',  json.verses);
    await DB.metaSet(META_VER, json.version || 'unknown');
  }

  async function _seedPlan(){
    const plan = window.PAT_PLAN || {};
    const ver  = window.PAT_PLAN_VERSION || 'pat-plan-2026';
    const rows = planRowsFromPatPlan(plan, window.parseRef);
    if(rows.length) await DB.putAll('reading_plan', rows);
    await DB.metaSet(META_PLAN, ver);
  }

  // 앱 시작 시 1회 호출. 이미 최신이면 아무것도 하지 않음(중복 저장 방지).
  async function initBibleData(){
    if(!DB || !DB.supported()){ console.warn('[bible] IndexedDB 미지원 — 로컬 성경 저장 생략'); return {seeded:false}; }
    try{
      const [storedVer, vcount] = await Promise.all([ DB.metaGet(META_VER), DB.count('verses') ]);
      let seeded = false;
      // 1) 가벼운 버전 매니페스트만 먼저 확인 → 전체 7MB 매번 다운로드 방지
      let remoteVer = null;
      try{
        const vr = await fetch('data/bible/krv.version.json', {cache:'no-store'});
        if(vr.ok){ const vj = await vr.json(); remoteVer = vj && vj.version; }
      }catch(e){ /* 오프라인: 이미 저장돼 있으면 그대로 사용 */ }
      // 2) 버전이 바뀌었거나(=업데이트) 아직 데이터가 없을 때만 전체 본문 다운로드
      const wantSeed = remoteVer ? needsSeed(remoteVer, storedVer, vcount) : (!vcount || vcount<=0);
      if(wantSeed){
        try{
          const res = await fetch('data/bible/krv.json', {cache:'no-store'});
          if(res.ok){
            const json = await res.json();
            if(needsSeed(json.version, storedVer, vcount)){
              await _seedBible(json);
              seeded = true;
              console.log('[bible] 성경 데이터 저장 완료 v='+json.version+' (verses '+(json.verses?json.verses.length:0)+')');
            }
          }
        }catch(e){ /* 오프라인: 기존 저장 데이터 사용 */ }
      }
      // 읽기표 시딩(버전 다르면 갱신)
      const [storedPlan, pcount] = await Promise.all([ DB.metaGet(META_PLAN), DB.count('reading_plan') ]);
      const planVer = window.PAT_PLAN_VERSION || 'pat-plan-2026';
      if(!pcount || String(storedPlan||'')!==String(planVer)){
        await _seedPlan();
        seeded = true;
        console.log('[bible] 읽기표 저장 완료 v='+planVer);
      }
      return {seeded};
    }catch(e){
      console.warn('[bible] 초기화 실패(비치명적):', e && e.message);
      return {seeded:false, error:e && e.message};
    }
  }

  window.initBibleData = initBibleData;
})(typeof globalThis!=='undefined'?globalThis:this);
