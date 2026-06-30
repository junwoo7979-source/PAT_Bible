'use strict';
// 수행 기록(history) 기능 테스트 (v118)
//  1) recordMissionHistory: 날짜별 누적 저장, 같은 미션·구성원은 갱신, 다른 날짜는 영향 없음
//  2) loadLocalHistoryRange: 기간 조회
//  3) 날짜 변경(resetMemorizeProgress) 후에도 pat_hist_* 기록이 보존됨
//  4) 어제 기록이 조회됨

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const script = ['app/js/voice.js', 'app/js/history.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

function makeContext() {
  const storage = new Map();
  const localStorage = {
    getItem(k) { return storage.has(k) ? storage.get(k) : null; },
    setItem(k, v) { storage.set(k, String(v)); },
    removeItem(k) { storage.delete(k); },
    get length() { return storage.size; },
    key(i) { return Array.from(storage.keys())[i] ?? null; },
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Date, JSON, Math, Array, Object, String, Number, Set, Map,
    localStorage, _storage: storage,
    document: { documentElement: { getAttribute: () => 'dark', setAttribute() {} } },
    window: {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return ctx;
}

// ── 1) 누적 저장 + 갱신 + 날짜 독립성 ────────────────────────────
(function testAccumulate() {
  const ctx = makeContext();
  ctx.recordMissionHistory({ date: '2026-06-28', memberId: '아빠', missionId: '창세기 1:1', mission: 'memorize', read: true, write: false, completed: true });
  ctx.recordMissionHistory({ date: '2026-06-28', memberId: '엄마', missionId: '창세기 1:1', mission: 'memorize', read: true, write: true, completed: true });
  // 같은 날·같은 미션·같은 구성원 → 갱신(중복 추가 아님)
  ctx.recordMissionHistory({ date: '2026-06-28', memberId: '아빠', missionId: '창세기 1:1', mission: 'memorize', read: true, write: true, completed: true });
  // 다른 날
  ctx.recordMissionHistory({ date: '2026-06-29', memberId: '아빠', missionId: '시편 23:1', mission: 'memorize', read: true, write: true, completed: true });

  const d28 = JSON.parse(ctx._storage.get('pat_hist_2026-06-28'));
  const d29 = JSON.parse(ctx._storage.get('pat_hist_2026-06-29'));
  assert.equal(d28.length, 2, '같은 구성원·미션은 갱신되어 2건(아빠/엄마)만 존재');
  assert.equal(d28.find(e => e.memberId === '아빠').write, true, '아빠 항목이 write=true로 갱신됨');
  assert.equal(d29.length, 1, '다른 날짜는 독립 저장');
  console.log('  ✓ 날짜별 누적 + 갱신 + 날짜 독립성');
})();

// ── 2) 기간 조회 ─────────────────────────────────────────────────
(function testRange() {
  const ctx = makeContext();
  ['2026-06-01', '2026-06-15', '2026-06-30', '2026-07-01'].forEach(d =>
    ctx.recordMissionHistory({ date: d, memberId: '아빠', missionId: 'X', completed: true }));
  const june = ctx.loadLocalHistoryRange('2026-06-01', '2026-06-30');
  assert.equal(june.length, 3, '6월 범위 조회 = 3건 (7/1 제외)');
  console.log('  ✓ 기간 조회');
})();

// ── 3) 날짜 변경 후에도 history 보존 ─────────────────────────────
(function testResetPreservesHistory() {
  const ctx = makeContext();
  ctx.recordMissionHistory({ date: '2026-06-28', memberId: '아빠', missionId: '창세기 1:1', completed: true });
  ctx.recordMissionHistory({ date: '2026-06-29', memberId: '엄마', missionId: '시편 23:1', completed: true });
  // 어제 미션 기록(pat_records)도 같이 둔다
  ctx._storage.set('pat_records', JSON.stringify([{ ref: '창세기 1:1', completedAt: '2026-06-28T00:00:00.000Z' }]));
  // 세션 날짜를 과거로 → 날짜 변경 강제
  ctx._storage.set('pat_memorize_session_date', '2000-01-01');
  ctx.checkAndResetByDate();

  // history는 그대로
  assert.ok(ctx._storage.get('pat_hist_2026-06-28'), '날짜 변경 후에도 6/28 history 보존');
  assert.ok(ctx._storage.get('pat_hist_2026-06-29'), '날짜 변경 후에도 6/29 history 보존');
  // pat_records(미션 기록)도 보존 (v117 보장 재확인)
  assert.ok(ctx._storage.get('pat_records'), '날짜 변경 후에도 pat_records 보존');
  console.log('  ✓ 날짜 변경(오늘 초기화) 후에도 과거 history/records 전량 보존');
})();

// ── 4) 어제 기록 조회 ────────────────────────────────────────────
(function testYesterdayQueryable() {
  const ctx = makeContext();
  ctx.recordMissionHistory({ date: '2026-06-29', memberId: '아빠', memberName: '아빠', missionId: '시편 23:1', completed: true });
  const items = ctx.loadLocalHistoryRange('2026-06-29', '2026-06-29');
  assert.equal(items.length, 1, '어제 기록 1건 조회');
  assert.equal(items[0].memberName, '아빠');
  console.log('  ✓ 어제 기록 조회 가능');
})();

console.log('\n✅ mission-history: 모든 테스트 통과');
