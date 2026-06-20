const assert = require('node:assert/strict');
const { createTestContext } = require('./helpers/create-context.cjs');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const { loadAppScript } = require('./helpers/load-scripts.cjs');
const script = loadAppScript();

const context = createTestContext();
const { getElement } = context;

vm.runInNewContext(script, context);

const verse = '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라';
// 70% 분량 — 일반(90%)·관대(80%) 기준 모두 미달
const belowBoth = verse.slice(0, Math.floor(verse.length * 0.7));
// 85% 분량 — 일반(90%) 미달, 관대(80%)는 통과
const lenientOnly = verse.slice(0, Math.floor(verse.length * 0.85));

// ── 일반 모드: 통과 기준 90% ─────────────────────────────
context.startMemorize();
context.evalVoice(belowBoth);
assert.equal(getElement('voiceNext').disabled, true);
assert.match(getElement('simLabel').innerHTML, /통과 기준 90%/);

context.evalVoice(verse);
assert.equal(getElement('voiceNext').disabled, false);

// ── 관대 모드: 통과 기준 80%로 낮아짐 (노년층 배려) ──────
context.toggleLenient();
context.renderVoice();
// 라벨이 80%로 바뀌었는지 확인
context.evalVoice(belowBoth);
assert.equal(getElement('voiceNext').disabled, true);
assert.match(getElement('simLabel').innerHTML, /통과 기준 80%/);

// 일반 모드에선 막혔던 85% 분량이 관대 모드에선 통과해야 함
context.evalVoice(lenientOnly);
assert.equal(getElement('voiceNext').disabled, false);

console.log('voice threshold: normal 90% / lenient 80%: PASS');
