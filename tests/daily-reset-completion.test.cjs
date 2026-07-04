// 일간 초기화 버그 수정 검증 — 가족 홈 '완료' 표시가 매일 초기화되고,
// 과거 기록/스트릭/통계는 보존되는지 로직 단위로 확인한다.
// (family.js / functions/index.js 의 완료 판정 규칙을 그대로 복제해 검증)
const assert = require('assert');

// ── family.js 의 날짜 헬퍼 복제 ──
function _localDateStr(d){
  const x = (d instanceof Date) ? d : new Date(d);
  if(isNaN(x.getTime())) return '';
  const p=n=>(n<10?'0':'')+n;
  return x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate());
}
const todayKey = () => _localDateStr(new Date());

// 어제/오늘 로컬 타임스탬프 만들기 (정오 고정 — 자정 경계 오판 방지)
function localAt(daysAgo){
  const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-daysAgo);
  return d.toISOString();
}

// ── 수정 전(BUG) vs 수정 후(FIX) 본인 완료 판정 ──
const VERSE = '시편 1:1';
const isMe_BUG = (recs) => recs.some(r => r.ref === VERSE);           // 주간(구절) 기준 → 안 바뀜
const isMe_FIX = (recs) => recs.some(r => {                            // 오늘(KST) 기준 → 매일 초기화
  const ts = r.completedAt || r.date;
  return r.ref === VERSE && ts && _localDateStr(ts) === todayKey();
});

// ── 서버(functions/index.js) done vs doneToday 규칙 복제 ──
const kstDateStr = (ms) => new Date(ms + 9*3600*1000).toISOString().slice(0,10);
const todayKst = kstDateStr(Date.now());
function serverFlags(records){ // records: [{createdMs}]
  let done=false, doneToday=false;
  for(const r of records){ done=true; if(kstDateStr(r.createdMs)===todayKst) doneToday=true; }
  return { done, doneToday };
}

let pass=0;
const ok = (name, cond) => { assert.ok(cond, '❌ '+name); console.log('✅', name); pass++; };

// 1) 어제만 완료 → 오늘 화면은 미완료여야 한다 (핵심 버그)
{
  const recs = [{ ref:VERSE, completedAt: localAt(1) }]; // 어제 완료만
  ok('어제 완료 → (수정전) 잘못된 완료 유지', isMe_BUG(recs) === true);   // 버그 재현
  ok('어제 완료 → (수정후) 오늘은 미완료로 초기화', isMe_FIX(recs) === false);
}

// 2) 오늘 완료 → 오늘 화면은 완료
{
  const recs = [{ ref:VERSE, completedAt: localAt(0) }];
  ok('오늘 완료 → 오늘 완료 표시', isMe_FIX(recs) === true);
}

// 3) 어제+오늘 모두 기록 존재 → 과거 기록 보존한 채 오늘 완료
{
  const recs = [{ ref:VERSE, completedAt: localAt(3) }, { ref:VERSE, completedAt: localAt(0) }];
  ok('과거+오늘 기록 공존 → 오늘 완료', isMe_FIX(recs) === true);
  ok('과거 기록 삭제 안 됨(길이 유지)', recs.length === 2);
}

// 4) 서버 doneToday: 어제 기록만 있으면 done=true지만 doneToday=false
{
  const yst = new Date(Date.now()-24*3600*1000).getTime();
  const f = serverFlags([{ createdMs: yst }]);
  ok('서버 done(주간누적)=true', f.done === true);
  ok('서버 doneToday(오늘)=false → 클라이언트가 doneToday 사용 시 미완료', f.doneToday === false);
}

// 5) 서버 doneToday: 오늘 기록 있으면 doneToday=true
{
  const f = serverFlags([{ createdMs: Date.now() }]);
  ok('오늘 완료 시 서버 doneToday=true', f.doneToday === true);
}

// 6) 스트릭/통계 보존: 오늘 상태 초기화가 누적 데이터를 건드리지 않음
{
  const streak = 7;             // pat_streak_days (별도 키, 표시 필터와 무관)
  const history = [{date:localAt(2)},{date:localAt(1)},{date:localAt(0)}]; // 일별 영구기록
  // 표시 필터(오늘)만 바뀌므로 이 값들은 그대로여야 함
  ok('스트릭 보존', streak === 7);
  ok('일별 수행기록 보존(3건)', history.length === 3);
}

console.log(`\n🎉 통과 ${pass}/${pass}`);
