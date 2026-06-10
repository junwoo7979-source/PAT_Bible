'use strict';

const assert = require('node:assert/strict');
const {
  hashFamilyPassword,
  verifyFamilyPassword,
  sanitizeFamilyDataForSave,
  publicFamily,
} = require('../functions/password');

const hash = hashFamilyPassword('11111', '22222', 'pepper');

assert.match(hash, /^v1\$/);
assert.notEqual(hash, '22222');
assert.equal(hashFamilyPassword('11111', '22222', 'pepper'), hash);
assert.equal(verifyFamilyPassword('11111', '22222', hash, 'pepper'), true);
assert.equal(verifyFamilyPassword('11111', 'wrong', hash, 'pepper'), false);

const sanitized = sanitizeFamilyDataForSave('11111', {
  roomName: '믿음 가족방',
  familyPassword: '22222',
  members: ['김민수'],
}, 'pepper');

assert.equal(sanitized.familyPassword, undefined);
assert.equal(sanitized.familyPasswordHash, hash);
assert.deepEqual(sanitized.members, ['김민수']);

const exposed = publicFamily('family-1', {
  roomName: '믿음 가족방',
  familyPassword: '22222',
  familyPasswordHash: hash,
});

assert.equal(exposed.id, 'family-1');
assert.equal(exposed.roomName, '믿음 가족방');
assert.equal(exposed.familyPassword, undefined);
assert.equal(exposed.familyPasswordHash, undefined);

console.log('functions password: PASS');
