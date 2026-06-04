const assert = require('node:assert/strict');

const {
  buildCallbackHtml,
  persistTokenResponse,
  validateLocalOAuthConfig,
} = require('../scripts/kakao-local-oauth.cjs');

assert.deepEqual(validateLocalOAuthConfig({}), {
  ok: false,
  missing: ['KAKAO_REST_API_KEY'],
});

assert.deepEqual(validateLocalOAuthConfig({ KAKAO_REST_API_KEY: 'rest-key' }), {
  ok: true,
  missing: [],
});

const successHtml = buildCallbackHtml({
  status: 'success',
  title: '카카오톡 전송 완료',
  message: '나와의 채팅방으로 카드뉴스를 보냈습니다.',
});

assert.match(successHtml, /카카오톡 전송 완료/);
assert.match(successHtml, /나와의 채팅방/);

const failureHtml = buildCallbackHtml({
  status: 'error',
  title: '카카오톡 전송 실패',
  message: '<script>alert("x")</script>',
});

assert.match(failureHtml, /카카오톡 전송 실패/);
assert.doesNotMatch(failureHtml, /<script>alert/);
assert.match(failureHtml, /&lt;script&gt;alert/);

let persisted;
const persistedTokens = persistTokenResponse({
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
}, {
  now: 1_800_000_000_000,
  save: (tokens) => {
    persisted = tokens;
  },
});

assert.equal(persistedTokens.access_token, 'access-token');
assert.equal(persisted.refresh_token, 'refresh-token');
assert.equal(persisted.access_token_expires_at, 1_800_003_600_000);

console.log('kakao local oauth helper: PASS');
