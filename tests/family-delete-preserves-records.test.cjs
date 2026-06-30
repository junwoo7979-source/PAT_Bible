'use strict';
// 재발방지 회귀 테스트 (v117)
// 목적: "가족방/구성원 삭제 또는 날짜 변경 시 미션 수행 기록(pat_records)이 사라지던"
//       데이터 초기화 버그가 재발하지 않음을 보장한다.
//
// 검증 항목
//  1) resetMemorizeProgress(날짜 변경)가 과거 기록을 포함해 pat_records 전량을 보존한다.
//  2) deleteFamilyMember(구성원 삭제)가 pat_records를 전혀 건드리지 않는다.
//  3) 대표 삭제 시에도 pat_records가 보존되고 대표가 승계된다.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'app/js/app-core.js',
  'app/js/verse.js',
  'app/js/family.js',
  'app/js/voice.js',
  'app/js/voice-ui.js',
  'app/js/memorize.js',
];
const script = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

function makeContext() {
  const storage = new Map();
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: '', textContent: '', innerHTML: '', style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {}, focus() {}, appendChild() {}, remove() {},
      });
    }
    return elements.get(id);
  };
  const localStorage = {
    getItem(k) { return storage.has(k) ? storage.get(k) : null; },
    setItem(k, v) { storage.set(k, String(v)); },
    removeItem(k) { storage.delete(k); },
    get length() { return storage.size; },
    key(i) { return Array.from(storage.keys())[i] ?? null; },
  };
  const context = {
    console: { log() {}, warn() {}, error() {} },
    Date, JSON, Math, Array, Object, String, Number, Set, Map,
    URLSearchParams,
    encodeURIComponent, decodeURIComponent,
    setInterval: () => 0, clearInterval: () => {}, setTimeout: (fn) => { return 0; },
    addEventListener: () => {}, removeEventListener: () => {},
    confirm: () => true,             // 삭제 확인창 → 항상 승인
    alert: () => {}, prompt: () => '',
    navigator: { userAgent: 'node', clipboard: { writeText: () => Promise.resolve() } },
    location: { search: '', pathname: '/', origin: 'http://t', href: 'http://t/' },
    localStorage,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      readyState: 'loading',  // ★ auto-init(initApp) 비활성화 — 함수 단위 테스트
      documentElement: { getAttribute: () => 'dark', setAttribute() {} },
      getElementById: getElement,
      querySelectorAll: () => [],
      createElement: () => getElement('_tmp'),
      addEventListener() {},
    },
    window: {},
    _storage: storage,
  };
  context.window = context; // window.PAT_DB 등 self-참조
  context.PAT_DB = undefined; // 서버 미연결 → 로컬 경로만 검증
  vm.createContext(context);
  vm.runInContext(script, context);
  return context;
}

function seedRecords(ctx, refs) {
  ctx._storage.set('pat_records', JSON.stringify(refs));
}
function readRecords(ctx) {
  return JSON.parse(ctx._storage.get('pat_records') || '[]');
}

// ── 1) 날짜 변경 시 과거 기록 보존 ───────────────────────────────
(function testDateChangePreservesHistory() {
  const ctx = makeContext();
  // 어제(과거) + 그제 완료 기록을 심는다
  seedRecords(ctx, [
    { ref: '창세기 1:1', completedAt: '2020-01-01T00:00:00.000Z' },
    { ref: '시편 23:1',  completedAt: '2021-06-15T00:00:00.000Z' },
    { ref: '요한복음 3:16', completedAt: new Date().toISOString() },
  ]);
  // 세션 날짜를 과거로 만들어 날짜 변경을 강제
  ctx._storage.set('pat_memorize_session_date', '2000-01-01');
  ctx.checkAndResetByDate();

  const recs = readRecords(ctx);
  assert.equal(recs.length, 3, '날짜 변경 후에도 과거 기록을 포함해 전량 보존되어야 한다');
  const refs = recs.map(r => r.ref);
  assert.ok(refs.includes('창세기 1:1'), '2020년 기록 보존');
  assert.ok(refs.includes('시편 23:1'), '2021년 기록 보존');
  console.log('  ✓ 날짜 변경 시 과거 미션 기록 전량 보존');
})();

