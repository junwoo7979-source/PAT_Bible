const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const { loadAppScript } = require('./helpers/load-scripts.cjs');
const { createTestContext } = require('./helpers/create-context.cjs');
const script = loadAppScript();

const baseContext = createTestContext();
const { getElement } = baseContext;

const storage = baseContext.localStorage;
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
  ...baseContext,
  Date: Object.assign(
    function (...args) { return args.length ? new Date(...args) : new Date(now); },
    { now() { return now; } }
  ),
  setTimeout(fn, delay) {
    const timer = { fn, at: now + delay, cleared: false };
    timers.push(timer);
    return timer;
  },
  clearTimeout(timer) {
    if (timer) timer.cleared = true;
  },
  navigator: {
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
  },
  window: {
    ...baseContext.window,
    SpeechRecognition: FakeSpeechRecognition,
    scrollTo() {},
  },
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
// seamless restart: setMicReconnecting() 제거 → 힌트 변화 없음 (🔄 깜빡임 사라짐)
assert.equal(getElement('micHint').textContent, '🔴 마이크 연결 중... 잠시 후 말씀하세요');
runTimers(300);
assert.equal(recognitions.length, 3);
assert.equal(recognitions[2].started, true);

recognitions[2].endWithPartial('두 번째 음성 입력');
assert.equal(getElement('recognized').textContent, '두 번째 음성 입력');
assert.equal(getElement('manualBox').style.display, 'none');
assert.equal(getElement('micHint').textContent, '🔴 마이크 연결 중... 잠시 후 말씀하세요');
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
// onstart 발생 후 → '녹음 중...' 상태에서 error → seamless restart → 힌트 그대로 유지
assert.equal(getElement('micHint').textContent, '녹음 중... 탭하여 종료');
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
