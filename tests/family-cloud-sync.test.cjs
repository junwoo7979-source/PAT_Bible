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
  const db = {
    init() { return true; },
    ready() { return true; },
    getConfig() { return Promise.resolve(null); },
    getLatestVerse() { return Promise.resolve(null); },
    subscribeConfig() {},
    subscribeVerse() {},
    ...fakeDb,
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
    document: {
      documentElement: { getAttribute() { return 'dark'; }, setAttribute() {} },
      getElementById: getElement,
      querySelectorAll() { return []; },
      addEventListener() {},
      removeEventListener() {},
    },
    window: { scrollTo() {}, addEventListener() {}, PAT_DB: db, location: { search: '' } },
    location: { search: '', origin: 'https://example.test', pathname: '/app/index.html' },
    navigator: {},
    PAT_DB: db,
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval() {},
  };
  vm.runInNewContext(script, context);
  // ★ 중립 시작 정책(2026-07): DB.church.code 기본값이 빈 값 → 실제 입장처럼 교회코드 지정
  if (typeof context.adoptChurch === 'function') context.adoptChurch('11111', '세광교회');
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
  leaderCase.getElement('familyPassword').value = 'pw1234!a';

  leaderCase.context.saveFamilyProfileAsLeader();
  await Promise.resolve();

  assert.equal(savedProfiles[0].profile.familyPassword, 'pw1234!a');
  assert.deepEqual(Array.from(savedProfiles[0].profile.members), ['김민수']);
  assert.equal(joined[0].familyId, 'family-1');

  const foundFamily = {
    id: 'family-1',
    roomName: '믿음 가족방',
    leaderName: '김민수',
    parish: '동부교구',
    district: '3구역',
    familyPassword: 'pw1234!a',
    members: ['김민수'],
  };
  const memberJoins = [];
  const memberDb = {
    init() { return true; },
    ready() { return true; },
    subscribeVerse() {},
    findFamilyByPassword(churchCode, password) {
      assert.equal(churchCode, '11111');
      assert.equal(password, 'pw1234!a');
      return Promise.resolve(foundFamily);
    },
    joinFamily(churchCode, familyId, name) {
      memberJoins.push({ churchCode, familyId, name });
      return Promise.resolve();
    },
  };
  const memberCase = createContext(memberDb);
  memberCase.getElement('joinMemberName').value = '예운';
  memberCase.getElement('joinPassword').value = 'pw1234!a';

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
      // ★ 홈 '완료' 표시는 오늘(KST) 기준 doneToday 만 사용한다(주간누적 done 아님)
      return Promise.resolve([
        { displayName: '김민수', deviceId: 'leader-device', done: false, doneToday: false },
        { displayName: '예운', deviceId: 'member-device', done: true, doneToday: true },
        { displayName: '아들1', deviceId: 'son-device', done: true, doneToday: true },
      ]);
    },
    getFamilyInfo(churchCode, familyId) {
      assert.equal(churchCode, '11111');
      assert.equal(familyId, 'family-1');
      return Promise.resolve(foundFamily);
    },
  };
  const progressCase = createContext(progressDb);
  progressCase.storage.set('pat_family_id', 'family-1');
  progressCase.storage.set('pat_family_profile', JSON.stringify(foundFamily));
  await progressCase.context.renderFamily();

  assert.equal(progressCalls, 1);
  assert.match(progressCase.getElement('memberList').innerHTML, /예운/);
  assert.match(progressCase.getElement('memberList').innerHTML, /아들1/);
  assert.match(progressCase.getElement('memberList').innerHTML, /✓ 완료/);
  assert.equal(progressCase.getElement('familyProgress').textContent, '오늘의 달성률 2/3명');
  assert.equal(progressCase.intervals.length, 1);
  assert.equal(progressCase.intervals[0].ms, 1000);
  await progressCase.intervals[0].fn();
  assert.equal(progressCalls, 2);

  const updatedFamilyInfo = {
    roomName: '사랑 가족방',
    leaderName: '김민수',
    parish: '동부교구',
    district: '3구역',
    members: ['김민수', '예운'],
  };
  const updateDb = {
    init() { return true; },
    ready() { return true; },
    subscribeVerse() {},
    getFamilyInfo(churchCode, familyId) {
      assert.equal(churchCode, '11111');
      assert.equal(familyId, 'family-1');
      return Promise.resolve(updatedFamilyInfo);
    },
    getFamilyProgress() {
      return Promise.resolve([
        { displayName: '김민수', done: true },
        { displayName: '예운', done: false },
      ]);
    },
  };
  const updateCase = createContext(updateDb);
  updateCase.storage.set('pat_family_id', 'family-1');
  updateCase.storage.set('pat_family_profile', JSON.stringify({
    roomName: '믿음 가족방',
    leaderName: '김민수',
    parish: '동부교구',
    district: '3구역',
    familyPassword: 'pw1234!a',
    memberName: '김민수',
    members: ['김민수', '삭제될이름'],
  }));
  updateCase.context.renderFamily();
  await updateCase.intervals[0].fn();
  const updatedProfile = JSON.parse(updateCase.storage.get('pat_family_profile'));
  assert.equal(updatedProfile.roomName, '사랑 가족방');
  assert.deepEqual(updatedProfile.members, ['김민수', '예운']);
  assert.doesNotMatch(updateCase.getElement('registeredFamilyMembers').innerHTML, /삭제될이름/);

  const latestFamily = {
    id: 'family-new',
    roomName: '예은데 말씀 방',
    leaderName: '권호택',
    parish: '1교구',
    district: '134구역',
    familyPassword: 'pw1234!a',
    members: ['권아빠', '엄마', '예은 파파', '예은 맘', '권호택'],
  };
  const reconnectDb = {
    init() { return true; },
    ready() { return true; },
    findFamilyByPassword(churchCode, password) {
      assert.equal(churchCode, '11111');
      assert.equal(password, 'pw1234!a');
      return Promise.resolve(latestFamily);
    },
    getFamilyProgress() {
      return Promise.resolve(latestFamily.members.map(name => ({ displayName: name, done: true })));
    },
  };
  const reconnectCase = createContext(reconnectDb);
  reconnectCase.storage.set('pat_family_id', 'family-old');
  reconnectCase.storage.set('pat_family_profile', JSON.stringify({
    roomName: '예은네',
    leaderName: '권호택',
    parish: '1교구',
    district: '134구역',
    familyPassword: 'pw1234!a',
    memberName: '권호택',
    members: ['권호택', '엄마현', '현'],
  }));
  reconnectCase.getElement('churchCode').value = 'pw1234!a';
  await reconnectCase.context.enterChurch();
  const reconnectedProfile = JSON.parse(reconnectCase.storage.get('pat_family_profile'));
  assert.equal(reconnectCase.storage.get('pat_family_id'), 'family-new');
  assert.equal(reconnectedProfile.roomName, '예은데 말씀 방');
  assert.deepEqual(reconnectedProfile.members, latestFamily.members);
  assert.match(reconnectCase.getElement('familyRoomTitle').textContent, /예은데 말씀 방/);
  assert.match(reconnectCase.getElement('memberList').innerHTML, /예은&nbsp;파파/);

  // ★ 안티하이재킹(family.js:156): 백그라운드 renderFamily 새로고침은 비밀번호만으로
  //   '다른' familyId 로 전환하지 않는다(기본 비번=교회코드 공유 시 남의 방으로 덮어쓰기 방지).
  //   → 현재 familyId(family-old)와 서버가 돌려준 family-new 가 다르면 프로필을 그대로 둔다.
  const antiHijackCase = createContext(reconnectDb);
  antiHijackCase.storage.set('pat_family_id', 'family-old');
  antiHijackCase.storage.set('pat_family_profile', JSON.stringify({
    roomName: '예은네',
    leaderName: '권호택',
    parish: '1교구',
    district: '134구역',
    familyPassword: 'pw1234!a',
    memberName: '권호택',
    members: ['권호택', '엄마현', '현'],
  }));
  await antiHijackCase.context.renderFamily();
  const antiHijackProfile = JSON.parse(antiHijackCase.storage.get('pat_family_profile'));
  assert.equal(antiHijackCase.storage.get('pat_family_id'), 'family-old');   // 핵심: familyId 전환 안 됨
  assert.equal(antiHijackProfile.roomName, '예은네');                        // roomName 하이재킹 안 됨(보존)
  // members 목록은 getFamilyProgress(실시간 명단) 경로로 갱신된다 — familyId 전환과는 무관
  assert.deepEqual(antiHijackProfile.members, latestFamily.members);

  console.log('family cloud sync: PASS');
})();