// ── 2) 구성원 삭제가 pat_records를 건드리지 않음 ──────────────────
(async function testDeleteMemberPreservesRecords() {
  const ctx = makeContext();
  // 가족방 프로필 + 미션 기록 준비
  ctx._storage.set('pat_family_profile', JSON.stringify({
    roomName: '테스트네 가족', leaderName: '아빠', parish: '1교구', district: '1구역',
    familyPassword: 'pw1234', memberName: '아빠', members: ['아빠', '엄마', '아들'],
  }));
  seedRecords(ctx, [
    { ref: '창세기 1:1', completedAt: '2020-01-01T00:00:00.000Z', memberName: '엄마' },
    { ref: '시편 23:1',  completedAt: '2021-01-01T00:00:00.000Z', memberName: '아들' },
  ]);
  // renderFamily 등 무거운 렌더는 무력화 (DOM/네트워크 의존 제거)
  ctx.renderFamily = () => {};
  ctx.toast = () => {};

  await ctx.deleteFamilyMember(ctx.encodeURIComponent('아들')); // 일반 구성원 삭제

  const recs = readRecords(ctx);
  assert.equal(recs.length, 2, '구성원 삭제는 미션 기록을 절대 삭제하지 않는다');
  const profile = JSON.parse(ctx._storage.get('pat_family_profile'));
  assert.ok(!profile.members.includes('아들'), '삭제한 구성원은 명단에서 빠진다');
  assert.ok(profile.members.includes('아빠') && profile.members.includes('엄마'), '나머지 명단 유지');
  console.log('  ✓ 구성원 삭제 시 미션 기록 전량 보존');
})();

// ── 3) 대표 삭제 시에도 기록 보존 + 대표 승계 ────────────────────
(async function testDeleteLeaderPreservesRecordsAndSucceeds() {
  const ctx = makeContext();
  ctx._storage.set('pat_family_profile', JSON.stringify({
    roomName: '테스트네 가족', leaderName: '아빠', parish: '1교구', district: '1구역',
    familyPassword: 'pw1234', memberName: '아빠', members: ['아빠', '엄마'],
  }));
  seedRecords(ctx, [
    { ref: '창세기 1:1', completedAt: '2020-01-01T00:00:00.000Z', memberName: '엄마' },
  ]);
  ctx.renderFamily = () => {};
  ctx.toast = () => {};

  await ctx.deleteFamilyMember(ctx.encodeURIComponent('아빠')); // 대표 삭제

  const recs = readRecords(ctx);
  assert.equal(recs.length, 1, '대표 삭제도 미션 기록을 삭제하지 않는다');
  const profile = JSON.parse(ctx._storage.get('pat_family_profile'));
  assert.ok(!profile.members.includes('아빠'), '삭제된 대표는 명단에서 빠진다');
  assert.equal(profile.leaderName, '엄마', '대표는 남은 첫 구성원으로 승계된다');
  console.log('  ✓ 대표 삭제 시 기록 보존 + 대표 승계');
})();

