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

context.renderParishStats(1);
const rendered = getElement('dParishList').innerHTML;
assert.match(rendered, /1교구 진도표/);
assert.match(rendered, /2교구 진도표/);
assert.match(rendered, /3교구 진도표/);
assert.match(rendered, /블레싱 진도표/);
assert.match(rendered, /2교구 진도표[\s\S]*★/);
assert.match(rendered, /블레싱 진도표[\s\S]*31\/400명/);

console.log('parish dashboard rendering: PASS');
