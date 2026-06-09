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
  window: { scrollTo() {}, addEventListener() {} },
  navigator: {},
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

const saved = JSON.parse(storage.get('pat_family_profile'));
assert.equal(saved.roomName, '믿음 가족방');
assert.equal(saved.leaderName, '김민수');
assert.equal(saved.parish, '동부교구');
assert.equal(saved.district, '3구역');
assert.equal(saved.familyPassword, '22222');
// members 필드가 배열로 저장되는지 확인 (비어있어도 OK)
assert.ok(Array.isArray(saved.members));
assert.equal(getElement('familyRoomTitle').textContent, '👨‍👩‍👧 믿음 가족방');
assert.equal(getElement('familyProfile').textContent, '대표 김민수 동부교구 3구역');

context.openFamilyRegister('member');
assert.equal(getElement('panelMember').style.display, '');
assert.match(getElement('registeredFamilyRoomName').textContent, /믿음 가족방/);
assert.match(getElement('registeredFamilyRoomMeta').textContent, /김민수/);
storage.set('pat_family_profile', JSON.stringify({ ...saved, members: ['김민수', '예운'] }));
context.openFamilyRegister('member');
assert.match(getElement('registeredFamilyMembers').innerHTML, /김민수/);
assert.match(getElement('registeredFamilyMembers').innerHTML, /예운/);
assert.match(getElement('registeredFamilyMembers').innerHTML, /family-member-chip/);
assert.equal((getElement('registeredFamilyMembers').innerHTML.match(/class="family-member-chip"/g) || []).length, 2);
assert.match(getElement('registeredFamilyMembers').innerHTML, /삭제/);
assert.equal((getElement('registeredFamilyMembers').innerHTML.match(/삭제/g) || []).length, 1);
context.deleteFamilyMember('예운');
const afterDelete = JSON.parse(storage.get('pat_family_profile'));
assert.deepEqual(afterDelete.members, ['김민수']);
assert.doesNotMatch(getElement('registeredFamilyMembers').innerHTML, /예운/);

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
assert.equal(getElement('familyPassword').value, '22222');

console.log('family profile persistence: PASS');