// ── 4) 3번 연속 터치 안전장치: 1~2번은 삭제 안 됨, 3번째에만 삭제 ──
(function testTripleTapGate() {
  const ctx = makeContext();
  ctx._storage.set('pat_family_profile', JSON.stringify({
    roomName: '테스트네 가족', leaderName: '아빠', parish: '1교구', district: '1구역',
    familyPassword: 'pw1234', memberName: '아빠', members: ['아빠', '엄마', '아들'],
  }));
  seedRecords(ctx, [{ ref: '시편 23:1', completedAt: '2021-01-01T00:00:00.000Z', memberName: '아들' }]);
  ctx.renderFamily = () => {};
  ctx.toast = () => {};
  // DB.members 세팅 → _rerenderMemberListSafe가 renderFamilyMemberList를 호출해도 안전

  const enc = ctx.encodeURIComponent('아들');
  ctx.armDeleteFamilyMember(enc); // 1번째
  let p = JSON.parse(ctx._storage.get('pat_family_profile'));
  assert.ok(p.members.includes('아들'), '1번 터치로는 삭제되지 않는다');

  ctx.armDeleteFamilyMember(enc); // 2번째
  p = JSON.parse(ctx._storage.get('pat_family_profile'));
  assert.ok(p.members.includes('아들'), '2번 터치로도 삭제되지 않는다');

  ctx.armDeleteFamilyMember(enc); // 3번째 → 삭제
  p = JSON.parse(ctx._storage.get('pat_family_profile'));
  assert.ok(!p.members.includes('아들'), '3번째 연속 터치에서 삭제된다');
  assert.equal(readRecords(ctx).length, 1, '3연타 삭제도 미션 기록은 보존');
  console.log('  ✓ 3번 연속 터치 안전장치 (1~2번 무시, 3번째 삭제, 기록 보존)');
})();

// ── 5) 다른 구성원을 누르면 카운트 리셋(엉뚱한 사람 삭제 방지) ──────
(function testArmResetOnDifferentMember() {
  const ctx = makeContext();
  ctx._storage.set('pat_family_profile', JSON.stringify({
    roomName: '테스트네 가족', leaderName: '아빠', parish: '1교구', district: '1구역',
    familyPassword: 'pw1234', memberName: '아빠', members: ['아빠', '엄마', '아들'],
  }));
  ctx.renderFamily = () => {};
  ctx.toast = () => {};

  ctx.armDeleteFamilyMember(ctx.encodeURIComponent('아들')); // 아들 1
  ctx.armDeleteFamilyMember(ctx.encodeURIComponent('아들')); // 아들 2
  ctx.armDeleteFamilyMember(ctx.encodeURIComponent('엄마')); // 엄마로 전환 → 카운트 리셋(엄마 1)
  let p = JSON.parse(ctx._storage.get('pat_family_profile'));
  assert.ok(p.members.includes('아들') && p.members.includes('엄마'), '대상 전환 시 누구도 삭제되지 않는다');
  console.log('  ✓ 다른 구성원 터치 시 카운트 리셋');
})();

// ── 6) groupType: 기본 '가정'(하위호환) + 대표 등록 시 종류 저장 ──
(function testGroupType() {
  const ctx = makeContext();
  // 기본값: 누락 시 '가정'
  assert.equal(ctx.groupTypeOf(null), '가정', '프로필 없으면 가정');
  assert.equal(ctx.groupTypeOf({}), '가정', 'groupType 누락 시 가정(하위호환)');
  assert.equal(ctx.groupTypeOf({ groupType: '구역' }), '구역', '구역 반영');

  // 대표 등록 시 종류 저장 — 폼 입력값 세팅
  ctx.go = () => {}; ctx.toast = () => {}; ctx.renderFamily = () => {};
  const setVal = (id, v) => { ctx.document.getElementById(id).value = v; };
  setVal('familyGroupType', '구역');
  setVal('familyRoomName', '3구역 모임');
  setVal('familyLeaderName', '김구역장');
  setVal('familyParish', '1교구');
  setVal('familyDistrict', '3구역');
  setVal('familyPassword', 'pw1234');

  ctx.saveFamilyProfileAsLeader();
  const p = JSON.parse(ctx._storage.get('pat_family_profile'));
  assert.equal(p.groupType, '구역', '대표 등록 시 groupType=구역 저장');
  assert.equal(p.roomName, '3구역 모임');
  assert.equal(p.leaderName, '김구역장');
  console.log('  ✓ groupType 기본 가정 + 구역 등록 저장');
})();

console.log('\n✅ family-delete-preserves-records: 모든 테스트 통과');
