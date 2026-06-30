'use strict';
// 2단계 다중 소속(rooms.js) 테스트
//  1) upsertRoom: familyId 기준 추가/갱신, 다른 방 보존(삭제 없음)
//  2) seedRoomsIfNeeded: 기존 단일방 사용자 → 현재 활성방 시드
//  3) switchActiveRoom: 활성 방(pat_family_id/profile) 전환
//  4) roomToProfile: 필드 매핑 + groupType 기본 '가정'

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const script = ['app/js/family.js', 'app/js/rooms.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

function makeContext() {
  const storage = new Map();
  const localStorage = {
    getItem(k){ return storage.has(k) ? storage.get(k) : null; },
    setItem(k,v){ storage.set(k, String(v)); },
    removeItem(k){ storage.delete(k); },
    get length(){ return storage.size; },
    key(i){ return Array.from(storage.keys())[i] ?? null; },
  };
  const ctx = {
    console: { log(){}, warn(){}, error(){} },
    JSON, Math, Array, Object, String, Number, Set, Map, Date,
    localStorage, _storage: storage,
    window: {},
    document: { getElementById: () => null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  // DOM/렌더 의존 무력화
  ctx.renderFamily = () => {};
  ctx.toast = () => {};
  ctx.renderRoomSwitcher = () => {};
  return ctx;
}
const rooms = (ctx) => JSON.parse(ctx._storage.get('pat_rooms') || '[]');

// ── 1) upsert: 추가/갱신/보존 ────────────────────────────────────
(function testUpsert() {
  const ctx = makeContext();
  ctx.upsertRoom({ familyId:'f1', roomName:'우리가족', groupType:'가정', leaderName:'아빠' });
  ctx.upsertRoom({ familyId:'f2', roomName:'3구역', groupType:'구역', leaderName:'김장로' });
  assert.equal(rooms(ctx).length, 2, '서로 다른 방 2개 추가');
  // 같은 familyId → 갱신(중복 추가 아님)
  ctx.upsertRoom({ familyId:'f1', roomName:'우리가족(수정)' });
  const r = rooms(ctx);
  assert.equal(r.length, 2, '같은 familyId는 갱신');
  assert.equal(r.find(x=>x.familyId==='f1').roomName, '우리가족(수정)');
  assert.equal(r.find(x=>x.familyId==='f2').roomName, '3구역', '다른 방은 보존(삭제 없음)');
  console.log('  ✓ upsertRoom 추가/갱신/보존');
})();

// ── 2) seedRoomsIfNeeded ─────────────────────────────────────────
(function testSeed() {
  const ctx = makeContext();
  ctx._storage.set('pat_family_id', 'fam99');
  ctx._storage.set('pat_family_profile', JSON.stringify({
    roomName:'시드가족', leaderName:'엄마', groupType:'가정', members:['엄마','아들'],
  }));
  ctx.seedRoomsIfNeeded();
  const r = rooms(ctx);
  assert.equal(r.length, 1, '활성방이 목록에 시드됨');
  assert.equal(r[0].familyId, 'fam99');
  assert.equal(r[0].roomName, '시드가족');
  // 다시 호출해도 중복 안 됨
  ctx.seedRoomsIfNeeded();
  assert.equal(rooms(ctx).length, 1, '재호출 시 중복 없음');
  console.log('  ✓ seedRoomsIfNeeded (1회 시드, 중복 없음)');
})();

// ── 3) switchActiveRoom ──────────────────────────────────────────
(function testSwitch() {
  const ctx = makeContext();
  ctx.upsertRoom({ familyId:'A', roomName:'가족방', groupType:'가정', leaderName:'아빠', memberName:'아빠', familyPassword:'pwAAAA' });
  ctx.upsertRoom({ familyId:'B', roomName:'3구역', groupType:'구역', leaderName:'김장로', memberName:'아빠', familyPassword:'pwBBBB' });
  ctx._storage.set('pat_family_id', 'A');
  ctx._storage.set('pat_family_profile', JSON.stringify({ roomName:'가족방', groupType:'가정' }));

  ctx.switchActiveRoom('B');
  assert.equal(ctx._storage.get('pat_family_id'), 'B', '활성 방 id가 B로 전환');
  const prof = JSON.parse(ctx._storage.get('pat_family_profile'));
  assert.equal(prof.roomName, '3구역', '활성 프로필이 B로 교체');
  assert.equal(prof.groupType, '구역');
  // 방 목록은 그대로 2개(전환은 삭제 아님)
  assert.equal(rooms(ctx).length, 2, '전환은 방 목록을 줄이지 않음');
  console.log('  ✓ switchActiveRoom 전환 + 목록 보존');
})();

// ── 4) roomToProfile 기본값 ──────────────────────────────────────
(function testRoomToProfile() {
  const ctx = makeContext();
  const nm = '리더';
  const p = ctx.roomToProfile({ familyId:'x', roomName:'무종류방', leaderName:nm });
  assert.equal(p.groupType, '가정', 'groupType 누락 시 가정');
  assert.equal(p.members.length, 1, 'members 1명');
  assert.equal(p.members[0], nm, 'members 없으면 리더로 구성');
  console.log('  ✓ roomToProfile 기본값');
})();

console.log('\n✅ rooms: 모든 테스트 통과');
