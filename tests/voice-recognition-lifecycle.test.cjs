const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
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

const storage = new Map();
const recognitions = [];
let previousRecognition = null;
let now = 0;
let unavailableUntil = 0;
const timers = [];

function runTimers(ms) {
  now += ms;
  timers
    .filter(timer => !timer.cleared && timer.at <= now)
    .forEach(timer => {
      timer.cleared = true;
      timer.fn();
    });
}

class FakeSpeechRecognition {
  constructor() {
    recognitions.push(this);
  }

  start() {
    if (now < unavailableUntil) {
      throw new Error('Recognition service is still releasing the previous session');
    }
    if (previousRecognition &&
        (previousRecognition.onresult || previousRecognition.onerror || previousRecognition.onend)) {
      throw new Error('Previous recognition session was not released');
    }
    previousRecognition = this;
    this.started = true;
  }

  stop() {}
  abort() {}

  preview(text) {
    this.onresult({ results: [[{ transcript: text }]] });
  }

  emit(text) {
    this.preview(text);
    this.onend();
    unavailableUntil = now + 250;
  }

  endWithoutResult() {
    this.onend();
    unavailableUntil = now + 250;
  }
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
    documentElement: {
      getAttribute() { return 'dark'; },
      setAttribute() {},
    },
    getElementById: getElement,
    querySelectorAll() { return []; },
  },
  Date: { now() { return now; } },
  setTimeout(fn, delay) {
    const timer = { fn, at: now + delay, cleared: false };
    timers.push(timer);
    return timer;
  },
  clearTimeout(timer) {
    if (timer) timer.cleared = true;
  },
};

context.window = {
  SpeechRecognition: FakeSpeechRecognition,
  scrollTo() {},
};

vm.runInNewContext(script, context);

const verse = '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라';

context.startMemorize();
context.toggleMic();
assert.equal(recognitions.length, 1);
recognitions[0].preview('하나님이 세상을');
assert.equal(getElement('recognized').textContent, '하나님이 세상을');
assert.equal(getElement('voiceRestart').style.display, 'none');
recognitions[0].emit(verse);
assert.equal(recognitions[0].onresult, null);
assert.equal(recognitions[0].onerror, null);
assert.equal(recognitions[0].onend, null);

context.voiceNext();
context.toggleMic();
assert.equal(recognitions.length, 1);
runTimers(300);
assert.equal(recognitions.length, 2);
assert.equal(recognitions[1].started, true);

recognitions[1].endWithoutResult();
assert.equal(getElement('manualBox').style.display, 'none');
assert.equal(getElement('micHint').textContent, '마이크 준비 중... 잠시만 기다려주세요');
runTimers(300);
assert.equal(recognitions.length, 3);
assert.equal(recognitions[2].started, true);

recognitions[2].emit('두 번째 음성 입력');
assert.equal(getElement('recognized').textContent, '두 번째 음성 입력');
assert.equal(getElement('voiceRestart').style.display, 'block');

context.toggleMic();
assert.equal(recognitions.length, 3);
runTimers(300);
assert.equal(recognitions.length, 4);
assert.equal(recognitions[3].started, true);
assert.equal(getElement('voiceRestart').style.display, 'none');
context.restartMemorize();
assert.equal(getElement('micBtn').textContent, '🎙️');

console.log('voice recognition lifecycle: PASS');
