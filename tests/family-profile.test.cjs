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
  document: {
    documentElement: { getAttribute() { return 'dark'; }, setAttribute() {} },
    getElementById: getElement,
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
  },
  window: { scrollTo() {}, addEventListener() {}, location: { search: '' } },
  location: { search: '', origin: 'https://example.test', pathname: '/app/index.html' },
  navigator: {},
  setTimeout() { return 1; },
  clearTimeout() {},
};

vm.runInNewContext(script, context);

// 대표 등록 버튼 존재 확인 (2026-07-01: 구성원 등록 버튼은 제거 — 대표가 통일 관리)
assert.match(html, /openFamilyRegister\('leader'\)/);

getElement('familyRoomName').value = '믿음 가족방';
getElement('familyLeaderName').value = '김민수';
getElement('familyParish').value = '동부교구';
getElement('familyDistrict').value = '3구역';
// ★ 비밀번호 강도정책(8자+영문+숫자+특수문자) 충족 값
getElement('familyPassword').value = 'pw1234!a';
context.saveFamilyProfileAsLeader();

const saved = JSON.parse(storage.get('pat_family_profile'));
assert.equal(saved.roomName, '믿음 가족방');
assert.equal(saved.leaderName, '김민수');
assert.equal(saved.parish, '동부교구');
assert.equal(saved.district, '3구역');
assert.equal(saved.familyPassword, 'pw1234!a');
// members 필드가 배열로 저장되는지 확인 (비어있어도 OK)
assert.ok(Array.isArray(saved.members));
assert.equal(getElement('familyRoomTitle').textContent, '👨‍👩‍👧 믿음 가족방');
assert.equal(getElement('familyProfile').textContent, '대표 김민수 동부교구 3구역');

// ※ 구성원 등록 패널(panelMember/registeredFamilyMembers)과 member 탭은 제거됨 →
//   구성원 삭제 자체는 family-delete-preserves-records.test.cjs 에서 검증한다.

storage.set('pat_family_profile', JSON.stringify({
  roomName: '\uC608\uC6B4\uC774\uB124 \uAC00\uC871',
  leaderName: '\uC608\uC6B4',
  parish: '1',
  district: '2',
  familyPassword: '33333',
  members: [],
}));
context.renderFamily();
assert.match(getElement('familyRoomTitle').textContent, /\uC608\uC6B4\uC774\uB124 \uAC00\uC871/);
assert.match(getElement('memberList').innerHTML, /\uC608\uC6B4/);

storage.delete('pat_family_profile');
getElement('joinMemberName').value = '\uC608\uC6B4';
getElement('joinPassword').value = '33333';
context.joinFamilyManual();
assert.match(getElement('familyRoomTitle').textContent, /\uC608\uC6B4\uC774\uB124 \uAC00\uC871/);
assert.match(getElement('memberList').innerHTML, /\uC608\uC6B4/);

storage.set('pat_family_profile', JSON.stringify(saved));
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
assert.equal(getElement('familyPassword').value, 'pw1234!a');

console.log('family profile persistence: PASS');
