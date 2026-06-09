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
const wrong = verse.replace('세상을', '세상은');

context.startMemorize();
context.evalVoice(wrong);

assert.match(getElement('voiceDiff').innerHTML, /다른 부분/);
assert.match(getElement('voiceDiff').innerHTML, /class="b"/);
assert.match(getElement('voiceDiff').innerHTML, /class="g"/);

context.evalVoice(verse);
assert.match(getElement('voiceDiff').innerHTML, /완전히 일치합니다/);

console.log('voice difference highlighting: PASS');
