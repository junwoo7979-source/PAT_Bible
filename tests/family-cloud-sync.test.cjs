const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const { loadAppScript } = require('./helpers/load-scripts.cjs');
const script = loadAppScript();

function createContext(fakeDb) {
  const elements = new Map();
  const storage = new Map();
  const intervals = [];

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
    window: { scrollTo() {}, addEventListener() {}, PAT_DB: fakeDb },
    navigator: {},
    PAT_DB: fakeDb,
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval() {},
  };
  vm.runInNewContext(script, context);
  return { context, getElement, storage, intervals };
}

(async () => {
  const savedProfiles = [];
  const joined = [];
  const fakeDb = {
    init() { return true; },
    ready() { return true; },
    subscribeVerse() {},
    saveFamily(churchCode, profile) {
      savedProfiles.push({ churchCode, profile });
      return Promise.resolve('family-1');
    },
    joinFamily(churchCode, familyId, name) {
      joined.push({ churchCode, familyId, name });
      return Promise.resolve();
    },
  };
  const leaderCase = createContext(fakeDb);
  leaderCase.getElement('familyRoomName').value = '믿음 가족방';
  leaderCase.getElement('familyLeaderName').value = '김민수';
  leaderCase.getElement('familyParish').value = '동부교구';
  leaderCase.getElement('familyDistrict').value = '3구역';
  leaderCase.getElement('familyPassword').value = '22222';

  leaderCase.context.saveFamilyProfile();
  await Promise.resolve();

  assert.equal(savedProfiles[0].profile.familyPassword, '22222');
  assert.deepEqual(Array.from(savedProfiles[0].profile.members), ['김민수']);
  assert.equal(joined[0].familyId, 'family-1');

  const foundFamily = {
    id: 'family-1',
    roomName: '믿음 가족방',
    leaderName: '김민수',
    parish: '동부교구',
    district: '3구역',
    familyPassword: '22222',
    members: ['김민수'],
  };
  const memberJoins = [];
  const memberDb = {
    init() { return true; },
    ready() { return true; },
    subscribeVerse() {},
    findFamilyByPassword(churchCode, password) {
      assert.equal(churchCode, '11111');
      assert.equal(password, '22222');
      return Promise.resolve(foundFamily);
    },
    joinFamily(churchCode, familyId, name) {
      memberJoins.push({ churchCode, familyId, name });
      return Promise.resolve();
    },
  };
  const memberCase = createContext(memberDb);
  memberCase.getElement('joinMemberName').value = '예운';
  memberCase.getElement('joinPassword').value = '22222';

  await memberCase.context.joinFamilyManual();

  const joinedProfile = JSON.parse(memberCase.storage.get('pat_family_profile'));
  assert.equal(memberCase.storage.get('pat_family_id'), 'family-1');
  assert.equal(joinedProfile.roomName, '믿음 가족방');
  assert.deepEqual(Array.from(joinedProfile.members), ['김민수', '예운']);
  assert.equal(memberJoins[0].familyId, 'family-1');
  assert.equal(memberJoins[0].name, '예운');

  let progressCalls = 0;
  const progressDb = {
    init() { return true; },
    ready() { return true; },
    subscribeVerse() {},
    getFamilyProgress(churchCode, familyId, verseRef) {
      progressCalls++;
      assert.equal(churchCode, '11111');
      assert.equal(familyId, 'family-1');
      assert.equal(verseRef, '요한복음 3:16');
      return Promise.resolve([
        { displayName: '김민수', deviceId: 'leader-device', done: false },
        { displayName: '예운', deviceId: 'member-device', done: true },
        { displayName: '아들1', deviceId: 'son-device', done: true },
      ]);
    },
  };
  const progressCase = createContext(progressDb);
  progressCase.storage.set('pat_family_id', 'family-1');
  progressCase.storage.set('pat_family_profile', JSON.stringify(foundFamily));
  await progressCase.context.renderFamily();

  assert.equal(progressCalls, 1);
  assert.match(progressCase.getElement('memberList').innerHTML, /예운/);
  assert.match(progressCase.getElement('memberList').innerHTML, /아들1/);
  assert.match(progressCase.getElement('memberList').innerHTML, /✔ 완료/);
  assert.equal(progressCase.getElement('familyProgress').textContent, '이번 주 달성률 2/3명');
  assert.equal(progressCase.intervals.length, 1);
  assert.equal(progressCase.intervals[0].ms, 10000);
  await progressCase.intervals[0].fn();
  assert.equal(progressCalls, 2);

  console.log('family cloud sync: PASS');
})();
