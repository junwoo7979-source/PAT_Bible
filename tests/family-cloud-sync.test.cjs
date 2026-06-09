const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function createContext(fakeDb) {
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
    window: { scrollTo() {}, addEventListener() {}, PAT_DB: fakeDb },
    navigator: {},
    PAT_DB: fakeDb,
    setTimeout() { return 1; },
    clearTimeout() {},
  };
  vm.runInNewContext(script, context);
  return { context, getElement, storage };
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

  console.log('family cloud sync: PASS');
})();
