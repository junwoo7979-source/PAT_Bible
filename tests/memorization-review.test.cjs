const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements = new Map();
const storage = new Map();

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
  window: { scrollTo() {}, isSecureContext: true },
  setTimeout() { return 1; },
  clearTimeout() {},
};

vm.runInNewContext(script, context);

const verse = '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라';
const almostPerfect = verse.slice(0, -1);
const typingAlmostPerfect = verse.slice(0, -3) + '라';

context.startMemorize();
getElement('voiceManual').value = verse;
context.manualVoiceCheck();

assert.match(getElement('stepsVoice').innerHTML, /reviewStep\(1\)/);
assert.match(getElement('stepsVoice').innerHTML, /100%/);
assert.match(getElement('stepsVoice').innerHTML, /확인/);

context.voiceNext();
getElement('voiceManual').value = verse;
context.manualVoiceCheck();
context.voiceNext();

context.toggleLenient();
getElement('typeInput').value = verse;
context.onType();
context.typingNext();
getElement('typeInput').value = typingAlmostPerfect;
context.onType();
context.typingNext();

assert.match(getElement('stepsComplete').innerHTML, /음성 1차/);
assert.match(getElement('stepsComplete').innerHTML, /다시 검수/);
assert.match(getElement('stepsComplete').innerHTML, /타이핑 2차/);
assert.equal(JSON.parse(storage.get('pat_records')).length, 1);

context.reviewStep(4);
getElement('typeInput').value = verse;
context.onType();
context.typingNext();
assert.equal(JSON.parse(storage.get('pat_records')).length, 1);

context.reviewStep(1);
assert.equal(getElement('voiceStage').textContent, '1차');
assert.match(getElement('simLabel').innerHTML, /이전 유사도/);
assert.equal(getElement('voiceNext').disabled, true);

console.log('memorization review controls: PASS');
