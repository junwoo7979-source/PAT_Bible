const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const { loadAppScript } = require('./helpers/load-scripts.cjs');
const script = loadAppScript();
const elements = new Map();

function getElement(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      disabled: false,
      dataset: {},
      style: {},
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
  location: { protocol: 'http:', hostname: 'localhost' },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: {
    documentElement: { getAttribute() { return 'dark'; }, setAttribute() {} },
    getElementById: getElement,
    querySelectorAll() { return []; },
  },
  window: { scrollTo() {}, isSecureContext: true },
  setTimeout() { return 1; },
  clearTimeout() {},
};

vm.runInNewContext(script, context);

const verse = '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라';
// 80% 분량 — 유사도 약 79% → 90% 기준 미달
const belowThreshold = verse.slice(0, Math.floor(verse.length * 0.8));

context.startMemorize();
context.evalVoice(belowThreshold);
assert.equal(getElement('voiceNext').disabled, true);
assert.match(getElement('simLabel').innerHTML, /통과 기준 90%/);

context.evalVoice(verse);
assert.equal(getElement('voiceNext').disabled, false);

context.toggleLenient();
context.renderVoice();
context.evalVoice(belowThreshold);
assert.equal(getElement('voiceNext').disabled, true);
assert.match(getElement('simLabel').innerHTML, /통과 기준 90%/);

console.log('voice threshold requires 90 percent: PASS');
