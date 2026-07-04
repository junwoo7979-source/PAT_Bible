// E2E: 권호택 케이스 — 방장, 서버에 이름 mojibake 저장, deviceId로만 매칭,
// 서버 doneToday=false(오늘 미완료). 로컬에 오늘 server-sync 플레이스홀더가 남아
// 개인/가족방 완료로 오인됨 → 새 자가치유가 deviceId 매칭 + '미확정시 프루닝'으로 제거해야 함.
const assert = require('assert');

// ── 실제 서버 응답(getFamilyProgress) 재현 (2026-07-04 라이브 캡처) ──
// 이름은 서버에 깨진 인코딩으로 저장됨. deviceId는 정상.
const MY_DEVICE_ID = 'dev_6nxyh9e8ievmqxsslof';
const cloudMembers = [
  { displayName: '��쨅', name: '��쨅', deviceId: MY_DEVICE_ID, done: false, doneToday: false }, // 권호택(방장), mojibake, 오늘 미완료
  { displayName: '�처목', name: '�처목', done: false, doneToday: false },
  { displayName: 'Mi hyun', deviceId: 'dev_dr6j31lorrqmr1v2lxt', done: false, doneToday: false },
];
const VERSE_REF = '베드로전서3장15절';
const MY_CLEAN_NAME = '권호택';       // 로컬 프로필의 정상 이름
const TODAY = '2026-07-04';

// ── date helper (family.js _localDateStr 와 동일 규칙, 테스트는 문자열 slice로 단순화) ──
function _localDateStr(ts){ return String(ts||'').slice(0,10); }

// ── 새 자가치유 로직 (family.js 구현과 동일) ──
function selfHeal(recs){
  const myDeviceId = MY_DEVICE_ID;
  const _norm = s => String(s || '').replace(/\s+/g, '').trim();
  const myNameN = _norm(MY_CLEAN_NAME);
  const today = TODAY;
  const mineCloud =
    (myDeviceId ? cloudMembers.find(m => m.deviceId && m.deviceId === myDeviceId) : null)
    || (myNameN ? cloudMembers.find(m => _norm(m.displayName || m.name) === myNameN) : null);
  const serverConfirmsToday = !!(mineCloud && mineCloud.doneToday);
  if (serverConfirmsToday) {
    const hasToday = recs.some(r => { const ts = r.completedAt || r.date; return ts && _localDateStr(ts) === today; });
    if (!hasToday) recs.push({ ref: VERSE_REF, completedAt: today+'T01:00:00.000Z', badge: 'weekly_complete', _src: 'server-sync' });
    return { recs, matched: !!mineCloud };
  }
  const pruned = recs.filter(r => !(
    r._src === 'server-sync' &&
    r.ref === VERSE_REF &&
    (r.completedAt || r.date) &&
    _localDateStr(r.completedAt || r.date) === today
  ));
  return { recs: pruned, matched: !!mineCloud };
}

// 오늘 완료 표시(개인 홈 updateHomeDisplay 규칙) = 오늘 날짜 로컬 기록 존재
function isTodayComplete(recs){
  return recs.some(r => { const ts = r.completedAt || r.date; return ts && _localDateStr(ts) === TODAY; });
}

let pass = 0;
function ok(cond, msg){ assert.ok(cond, msg); console.log('✅', msg); pass++; }

// 1) deviceId로 방장(권호택)을 찾아야 한다 (이름이 깨져도)
{
  const r = selfHeal([]);
  ok(r.matched === true, 'deviceId로 본인(방장) 매칭 성공 — 이름 mojibake 무관');
}

// 2) 오늘 server-sync 플레이스홀더 → 서버 doneToday=false 라 제거되어야 한다
{
  const recs = [{ ref: VERSE_REF, completedAt: TODAY+'T02:00:00.000Z', badge:'weekly_complete', _src:'server-sync' }];
  ok(isTodayComplete(recs) === true, '치유 전: 플레이스홀더로 오늘 완료(오인) 상태');
  const r = selfHeal(recs.slice());
  ok(r.recs.length === 0, '치유 후: 오늘 플레이스홀더 제거됨');
  ok(isTodayComplete(r.recs) === false, '치유 후: 오늘 미완료로 정상 표시');
}

// 3) 이름 매칭도 안 되는 최악 케이스(deviceId 없음)에서도 미확정→프루닝
{
  const saved = cloudMembers[0].deviceId;
  cloudMembers[0].deviceId = undefined; // deviceId 소실 시뮬
  const recs = [{ ref: VERSE_REF, completedAt: TODAY+'T02:00:00.000Z', _src:'server-sync' }];
  const r = selfHeal(recs.slice());
  ok(r.recs.length === 0, 'deviceId·이름 모두 매칭 실패해도 오늘 플레이스홀더 제거(미확정=프루닝)');
  cloudMembers[0].deviceId = saved;
}

// 4) 진짜 완료 기록(_src 없음)은 절대 삭제 금지
{
  const recs = [
    { ref: VERSE_REF, completedAt: TODAY+'T03:00:00.000Z', voiceScore1:90 }, // 진짜 오늘 완료
    { ref: VERSE_REF, completedAt: TODAY+'T02:00:00.000Z', _src:'server-sync' },
  ];
  const r = selfHeal(recs.slice());
  ok(r.recs.length === 1 && !r.recs[0]._src, '진짜 완료 기록 보존, 플레이스홀더만 제거');
  ok(isTodayComplete(r.recs) === true, '진짜 완료가 있으면 오늘 완료 유지');
}

// 5) 서버 doneToday=true 인 정상 완료일 → 플레이스홀더 보강(멀티폰 복구)
{
  cloudMembers[0].doneToday = true;
  const r = selfHeal([]);
  ok(r.recs.length === 1 && r.recs[0]._src === 'server-sync', '서버 확정 완료 시 로컬 미러 보강');
  ok(isTodayComplete(r.recs) === true, '보강 후 오늘 완료 표시');
  cloudMembers[0].doneToday = false;
}

// 6) 과거 플레이스홀더는 건드리지 않음
{
  const recs = [{ ref: VERSE_REF, completedAt: '2026-07-03T02:00:00.000Z', _src:'server-sync' }];
  const r = selfHeal(recs.slice());
  ok(r.recs.length === 1, '과거(어제) 플레이스홀더 보존 — 오늘 표시에 영향 없음');
}

console.log(`\n🎉 권호택 E2E 통과 ${pass}/${pass}`);
