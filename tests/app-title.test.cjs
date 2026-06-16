const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const { loadAppScript } = require('./helpers/load-scripts.cjs');
const script = loadAppScript();
const elements = new Map();
const storage = new Map();

function getElement(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      value: id === 'churchCode' ? '아들1' : '',
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
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); },
    clear() { storage.clear(); },
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

assert.match(html, /id="churchCode"[^>]*autocomplete="off"/);
assert.equal(getElement('churchCode').value, '');

getElement('inAppTitle').value = '세광교회 PAT';
context.saveAppTitle();
assert.equal(storage.get('pat_app_title'), '세광교회 PAT');
assert.equal(getElement('loginAppTitle').textContent, '세광교회 PAT');

storage.set('pat_app_title', '우리교회 암송');
context.applyStoredData();
assert.equal(getElement('loginAppTitle').textContent, '우리교회 암송');

getElement('adminId').value = 'admin';
getElement('adminPw').value = '1234';
context.adminLogin();
assert.equal(storage.get('pat_admin_id'), 'admin');
assert.equal(storage.get('pat_admin_pw'), '1234');
context.adminLogout();
assert.equal(storage.get('pat_admin_id'), undefined);
assert.equal(storage.get('pat_admin_pw'), undefined);

console.log('app title persistence: PASS');
