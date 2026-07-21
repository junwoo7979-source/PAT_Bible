'use strict';
// Task 3: reading_progress v2 마이그레이션 순수 로직 테스트
// 레거시 행(status/completedAt)은 "읽기 완료"로만 해석하고,
// 기존 필드(id,userId,date,planId,status,completedAt,synced)와 id 값을 보존해야 한다.
const assert = require('node:assert/strict');
const R = require('../app/js/reading-progress.js');

const legacy = {
  id: 'u|2026-01-01|01-01:ot',
  userId: 'u',
  date: '2026-01-01',
  planId: '01-01:ot',
  status: 'done',
  completedAt: '2026-01-01T01:00:00Z',
  synced: 1,
};

// ── 레거시 → v2 정규화: done은 읽기 완료로만, 듣기는 미완료 ──
const migrated = R.normalizeProgress(legacy);
assert.equal(migrated.readDone, true);
assert.equal(migrated.listenDone, false);
assert.equal(migrated.readAt, legacy.completedAt);
assert.equal(migrated.progressSchemaVersion, 2);
// 기존 필드·id 값 보존
assert.equal(migrated.id, legacy.id);
assert.equal(migrated.userId, legacy.userId);
assert.equal(migrated.date, legacy.date);
assert.equal(migrated.planId, legacy.planId);
assert.equal(migrated.status, 'done');
assert.equal(migrated.completedAt, legacy.completedAt);
assert.equal(migrated.synced, legacy.synced);

// ── 듣기 완료 적용: 최초 completedAt 보존, status 유지, synced 초기화 ──
const listened = R.applyCompletion(migrated, 'listen', '2026-01-01T02:00:00Z');
assert.equal(listened.status, 'done');
assert.equal(listened.completedAt, legacy.completedAt); // 최초 완료 시각 보존
assert.equal(listened.listenDone, true);
assert.equal(listened.listenAt, '2026-01-01T02:00:00Z');
assert.equal(listened.readDone, true);                  // 기존 읽기 완료 유지
assert.equal(listened.synced, 0);                       // 재동기화 대상

// ── 해제: 두 완료 모드 모두 의도적으로 초기화 ──
const cleared = R.clearCompletion(listened);
assert.deepEqual(
  [cleared.readDone, cleared.listenDone, cleared.status, cleared.completedAt],
  [false, false, 'pending', null]
);

// ── 미완료(pending) 행 정규화: 완료로 승격되지 않아야 함 ──
const pending = R.normalizeProgress({ ...legacy, status: 'pending', completedAt: null });
assert.equal(pending.readDone, false);
assert.equal(pending.listenDone, false);

// ── v2 행 재정규화는 멱등 ──
const again = R.normalizeProgress(listened);
assert.deepEqual(again, listened);

// ── 신규 행에 읽기 완료 적용: completedAt/readAt 설정, status 파생 ──
const fresh = R.applyCompletion(
  R.normalizeProgress({ ...legacy, status: 'pending', completedAt: null, synced: 0 }),
  'read',
  '2026-02-01T00:00:00Z'
);
assert.equal(fresh.readDone, true);
assert.equal(fresh.readAt, '2026-02-01T00:00:00Z');
assert.equal(fresh.status, 'done');
assert.equal(fresh.completedAt, '2026-02-01T00:00:00Z');

console.log('audio-progress: all assertions passed');
