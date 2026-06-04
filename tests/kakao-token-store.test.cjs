const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  isAccessTokenValid,
  loadTokens,
  mergeTokenResponse,
  saveTokens,
} = require('../scripts/kakao-token-store.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kakao-token-store-'));
const filePath = path.join(dir, '.kakao-tokens.json');
const now = 1_800_000_000_000;

const stored = mergeTokenResponse({}, {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  refresh_token_expires_in: 86400,
}, now);

saveTokens(stored, filePath);
assert.deepEqual(loadTokens(filePath), stored);
assert.equal(isAccessTokenValid(stored, now), true);
assert.equal(isAccessTokenValid(stored, now + 3_700_000), false);

const refreshed = mergeTokenResponse(stored, {
  access_token: 'new-access-token',
  expires_in: 3600,
}, now + 3_700_000);

assert.equal(refreshed.refresh_token, 'refresh-token');
assert.equal(refreshed.access_token, 'new-access-token');
console.log('kakao token store: PASS');
