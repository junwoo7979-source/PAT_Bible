const assert = require('node:assert/strict');

const {
  buildAuthorizeUrl,
  exchangeKakaoCode,
  refreshKakaoToken,
  validateOAuthConfig,
} = require('../scripts/kakao-oauth.cjs');

const authorizeUrl = buildAuthorizeUrl({
  restApiKey: 'rest-key',
  redirectUri: 'http://localhost:8766/oauth/kakao',
});

assert.equal(authorizeUrl.origin, 'https://kauth.kakao.com');
assert.equal(authorizeUrl.pathname, '/oauth/authorize');
assert.equal(authorizeUrl.searchParams.get('response_type'), 'code');
assert.equal(authorizeUrl.searchParams.get('client_id'), 'rest-key');
assert.equal(authorizeUrl.searchParams.get('redirect_uri'), 'http://localhost:8766/oauth/kakao');
assert.equal(authorizeUrl.searchParams.get('scope'), 'talk_message');

assert.deepEqual(validateOAuthConfig({}), {
  ok: false,
  missing: ['KAKAO_REST_API_KEY', 'KAKAO_REDIRECT_URI'],
});

let request;
exchangeKakaoCode({
  restApiKey: 'rest-key',
  redirectUri: 'http://localhost:8766/oauth/kakao',
  code: 'auth-code',
  clientSecret: 'client-secret',
  fetchImpl: async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 21599,
        };
      },
    };
  },
}).then((result) => {
  assert.equal(result.access_token, 'access-token');
  assert.equal(request.url, 'https://kauth.kakao.com/oauth/token');
  assert.equal(request.options.method, 'POST');
  assert.match(String(request.options.body), /grant_type=authorization_code/);
  assert.match(String(request.options.body), /code=auth-code/);
  assert.match(String(request.options.body), /client_secret=client-secret/);
  return refreshKakaoToken({
    restApiKey: 'rest-key',
    clientSecret: 'client-secret',
    refreshToken: 'refresh-token',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { access_token: 'new-access-token', expires_in: 21599 };
        },
      };
    },
  });
}).then((result) => {
  assert.equal(result.access_token, 'new-access-token');
  assert.match(String(request.options.body), /grant_type=refresh_token/);
  assert.match(String(request.options.body), /refresh_token=refresh-token/);
  assert.match(String(request.options.body), /client_secret=client-secret/);
  console.log('kakao oauth helper: PASS');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
