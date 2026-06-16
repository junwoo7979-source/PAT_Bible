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
      value: '',
      textContent: '',
      innerHTML: '',
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {},
    });
  }
  return elements.get(id);
}

const context = {
  console,
  Date,
  URLSearchParams,
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
    clear() {},
  },
  document: {
    documentElement: { getAttribute() { return 'dark'; }, setAttribute() {} },
    getElementById: getElement,
    querySelectorAll() { return []; },
  },
  window: {
    scrollTo() {},
    addEventListener() {},
    location: { search: '', pathname: '/app/', href: 'http://localhost:8000/app/' },
  },
  history: {
    replaceState() {},
    pushState() {}
  },
  location: { search: '', pathname: '/app/', href: 'http://localhost:8000/app/' },
  navigator: {},
  setTimeout() { return 1; },
  clearTimeout() {},
};

vm.runInNewContext(script, context);

assert.equal(
  context.formatWeekPeriod('2026-06-03'),
  '2026년 6월 1주차 · 6월 1일 월요일 ~ 6월 7일 일요일',
);

assert.equal(
  context.formatWeekPeriod('2026-06-08'),
  '2026년 6월 2주차 · 6월 8일 월요일 ~ 6월 14일 일요일',
);

getElement('inDate').value = '2026-06-03';
context.updateWeekFromDate();
assert.equal(
  getElement('inWeek').value,
  '2026년 6월 1주차 · 6월 1일 월요일 ~ 6월 7일 일요일',
);
assert.equal(
  getElement('pvWeek').textContent,
  '2026년 6월 1주차 · 6월 1일 월요일 ~ 6월 7일 일요일',
);

assert.equal(
  context.formatTodayLabel('2026-06-02'),
  '오늘은 6월 2일 화요일입니다',
);

context.renderMemberDateLabels('2026-06-02');
assert.equal(
  getElement('weekLabel').textContent,
  '2026년 6월 1주차 · 6월 1일 월요일 ~ 6월 7일 일요일',
);
assert.equal(getElement('familyToday').textContent, '오늘은 6월 2일 화요일입니다');
assert.equal(
  getElement('verseWeek').textContent,
  '2026년 6월 1주차 · 6월 1일 월요일 ~ 6월 7일 일요일',
);
assert.equal(getElement('verseToday').textContent, '오늘은 6월 2일 화요일입니다');

console.log('week period formatting: PASS');
