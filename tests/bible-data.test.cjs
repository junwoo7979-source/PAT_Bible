'use strict';
// PAT Bible — 개역한글 성경 데이터/읽기표 연동 로직 테스트 (필수 8 시나리오)
// 순수 로직 검증(브라우저 IndexedDB 런타임은 Playwright로 별도 확인).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const P = require('../app/js/bible-passage.js');
const L = require('../app/js/bible-loader.js');
const R = require('../app/js/reading-progress.js');

const KRV = JSON.parse(fs.readFileSync(path.join(__dirname,'..','app','data','bible','krv.json'),'utf8'));
const PLAN_SRC = fs.readFileSync(path.join(__dirname,'..','app','js','reading-plan.js'),'utf8');
const PAT_PLAN = JSON.parse(PLAN_SRC.match(/window\.PAT_PLAN=(\{.*\});?\s*$/s)[1]);

let pass=0;
function t(name, fn){ fn(); pass++; console.log('  ✓ '+name); }

// 절 인덱스: (bookId.ch) → [verses]  (전체 3만절 반복 필터 방지)
const _VIDX = new Map();
for(const v of KRV.verses){
  const k = v.bookId+'.'+v.chapterNumber;
  if(!_VIDX.has(k)) _VIDX.set(k, []);
  _VIDX.get(k).push(v);
}
for(const arr of _VIDX.values()) arr.sort((a,b)=>a.verseNumber-b.verseNumber);
// 로컬 IDB 대체: krv.json 절 배열에서 (bookId,chapter) 절 조회
function chapterVerses(bookId, ch){
  return _VIDX.get(bookId+'.'+ch) || [];
}
// parsed spec으로 본문 절들 선택 (reading.js _loadPassageHtml 과 동일 로직)
function selectVerses(track, raw){
  const ref=P.parseRef(track, raw);
  if(!ref || !ref.segments) return [];
  const out=[];
  for(const seg of ref.segments){
    if(!seg.spec) continue;
    (P.chaptersInSpec(seg.spec)||[]).forEach(ch=>{
      chapterVerses(seg.bookId, ch).forEach(v=>{
        if(P.verseInSpec(seg.spec, v.chapterNumber, v.verseNumber)) out.push(v);
      });
    });
  }
  return out;
}

console.log('bible-data.test:');

// ── 1) 최초 실행 시 저장 필요 판정 ──────────────────────
t('1. 최초 실행: 저장된 버전 없음 → 시딩 필요', ()=>{
  assert.equal(L.needsSeed(KRV.version, undefined, 0), true);
  assert.equal(L.needsSeed(KRV.version, null, 0), true);
});

// ── 2) 재실행 시 중복 저장 안 함 ────────────────────────
t('2. 재실행: 같은 버전 + 데이터 있음 → 시딩 안 함(중복 방지)', ()=>{
  assert.equal(L.needsSeed(KRV.version, KRV.version, KRV.verses.length), false);
});

// ── 3) 읽기표가 날짜별로 정상 매핑 ──────────────────────
t('3. 날짜별 읽기표: PAT_PLAN → reading_plan 행(날짜·트랙·planId 유니크)', ()=>{
  const rows = L.planRowsFromPatPlan(PAT_PLAN, P.parseRef);
  const jan1 = rows.filter(r=>r.date==='01-01');
  assert.equal(jan1.length, 4);                         // si/ot/nt/pr
  const ot = jan1.find(r=>r.sectionType==='ot');
  assert.equal(ot.planId, '01-01:ot');
  assert.equal(ot.bookId, 'GEN');                       // "창 1~2" → 창세기
  assert.equal(ot.startChapter, 1);
  assert.equal(ot.endChapter, 2);
  // planId 전체 유니크 (중복 저장 방지)
  const ids = rows.map(r=>r.planId);
  assert.equal(new Set(ids).size, ids.length);
});

// ── 4) 읽기표 ↔ 성경 본문 정확 연결 ─────────────────────
t('4. 본문 연결: "창 1~2" → 창세기 1장 절, "시 1" → 시편 1편 6절', ()=>{
  const gen = selectVerses('ot','창 1~2');
  assert.ok(gen.length>=5);
  assert.equal(gen[0].text, '태초에 하나님이 천지를 창조하시니라');
  const psa = selectVerses('si','1');                   // 01-01 시편 트랙 값="1"
  assert.equal(psa.length, 6);
  assert.equal(psa[0].bookId, 'PSA');
  // 절 범위 파싱: "18:1~24" (시편 트랙, 01-18)
  const spec = P.parseChapterSpec('18:1~24');
  assert.deepEqual(spec, {startCh:18,startV:1,endCh:18,endV:24});
  assert.equal(P.verseInSpec(spec,18,1), true);
  assert.equal(P.verseInSpec(spec,18,25), false);
});

