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
  sessionStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  },
  document: {
    documentElement: { getAttribute() { return 'dark'; }, setAttribute() {} },
    getElementById: getElement,
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
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

// ★ 중립 시작 정책(2026-07): 교회 미선택이면 커스텀 타이틀 대신 항상 "PAT Bible".
//   커스텀 타이틀 표시는 교회가 선택된 상태에서만 검증한다.
context.adoptChurch('#482913', '세광교회');   // vm에서 const DB는 비노출 → 함수로 설정

getElement('inAppTitle').value = '세광교회 PAT';
context.saveAppTitle();
assert.equal(storage.get('pat_app_title'), '세광교회 PAT');
assert.equal(getElement('loginAppTitle').textContent, '세광교회 PAT');

// ★ applyStoredData는 타이틀 적용을 completeAppInitialization(setTimeout 경유)으로
//   미루므로, 저장값 반영 단위인 applyAppTitle을 직접 검증한다.
storage.set('pat_app_title', '우리교회 암송');
context.applyAppTitle();
assert.equal(getElement('loginAppTitle').textContent, '우리교회 암송');

// ※ 관리자 로그인/로그아웃은 서버 인증(PAT_DB.adminLogin)으로 이관되어
//   admin-separation.test.cjs 에서 검증한다(이 헬퍼는 admin.js를 로드하지 않음).

console.log('app title persistence: PASS');
