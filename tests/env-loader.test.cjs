const assert = require('node:assert/strict');

const { parseEnvText, applyEnv } = require('../scripts/env-loader.cjs');

const parsed = parseEnvText(`
# comment
KAKAO_REST_API_KEY=rest-key
KAKAO_REDIRECT_URI="http://localhost:8766/oauth/kakao"
PAT_MARKET_BRIEF_TITLE='미국증시 장 마감 브리핑'
EMPTY_VALUE=
`);

assert.deepEqual(parsed, {
  KAKAO_REST_API_KEY: 'rest-key',
  KAKAO_REDIRECT_URI: 'http://localhost:8766/oauth/kakao',
  PAT_MARKET_BRIEF_TITLE: '미국증시 장 마감 브리핑',
  EMPTY_VALUE: '',
});

const env = { KAKAO_REST_API_KEY: 'already-set' };
applyEnv(parsed, env);

assert.equal(env.KAKAO_REST_API_KEY, 'already-set');
assert.equal(env.KAKAO_REDIRECT_URI, 'http://localhost:8766/oauth/kakao');

console.log('env loader: PASS');
