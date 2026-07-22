const assert = require('node:assert/strict');
const { createTestContext } = require('./helpers/create-context.cjs');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const { loadAppScript } = require('./helpers/load-scripts.cjs');
const script = loadAppScript();

const baseContext = createTestContext();
let focusCount = 0;
let scrollCount = 0;

const customGetElement = baseContext.getElement;
const getElement = (id) => {
  const el = customGetElement(id);
  if (el.__hasCustomClassList) return el;

  const classes = new Set();
  const oldClassList = el.classList;
  el.classList = {
    add(...names) { names.forEach(name => classes.add(name)); },
    remove(...names) { names.forEach(name => classes.delete(name)); },
    toggle(name, force) {
      if (force === true) classes.add(name);
      else if (force === false) classes.delete(name);
      else if (classes.has(name)) classes.delete(name);
      else classes.add(name);
    },
    contains(name) { return classes.has(name); },
  };
  el.focus = function() { focusCount++; };
  el.__hasCustomClassList = true;
  el.readOnly = false;
  return el;
};

const context = {
  ...baseContext,
  document: {
    ...baseContext.document,
    getElementById: getElement,
  },
  window: {
    ...baseContext.window,
    scrollTo() { scrollCount++; },
    isSecureContext: true
  },
};

vm.runInNewContext(script, context);

const storage = context.localStorage;
const verse = '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라';
const almostPerfect = verse.slice(0, -1);
const typingAlmostPerfect = verse.slice(0, -3) + '라';

context.startMemorize();
getElement('voiceManual').value = verse;
context.manualVoiceCheck();

// 통과 직후: 현재 단계(음성 1차)는 점수·확인을 표시하되(현행 UI),
// 아직 다음 단계로 넘어가지 않아 done(✓) 상태는 아니다. 100%는 '다시 검수' 대상 아님.
assert.match(getElement('stepsVoice').innerHTML, /음성 1차/);
assert.doesNotMatch(getElement('stepsVoice').innerHTML, /다시 검수/);
assert.doesNotMatch(getElement('stepsVoice').innerHTML, /class="st done"/);
assert.equal(getElement('voiceRepeat').style.display, 'block');
assert.equal(getElement('micBtn').disabled, true);
assert.equal(getElement('voiceManual').readOnly, true);
assert.equal(getElement('voiceManualCheck').disabled, true);

context.voiceNext();
getElement('voiceManual').value = verse;
context.manualVoiceCheck();
context.voiceNext();

context.toggleLenient();
getElement('typeInput').value = verse;
context.onType();
assert.equal(getElement('typingRepeat').style.display, 'block');
assert.equal(getElement('typeInput').readOnly, true);
context.typingNext();
// ★ SSOT 게이트(현행): 타이핑은 일반/관대 모두 100%라야 완료 저장. 2차도 정확히 입력.
getElement('typeInput').value = verse;
context.onType();
context.typingNext();

assert.match(getElement('stepsComplete').innerHTML, /음성 1차/);
// 전 단계 100% 통과 → '다시 검수'(100% 미만) 표기는 없어야 하고, 완료 단계는 ✓로 표시된다(현행 UI)
assert.doesNotMatch(getElement('stepsComplete').innerHTML, /다시 검수/);
assert.match(getElement('stepsComplete').innerHTML, /✓/);
assert.match(getElement('stepsComplete').innerHTML, /타이핑 2차/);
assert.equal(JSON.parse(storage.getItem('pat_records')).length, 1);

vm.runInNewContext('voiceScore1=0; voiceScore2=0; typeScore1=0; typeScore2=0; memorizeCompleted=false;', context);
context.go('s-verse');
assert.equal(getElement('verseCompletedProgress').style.display, 'block');
// 완료 화면의 각 단계는 goToStage(n)로 해당 단계 재검수로 이동한다(현행 UI)
assert.match(getElement('stepsVerse').innerHTML, /goToStage\(1\)/);
assert.match(getElement('stepsVerse').innerHTML, /goToStage\(4\)/);
assert.match(getElement('stepsVerse').innerHTML, /100%/);
assert.match(getElement('verseCompletedLabel').textContent, /!/);
assert.equal(getElement('verseStartBtn').textContent, '처음부터 다시 암송하기');
const completedRecord = JSON.parse(storage.getItem('pat_records'))[0];
assert.equal(completedRecord.typeScore1, 100);
assert.equal(typeof completedRecord.typeScore2, 'number');
assert.equal(completedRecord.voiceInput1, verse);
assert.equal(completedRecord.typeInput1, verse);

const focusBeforeTypingReview = focusCount;
const scrollBeforeTypingReview = scrollCount;
context.reviewStep(4);
assert.equal(focusCount, focusBeforeTypingReview);
assert.equal(scrollCount, scrollBeforeTypingReview);
// 애니메이션은 전역 제거됨 → no-motion 클래스 대신 해당 화면이 active 인지로 검증
assert.equal(getElement('s-typing').classList.contains('active'), true);
assert.equal(getElement('typeInput').value, verse);   // 완료 시 타이핑 2차 입력값(정답) 복원
assert.equal(getElement('typeInput').readOnly, true);
assert.equal(getElement('typingRepeat').style.display, 'block');
context.repeatCurrentStep('typing');
assert.equal(getElement('typeInput').value, '');
assert.equal(getElement('typeInput').readOnly, false);
assert.equal(getElement('typeDone').disabled, true);
getElement('typeInput').value = verse;
context.onType();
context.typingNext();
assert.equal(JSON.parse(storage.getItem('pat_records')).length, 1);
assert.equal(JSON.parse(storage.getItem('pat_records'))[0].typeInput2, verse);

const scrollBeforeVoiceReview = scrollCount;
context.reviewStep(1);
assert.equal(scrollCount, scrollBeforeVoiceReview);
assert.equal(getElement('s-voice').classList.contains('active'), true);
assert.equal(getElement('voiceStage').textContent, '1차');
assert.match(getElement('simLabel').innerHTML, /이전 유사도/);
assert.equal(getElement('recognized').textContent, verse);
assert.equal(getElement('micBtn').disabled, true);
assert.equal(getElement('voiceManual').value, verse);
assert.equal(getElement('voiceRepeat').style.display, 'block');
assert.equal(getElement('voiceNext').disabled, false);
context.repeatCurrentStep('voice');
assert.equal(getElement('recognized').textContent, '—');
assert.equal(getElement('micBtn').disabled, false);
assert.equal(getElement('voiceManual').value, '');
assert.equal(getElement('voiceManual').readOnly, false);
assert.equal(getElement('voiceManualCheck').disabled, false);
assert.equal(getElement('voiceNext').disabled, true);
getElement('voiceManual').value = verse;
context.manualVoiceCheck();
context.voiceNext();
assert.equal(getElement('voiceStage').textContent, '2차');

console.log('memorization review controls: PASS');
