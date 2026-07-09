'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const readingSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'js', 'reading.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');

function makeElement(id) {
  return {
    id,
    style: {},
    children: [],
    attributes: {},
    innerHTML: '',
    textContent: '',
    value: '',
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    scrollIntoView() {},
  };
}

const elements = {
  todayPlanDate: makeElement('todayPlanDate'),
  todayPlanMenu: makeElement('todayPlanMenu'),
  todayReadingPane: makeElement('todayReadingPane'),
  todayReadingTitle: makeElement('todayReadingTitle'),
  todayReadingBody: makeElement('todayReadingBody'),
};

const storage = new Map();
const context = {
  console,
  Date,
  Promise,
  setTimeout,
  window: {},
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
  },
  document: {
    getElementById(id) { return elements[id] || null; },
    querySelectorAll() { return []; },
  },
};
context.window = context;
context.PAT_PLAN = { '01-01': ['1', '창 1', '마 1', '1'] };
context.parseRef = () => ({ segments: [] });
context.PAT_BIBLE_DB = { supported: () => false };
context.PAT_READING_PROGRESS = { isComplete: async () => false };

vm.createContext(context);
vm.runInContext(readingSrc, context);

async function run() {
  const html = await context._loadPassageHtml('si', '1', '시편 1');
  const paneStart = indexHtml.indexOf('id="todayReadingPane"');
  const toolbarAt = indexHtml.indexOf('id="readingFontSizeToolbar"', paneStart);
  const bodyAt = indexHtml.indexOf('id="todayReadingBody"', paneStart);

  assert.ok(paneStart >= 0, 'todayReadingPane exists');
  assert.ok(toolbarAt > paneStart, 'font-size toolbar is inside the expanded reading pane');
  assert.ok(toolbarAt < bodyAt, 'font-size toolbar is above the long passage body');
  assert.doesNotMatch(html, /id="readingFontSizeControl"/);
  assert.match(html, /id="readingPassageText"/);

  elements.todayReadingBody.innerHTML = html;
  elements.readingPassageText = makeElement('readingPassageText');
  elements.readingFontSizeControl = makeElement('readingFontSizeControl');

  context.setReadingFontSize(24);

  assert.equal(elements.readingPassageText.style.fontSize, '24px');
  assert.equal(elements.readingFontSizeControl.value, '24');
  assert.equal(context.localStorage.getItem('pat_reading_font_size'), '24');

  context.setReadingFontSize(99);

  assert.equal(elements.readingPassageText.style.fontSize, '28px');
  assert.equal(context.localStorage.getItem('pat_reading_font_size'), '28');

  console.log('reading-font-size.test: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
