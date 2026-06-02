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
  window: { scrollTo() {} },
  setTimeout() { return 1; },
  clearTimeout() {},
};

vm.runInNewContext(script, context);

getElement('inAppTitle').value = '세광교회 PAT';
context.saveAppTitle();
assert.equal(storage.get('pat_app_title'), '세광교회 PAT');
assert.equal(getElement('loginAppTitle').textContent, '세광교회 PAT');

storage.set('pat_app_title', '우리교회 암송');
context.applyStoredData();
assert.equal(getElement('loginAppTitle').textContent, '우리교회 암송');

console.log('app title persistence: PASS');
