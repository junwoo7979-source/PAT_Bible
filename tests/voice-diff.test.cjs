const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const { loadAppScript } = require('./helpers/load-scripts.cjs');
const { createTestContext } = require('./helpers/create-context.cjs');
const script = loadAppScript();

const context = createTestContext();
const { getElement } = context;

vm.runInNewContext(script, context);

const verse = '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라';
const wrong = verse.replace('세상을', '세상은');

context.startMemorize();

// 발음 유사(세상을→세상은) 단어는 파랑(b) + title로 인식 결과 표시, 나머지는 초록(g)
context.evalVoice(wrong);
assert.match(getElement('voiceDiff').innerHTML, /class="b" title="인식: 세상은"/);
assert.match(getElement('voiceDiff').innerHTML, /class="g"/);

// 단어 누락 시: 범례 힌트(초록=일치·빨강=다름·점선=빠진 단어) + 누락 표시(m)
context.evalVoice(verse.replace('세상을 ', ''));
assert.match(getElement('voiceDiff').innerHTML, /초록=일치/);
assert.match(getElement('voiceDiff').innerHTML, /빠진 단어/);
assert.match(getElement('voiceDiff').innerHTML, /class="m"/);

context.evalVoice(verse);
assert.match(getElement('voiceDiff').innerHTML, /완전히 일치합니다/);

console.log('voice difference highlighting: PASS');
