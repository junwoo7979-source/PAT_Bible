const assert = require('node:assert/strict');
const { createTestContext } = require('./helpers/create-context.cjs');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const { loadAppScript } = require('./helpers/load-scripts.cjs');
const script = loadAppScript();

const context = createTestContext();
const { getElement } = context;
const storage = context.localStorage;

vm.runInNewContext(script, context);

assert.ok(html.indexOf('교구별 현황') < html.indexOf('교회 전체 현황'));

storage.setItem('pat_family_profile', JSON.stringify({
  roomName: '믿음 가족방',
  leaderName: '김민수',
  parish: '2교구',
  district: '3구역',
}));
// ★ 관리자 교구 전체인원(분모) 설정 — 블레싱 400명
storage.setItem('pat_admin_parish_edit', JSON.stringify({ 블레싱: 400 }));

// renderParishStats(N) → 서버 집계 기반 renderParishStatsFromAggregated(byParish, totalDone, registeredByParish)로 교체됨.
// 기본 교구 그룹: 1교구/2교구/3교구/블레싱. 완료/참가 집계를 전달해 렌더한다.
const byParish = { '1교구': 10, '2교구': 20, '3교구': 5, '블레싱': 31 };
const registeredByParish = { '1교구': 40, '2교구': 50, '3교구': 30, '블레싱': 400 };
const totalDone = 66;
context.renderParishStatsFromAggregated(byParish, totalDone, registeredByParish);

const rendered = getElement('dParishList').innerHTML;
assert.match(rendered, /1교구/);
assert.match(rendered, /2교구/);
assert.match(rendered, /3교구/);
assert.match(rendered, /블레싱/);
// 내 교구(2교구)는 ★ 강조
assert.match(rendered, /2교구 ★/);
// 블레싱: 완료 31 / 전체인원(관리자 설정) 400
assert.match(rendered, /블레싱[\s\S]*완료 31\/400/);

console.log('parish dashboard rendering: PASS');
