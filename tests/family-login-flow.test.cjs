const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadAppScript } = require('./helpers/load-scripts.cjs');

function createLoginContext() {
  const elements = new Map();
  const storage = new Map();
  const session = new Map();
  const calls = { findFamilyByPassword: [], getConfig: [], fetch: [] };
  const foundFamily = {
    id: 'family-1',
    roomName: '믿음 가족방',
    leaderName: '김민수',
    familyPassword: '22222',
    members: ['김민수'],
  };
  const db = {
    init() { return true; },
    ready() { return true; },
    getConfig(churchCode) { calls.getConfig.push(churchCode); return Promise.resolve(null); },
    getLatestVerse() { return Promise.resolve(null); },
    subscribeConfig() {},
    subscribeVerse() {},
    findFamilyByPassword(churchCode, password) {
      calls.findFamilyByPassword.push({ churchCode, password });
      return Promise.resolve(password === '22222' ? foundFamily : null);
    },
  };

  function getElement(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        value: '',
        textContent: '',
        innerHTML: '',
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {},
        focus() {},
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
    },
    sessionStorage: {
      getItem(key) { return session.get(key) ?? null; },
      setItem(key, value) { session.set(key, value); },
      removeItem(key) { session.delete(key); },
    },
    document: {
      documentElement: { getAttribute() { return 'dark'; }, setAttribute() {} },
      getElementById: getElement,
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    window: { scrollTo() {}, addEventListener() {}, PAT_DB: db, location: { search: '' } },
    location: { search: '', origin: 'https://example.test', pathname: '/app/index.html' },
    navigator: {},
    PAT_DB: db,
    fetch(url) {
      calls.fetch.push(String(url));
      return Promise.resolve({
        json() { return Promise.resolve({ families: [{ id: 'family-1' }] }); },
      });
    },
    setTimeout(fn) { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
  };
  vm.runInNewContext(loadAppScript(), context);
  vm.runInNewContext('globalThis.__getChurchCode = () => DB.church.code;', context);
  return { context, getElement, storage, calls };
}

(async () => {
  const app = createLoginContext();

  app.getElement('churchCode').value = '11111';
  await app.context.enterChurch();
  assert.equal(app.context.__getChurchCode(), '11111');
  assert.match(app.getElement('toast').textContent, /가족 비밀번호로 입장/);

  app.getElement('churchCode').value = '22222';
  await app.context.enterChurch();

  assert.deepEqual(app.calls.findFamilyByPassword, [
    { churchCode: '11111', password: '22222' },
  ]);
  assert.equal(app.context.__getChurchCode(), '11111');
  assert.doesNotMatch(app.getElement('toast').textContent, /교회 코드가 올바르지 않습니다/);

  console.log('family login flow: PASS');
})();
