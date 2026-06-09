const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const { loadAppScript } = require('./helpers/load-scripts.cjs');
const script = loadAppScript();
const elements = new Map();
const storage = new Map();

function getElement(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      value: '',
      textContent: '',
      innerHTML: '',
      style: {},
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {},
      focus() {},
    });
  }
  return elements.get(id);
}

const context = {
  console,
  Date,
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); },
  },
  document: {
    documentElement: { getAttribute() { return 'dark'; }, setAttribute() {} },
    getElementById: getElement,
    querySelectorAll() { return []; },
  },
  window: { scrollTo() {} },
  setTimeout() { return 1; },
  clearTimeout() {},
};

vm.runInNewContext(script, context);

assert.ok(html.indexOf('교구별 현황') < html.indexOf('교회 전체 현황'));

storage.set('pat_family_profile', JSON.stringify({
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
