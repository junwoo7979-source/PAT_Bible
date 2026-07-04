// 암송 완료 판정 SSOT(단일 진실 공급원) 검증
// family.js/memorize.js 의 완료 규칙을 그대로 복제해, "안 했는데 완료" 오류가
// 구조적으로 불가능함을 시나리오 ①~⑧로 확인한다.
const assert = require('assert');

// ── app-core.js 의 임계값 복제 ──
let LENIENT = false;
const TH = () => LENIENT ? { voice:80, typing:100 } : { voice:85, typing:100 };

// ── memorize.js 의 완료 판정 SSOT 복제 ──
// 읽기(음성) 2회 AND 쓰기(타이핑) 2회 모두 임계값 이상이어야만 완료.
function isMemorizeComplete(s){
  const th = TH();
  const readOK  = (s.voiceScore1 >= th.voice)  && (s.voiceScore2 >= th.voice);
  const writeOK = (s.typeScore1  >= th.typing) && (s.typeScore2  >= th.typing);
  return readOK && writeOK;
}

// ── completeMemorize 의 게이트+기록 생성 복제 ──
// 완료가 아니면 pat_records 에 기록을 만들지 않는다(add-only, 위조 없음).
function completeMemorize(state, records){
  if(!isMemorizeComplete(state)) return { wrote:false, records };
  records.push({ ref: state.ref, completedAt: new Date().toISOString(), badge:'weekly_complete' });
  return { wrote:true, records };
}

// ── family.js 의 홈 완료 표시(오늘 KST 필터) 복제 ──
function _localDateStr(d){
  const x=(d instanceof Date)?d:new Date(d); if(isNaN(x.getTime())) return '';
  const p=n=>(n<10?'0':'')+n; return x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate());
}
const todayKey=()=>_localDateStr(new Date());
function homeShowsDone(records, verseRef){
  const t=todayKey();
  return records.some(r=>{ const ts=r.completedAt||r.date; return r.ref===verseRef && ts && _localDateStr(ts)===t; });
}
function localAt(daysAgo){ const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-daysAgo); return d.toISOString(); }

const VERSE='시편 1:1';
let pass=0; const ok=(n,c)=>{ assert.ok(c,'❌ '+n); console.log('✅',n); pass++; };

// ── 시나리오 ①~⑤: 완료 판정 게이트 ──
// ① 아무것도 안 함 → 미완료 (기록 생성 안 됨)
{
  const st={ref:VERSE,voiceScore1:0,voiceScore2:0,typeScore1:0,typeScore2:0};
  ok('① 아무것도 안함 → 미완료', isMemorizeComplete(st)===false);
  ok('① 기록 미생성', completeMemorize(st,[]).wrote===false);
}
// ② 읽기 1회만 → 미완료
{
  const st={ref:VERSE,voiceScore1:90,voiceScore2:0,typeScore1:0,typeScore2:0};
  ok('② 읽기 1회만 → 미완료', isMemorizeComplete(st)===false);
  ok('② 기록 미생성', completeMemorize(st,[]).wrote===false);
}
// ③ 읽기 2회만(쓰기 X) → 미완료
{
  const st={ref:VERSE,voiceScore1:90,voiceScore2:88,typeScore1:0,typeScore2:0};
  ok('③ 읽기 2회만 → 미완료', isMemorizeComplete(st)===false);
  ok('③ 기록 미생성', completeMemorize(st,[]).wrote===false);
}
// ④ 쓰기 1회만 → 미완료
{
  const st={ref:VERSE,voiceScore1:90,voiceScore2:88,typeScore1:100,typeScore2:0};
  ok('④ 쓰기 1회만 → 미완료', isMemorizeComplete(st)===false);
  ok('④ 기록 미생성', completeMemorize(st,[]).wrote===false);
}
// ⑤ 읽기 2회 + 쓰기 2회 모두 통과 → 완료 (기록 1건 생성)
{
  const st={ref:VERSE,voiceScore1:90,voiceScore2:88,typeScore1:100,typeScore2:100};
  ok('⑤ 읽기2+쓰기2 → 완료', isMemorizeComplete(st)===true);
  const r=completeMemorize(st,[]);
  ok('⑤ 기록 1건 생성', r.wrote===true && r.records.length===1);
}
// ⑤-b 경계: 타이핑은 100%만 통과 (99%면 미완료)
{
  const st={ref:VERSE,voiceScore1:90,voiceScore2:90,typeScore1:100,typeScore2:99};
  ok('⑤b 타이핑 99% → 미완료(경계)', isMemorizeComplete(st)===false);
}
// ⑤-c 경계: 음성 임계값 미만(84%) → 미완료
{
  const st={ref:VERSE,voiceScore1:84,voiceScore2:90,typeScore1:100,typeScore2:100};
  ok('⑤c 음성 84% → 미완료(경계 85)', isMemorizeComplete(st)===false);
}

// ── 시나리오 ⑥⑦: 새로고침/앱 재실행 후 상태 유지 ──
// 완료 기록은 pat_records(영구)에 저장되므로, 메모리 상태를 날려도 표시가 유지된다.
{
  const st={ref:VERSE,voiceScore1:90,voiceScore2:90,typeScore1:100,typeScore2:100};
  const { records }=completeMemorize(st,[]);
  // 새로고침/재실행 = 메모리 변수 초기화, records는 localStorage에서 재로드
  ok('⑥ 새로고침 후 완료 유지', homeShowsDone(records,VERSE)===true);
  ok('⑦ 앱 재실행 후 완료 유지', homeShowsDone(JSON.parse(JSON.stringify(records)),VERSE)===true);
}

// ── 시나리오 ⑧: 날짜 변경 — 과거 기록 보존, 오늘은 새 상태로 시작 ──
{
  const records=[{ref:VERSE,completedAt:localAt(1)}]; // 어제 완료만
  ok('⑧ 어제 기록 보존(삭제 안 됨)', records.length===1);
  ok('⑧ 오늘 화면은 미완료로 시작', homeShowsDone(records,VERSE)===false);
  // 오늘 다시 완료하면 어제 기록은 그대로, 오늘 기록이 추가됨
  const st={ref:VERSE,voiceScore1:90,voiceScore2:90,typeScore1:100,typeScore2:100};
  const r=completeMemorize(st,records);
  ok('⑧ 오늘 완료 시 어제+오늘 = 2건(과거 보존)', r.records.length===2);
  ok('⑧ 오늘 완료 후 오늘 표시=완료', homeShowsDone(r.records,VERSE)===true);
}

// ── 관대 모드에서도 SSOT 일관 ──
{
  LENIENT=true;
  const st={ref:VERSE,voiceScore1:82,voiceScore2:82,typeScore1:100,typeScore2:100};
  ok('관대모드 음성 82% → 완료(기준 80)', isMemorizeComplete(st)===true);
  LENIENT=false;
  ok('일반모드 음성 82% → 미완료(기준 85)', isMemorizeComplete(st)===false);
}

console.log(`\n🎉 통과 ${pass}/${pass}`);
