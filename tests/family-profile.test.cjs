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

// 대표 등록 / 가족 참여 두 버튼이 모두 존재하는지 확인
assert.match(html, /onclick="openFamilyRegister\('leader'\)"/);
assert.match(html, /onclick="openFamilyRegister\('member'\)"/);

getElement('familyRoomName').value = '믿음 가족방';
getElement('familyLeaderName').value = '김민수';
getElement('familyParish').value = '동부교구';
getElement('familyDistrict').value = '3구역';
getElement('familyPassword').value = '22222';
context.saveFamilyProfile();

assert.deepEqual(
  JSON.parse(storage.get('pat_family_profile')),
  { roomName: '믿음 가족방', leaderName: '김민수', parish: '동부교구', district: '3구역', familyPassword: '22222' },
);
assert.equal(getElement('familyRoomTitle').textContent, '👨‍👩‍👧 믿음 가족방');
assert.equal(getElement('familyProfile').textContent, '대표 김민수 동부교구 3구역');

getElement('familyRoomName').value = '';
getElement('familyLeaderName').value = '';
getElement('familyParish').value = '';
getElement('familyDistrict').value = '';
getElement('familyPassword').value = '';
context.openFamilyRegister();
assert.equal(getElement('familyRoomName').value, '믿음 가족방');
assert.equal(getElement('familyLeaderName').value, '김민수');
assert.equal(getElement('familyParish').value, '동부교구');
assert.equal(getElement('familyDistrict').value, '3구역');
assert.equal(getElement('familyPassword').value, '22222');

console.log('family profile persistence: PASS');
