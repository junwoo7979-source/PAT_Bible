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
let micPermissionRequests = 0;
let micPermissionQueries = 0;
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
    this.onresult({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: false }] });
  }

  cumulativePreview(resultIndex, results) {
    this.onresult({
      resultIndex,
      results: results.map(({ transcript, isFinal = false }) => ({
        0: { transcript },
        isFinal,
      })),
    });
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

  endWithPartial(text) {
    this.preview(text);
    this.onend();
    unavailableUntil = now + 250;
  }

  startedSuccessfully() {
    this.onstart && this.onstart();
  }

  errorThenEnd(error) {
    this.onerror({ error });
    this.onend && this.onend();
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

context.navigator = {
  permissions: {
    async query(options) {
      assert.equal(options.name, 'microphone');
      micPermissionQueries++;
      return { state: 'prompt' };
    },
  },
  mediaDevices: {
    async getUserMedia(options) {
      assert.equal(options.audio, true);
      micPermissionRequests++;
      return {
        getTracks() {
          return [{ stop() {}, readyState: 'live' }];
        },
      };
    },
  },
};

context.window = {
  SpeechRecognition: FakeSpeechRecognition,
  navigator: context.navigator,
  scrollTo() {},
};

vm.runInNewContext(script, context);

const verse = '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라';

(async () => {
await context.startMemorize();
await context.toggleMic();
// acquireGlobalMicStream: permissions.query 없이 getUserMedia 직접 호출 → queries=0, requests=1
assert.equal(micPermissionQueries, 0);
assert.equal(micPermissionRequests, 1);
assert.equal(recognitions.length, 1);
assert.equal(recognitions[0].continuous, true);
recognitions[0].preview('하나님이 세상을');
assert.equal(getElement('recognized').textContent, '하나님이 세상을');
assert.equal(getElement('voiceRestart').style.display, 'none');
const mobilePreviewText = getElement('recognized').textContent;
recognitions[0].cumulativePreview(1, [
  { transcript: mobilePreviewText.slice(0, 4), isFinal: true },
  { transcript: mobilePreviewText, isFinal: false },
]);
assert.equal(getElement('recognized').textContent, mobilePreviewText);
recognitions[0].cumulativePreview(1, [
  { transcript: '하나님이', isFinal: true },
  { transcript: '세상을', isFinal: false },
]);
assert.equal(getElement('recognized').textContent, '하나님이 세상을');
recognitions[0].cumulativePreview(0, [
  { transcript: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니', isFinal: true },
  { transcript: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다', isFinal: true },
]);
assert.equal(
  getElement('recognized').textContent,
  '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다',
);
recognitions[0].cumulativePreview(0, [
  {
    transcript:
      '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다',
    isFinal: true,
  },
]);
assert.equal(
  getElement('recognized').textContent,
  '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다',
);
recognitions[0].emit(verse);
assert.equal(recognitions[0].onresult, null);
assert.equal(recognitions[0].onerror, null);
assert.equal(recognitions[0].onend, null);

context.voiceNext();
await context.toggleMic();
assert.equal(recognitions.length, 1);
runTimers(300);
assert.equal(recognitions.length, 2);
// voiceMicPermissionReady=true 캐싱으로 2차부터 추가 query/request 없음
assert.equal(micPermissionQueries, 0);
assert.equal(micPermissionRequests, 1);
assert.equal(recognitions[1].started, true);

recognitions[1].endWithoutResult();
assert.equal(getElement('manualBox').style.display, 'none');
assert.equal(getElement('micHint').textContent, '마이크 준비 중... 잠시만 기다려주세요');
runTimers(300);
assert.equal(recognitions.length, 3);
assert.equal(recognitions[2].started, true);

recognitions[2].endWithPartial('두 번째 음성 입력');
assert.equal(getElement('recognized').textContent, '두 번째 음성 입력');
assert.equal(getElement('manualBox').style.display, 'none');
assert.equal(getElement('micHint').textContent, '마이크 준비 중... 잠시만 기다려주세요');
runTimers(300);
assert.equal(recognitions.length, 4);
assert.equal(recognitions[3].started, true);

recognitions[3].emit(verse);
assert.equal(getElement('voiceNext').disabled, false);

await context.toggleMic();
assert.equal(recognitions.length, 4);
runTimers(300);
assert.equal(recognitions.length, 5);
// 이후 모든 toggleMic도 캐싱으로 추가 query/request 없음
assert.equal(micPermissionQueries, 0);
assert.equal(micPermissionRequests, 1);
assert.equal(recognitions[4].started, true);
assert.equal(getElement('voiceRestart').style.display, 'none');

recognitions[4].startedSuccessfully();
recognitions[4].errorThenEnd('no-speech');
assert.equal(getElement('manualBox').style.display, 'none');
assert.equal(getElement('micHint').textContent, '마이크 준비 중... 잠시만 기다려주세요');
runTimers(300);
assert.equal(recognitions.length, 6);
assert.equal(recognitions[5].started, true);

for (let i = 0; i < 5; i++) {
  recognitions.at(-1).startedSuccessfully();
  recognitions.at(-1).errorThenEnd('no-speech');
  runTimers(300);
}
assert.equal(getElement('manualBox').style.display, 'block');
assert.equal(getElement('voiceRestart').style.display, 'block');
assert.equal(micPermissionRequests, 1); // getUserMedia는 최초 1회만 호출됨

context.restartMemorize();
assert.equal(getElement('micBtn').textContent, '🎙️');

console.log('voice recognition lifecycle: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
