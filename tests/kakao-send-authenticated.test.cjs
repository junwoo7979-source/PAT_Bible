const assert = require('node:assert/strict');

const { getUsableAccessToken } = require('../scripts/kakao-send-authenticated.cjs');

async function run() {
  let refreshCalls = 0;
  let saved;

  const valid = await getUsableAccessToken({
    tokens: { access_token: 'valid-token', access_token_expires_at: 2_000 },
    now: 1_000,
    refreshToken: async () => {
      refreshCalls += 1;
    },
  });
  assert.equal(valid, 'valid-token');
  assert.equal(refreshCalls, 0);

  const refreshed = await getUsableAccessToken({
    tokens: {
      access_token: 'expired-token',
      access_token_expires_at: 500,
      refresh_token: 'refresh-token',
    },
    now: 1_000,
    refreshToken: async ({ refreshToken }) => {
      refreshCalls += 1;
      assert.equal(refreshToken, 'refresh-token');
      return { access_token: 'new-token', expires_in: 3600 };
    },
    save: (tokens) => {
      saved = tokens;
    },
  });
  assert.equal(refreshed, 'new-token');
  assert.equal(refreshCalls, 1);
  assert.equal(saved.refresh_token, 'refresh-token');

  await assert.rejects(
    getUsableAccessToken({ tokens: {}, now: 1_000 }),
    /Kakao login is required/,
  );
  console.log('kakao authenticated sender: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