// ── 5) 오프라인 표시 가능(로컬 데이터로 본문 구성) ───────
t('5. 오프라인: 로컬 절 데이터만으로 본문 구성 → 빈 화면 아님', ()=>{
  const nt = selectVerses('nt','요 3');
  assert.ok(nt.length>=1);                              // 요한복음 3:16 포함
  assert.ok(nt.some(v=>v.verseNumber===16 && /독생자/.test(v.text)));
});

// ── 6) 온라인 복구 시 서버 동기화 병합 ──────────────────
t('6. 동기화: 로컬+서버 병합 시 id 기준 중복 없음·synced 처리', ()=>{
  const local=[{id:'u|2026-01-01|01-01:ot', synced:0, status:'done'}];
  const server=[{id:'u|2026-01-01|01-01:ot', status:'done'},
                {id:'u|2026-01-01|01-01:si', status:'done'}];
  const merged=R.mergeServer(local, server);
  assert.equal(merged.length, 2);                       // 중복 1건 병합
  merged.forEach(m=>assert.equal(m.synced,1));          // 서버 확정 → synced
});

// ── 7) 같은 본문 중복 완료 방지 ─────────────────────────
t('7. 중복 완료 방지: 같은 (user,date,plan) → 동일 id(행 1개)', ()=>{
  const a=R.progressId('철수','2026-01-01','01-01:ot');
  const b=R.progressId('철수','2026-01-01','01-01:ot');
  assert.equal(a, b);
  assert.notEqual(a, R.progressId('철수','2026-01-01','01-01:si'));
  // 두 번 완료해도 id 같음 → put 시 덮어써 1건 유지
  const rows=R.mergeServer([{id:a,synced:0}], [{id:b}]);
  assert.equal(rows.length, 1);
});

// ── 8) 앱 업데이트(버전 변경) 후 기존 기록 유지 ─────────
t('8. 업데이트: 성경 버전 변경 시 재시딩하되 완료기록 스토어는 미변경', ()=>{
  // 버전이 바뀌면 성경만 재시딩 필요
  assert.equal(L.needsSeed('krv-2.0', 'krv-sample-2026-07-09', 100), true);
  // 로더는 reading_progress 를 절대 건드리지 않아야 함(소스 정적 확인)
  const loaderSrc = fs.readFileSync(path.join(__dirname,'..','app','js','bible-loader.js'),'utf8');
  assert.ok(!/putAll\(\s*['"]reading_progress/.test(loaderSrc));   // 완료기록에 쓰기 없음
  assert.ok(!/\.put\(\s*['"]reading_progress/.test(loaderSrc));    // 개별 쓰기도 없음
});

// ── 9) 오늘 읽기표 4개 트랙 전부 본문 연결 (07-06 실제 통독일) ──
t('9. 4트랙 전부 렌더: 시편6·역대하11~12·행16:16~40·잠언6 + 잠언1', ()=>{
  assert.equal(selectVerses('si','6').length, 10);          // 시편 6편
  assert.equal(selectVerses('ot','대하 11~12').length, 39); // 역대하 11~12장
  assert.equal(selectVerses('nt','행 16:16~40').length, 25);// 사도행전 16:16~40
  assert.equal(selectVerses('pr','6').length, 35);          // 잠언 6장
  assert.equal(selectVerses('pr','1').length, 33);          // 잠언 1장(요청)
  // 신약 절범위 정확성: 16:16 포함, 16:15/16:41 미포함
  const act=selectVerses('nt','행 16:16~40');
  assert.ok(act.every(v=>v.verseNumber>=16 && v.verseNumber<=40));
  assert.equal(act[0].verseNumber, 16);
});

// ── 10) 365일 전체 통독표 × 4트랙 완전 연동 (전체 성경 데이터 전제) ──
t('10. 통독표 전 날짜×4트랙 모두 실제 본문 연결(누락 0)', ()=>{
  const TRACKS=[['si',0],['ot',1],['nt',2],['pr',3]];
  const dates=Object.keys(PAT_PLAN);
  let checked=0; const missing=[];
  for(const date of dates){
    const arr=PAT_PLAN[date];
    for(const [tk,idx] of TRACKS){
      const raw=arr[idx]; if(!raw) continue;
      checked++;
      if(selectVerses(tk, raw).length===0) missing.push(date+' '+tk+' "'+raw+'"');
    }
  }
  if(missing.length){ console.log('   누락 예:', missing.slice(0,10).join(' | ')); }
  assert.equal(missing.length, 0, missing.length+'건 본문 누락');
  assert.ok(dates.length>=365, '통독표 날짜 '+dates.length);
  console.log('   → '+dates.length+'일 × 4트랙 = '+checked+'개 참조 전부 본문 연결됨');
});

console.log('bible-data.test: '+pass+'개 통과 ✅');
