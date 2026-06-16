'use strict';
// 모든 테스트 파일에서 사용할 수 있는 표준 context 생성 헬퍼
const vm = require('vm');

function createTestContext(customElements = {}, customStorage = {}) {
  const elements = new Map();
  const storage = new Map();

  // 사전 설정된 스토리지 로드
  Object.entries(customStorage).forEach(([k, v]) => {
    storage.set(k, v);
  });

  function getElement(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: customElements[id]?.value ?? '',
        textContent: customElements[id]?.textContent ?? '',
        innerHTML: customElements[id]?.innerHTML ?? '',
        disabled: false,
        dataset: {},
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {},
        focus() {},
        ...customElements[id],
      });
    }
    return elements.get(id);
  }

  const contextObj = {
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

  // 테스트에서 getElement를 사용 가능하도록 export
  return Object.assign(contextObj, { getElement });
}

module.exports = { createTestContext };
