// v177 자가치유 검증 — 서버 doneToday=false 확정 시, 로컬에 남은 server-sync
// '자동배치 플레이스홀더'만 정리하고 실제 점수 기록/과거 기록은 보존하는지 확인.
// (family.js syncFamilyProgressFromCloud 의 프루닝 규칙을 그대로 복제해 검증)
const assert = require('assert');

function _localDateStr(d){
  const x = (d instanceof Date) ? d : new Date(d);
  if(isNaN(x.getTime())) return '';
  const p=n=>(n<10?'0':'')+n;
  return x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate());
}
const todayKey = () => _localDateStr(new Date());
function localAt(daysAgo){ const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-daysAgo); return d.toISOString(); }

const VERSE = '베드로전서2장19절';

// family.js 의 프루닝 규칙 복제
function pruneIfCloudNotDone(recs){
  const today = todayKey();
  return recs.filter(r => !(
    r._src === 'server-sync' &&
    r.ref === VERSE &&
    (r.completedAt || r.date) &&
    _localDateStr(r.completedAt || r.date) === today
  ));
}
// v176 본인 완료 표시 판정(오늘+현재구절)
function meDoneToday(recs){
  const today = todayKey();
  return recs.some(r => { const ts=r.completedAt||r.date; return r.ref===VERSE && ts && _localDateStr(ts)===today; });
}

let pass=0; const ok=(n,c)=>{assert.ok(c,'❌ '+n);console.log('✅',n);pass++;};

// 1) 오늘 server-sync 플레이스홀더 잔존 → 서버 미완료 확정 시 제거되어 미완료로 표시
{
  const recs = [{ ref:VERSE, completedAt:localAt(0), _src:'server-sync' }];
  ok('치유 전: 플레이스홀더로 잘못된 완료', meDoneToday(recs) === true);
  const healed = pruneIfCloudNotDone(recs);
  ok('치유 후: 플레이스홀더 제거', healed.length === 0);
  ok('치유 후: 미완료로 정상 표시', meDoneToday(healed) === false);
}

// 2) 실제 점수가 담긴 진짜 완료 기록은 절대 삭제하지 않음(오늘 완료는 유지)
{
  const recs = [{ ref:VERSE, completedAt:localAt(0), voiceScore1:90, voiceScore2:88, typeScore1:100, typeScore2:100 }];
  const healed = pruneIfCloudNotDone(recs);
  ok('진짜 완료기록 보존(길이 유지)', healed.length === 1);
  ok('진짜 완료는 오늘 완료로 유지', meDoneToday(healed) === true);
}

// 3) 과거 날짜 server-sync 플레이스홀더는 오늘 프루닝 대상 아님(이미 날짜필터로 무해) + 보존
{
  const recs = [{ ref:VERSE, completedAt:localAt(3), _src:'server-sync' }];
  const healed = pruneIfCloudNotDone(recs);
  ok('과거 플레이스홀더 보존', healed.length === 1);
  ok('과거 플레이스홀더는 오늘 표시에 영향 없음', meDoneToday(healed) === false);
}

// 4) 다른 구절의 오늘 server-sync 플레이스홀더는 건드리지 않음
{
  const recs = [{ ref:'다른구절', completedAt:localAt(0), _src:'server-sync' }];
  const healed = pruneIfCloudNotDone(recs);
  ok('다른 구절 플레이스홀더 보존', healed.length === 1);
}

// 5) 혼합: 오늘 플레이스홀더 + 과거 진짜기록 → 플레이스홀더만 제거, 과거 보존
{
  const recs = [
    { ref:VERSE, completedAt:localAt(5), voiceScore1:95, voiceScore2:95, typeScore1:100, typeScore2:100 },
    { ref:VERSE, completedAt:localAt(0), _src:'server-sync' },
  ];
  const healed = pruneIfCloudNotDone(recs);
  ok('혼합: 1건만 제거(과거 진짜기록 보존)', healed.length === 1);
  ok('혼합: 남은 건 진짜 과거기록', healed[0]._src === undefined);
  ok('혼합: 오늘 표시는 미완료', meDoneToday(healed) === false);
}

console.log(`\n🎉 통과 ${pass}/${pass}`);
