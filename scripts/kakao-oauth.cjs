const KAKAO_AUTHORIZE_ENDPOINT = 'https://kauth.kakao.com/oauth/authorize';
const KAKAO_TOKEN_ENDPOINT = 'https://kauth.kakao.com/oauth/token';

function buildAuthorizeUrl({
  restApiKey = process.env.KAKAO_REST_API_KEY,
  redirectUri = process.env.KAKAO_REDIRECT_URI,
  scope = 'talk_message',
} = {}) {
  if (!restApiKey) {
    throw new Error('KAKAO_REST_API_KEY is required.');
  }
  if (!redirectUri) {
    throw new Error('KAKAO_REDIRECT_URI is required.');
  }

  const url = new URL(KAKAO_AUTHORIZE_ENDPOINT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', restApiKey);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope);
  return url;
}

function validateOAuthConfig(env = process.env) {
  const required = ['KAKAO_REST_API_KEY', 'KAKAO_REDIRECT_URI'];
  const missing = required.filter((name) => !env[name]);
  return {
    ok: missing.length === 0,
    missing,
  };
}

async function exchangeKakaoCode({
  restApiKey = process.env.KAKAO_REST_API_KEY,
  redirectUri = process.env.KAKAO_REDIRECT_URI,
  code,
  fetchImpl = globalThis.fetch,
}) {
  if (!restApiKey) {
    throw new Error('KAKAO_REST_API_KEY is required.');
  }
  if (!redirectUri) {
    throw new Error('KAKAO_REDIRECT_URI is required.');
  }
  if (!code) {
    throw new Error('KAKAO_AUTHORIZE_CODE is required.');
  }
  if (!fetchImpl) {
    throw new Error('fetch is not available. Use Node 18+ or pass fetchImpl.');
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', restApiKey);
  body.set('redirect_uri', redirectUri);
  body.set('code', code);

  const response = await fetchImpl(KAKAO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error_description || payload.msg || `Kakao token request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function main() {
  const command = process.argv[2] || 'authorize-url';

  if (command === 'authorize-url') {
    const config = validateOAuthConfig();
    if (!config.ok) {
      console.error(`Missing required environment variables: ${config.missing.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(buildAuthorizeUrl().toString());
    return;
  }

  if (command === 'exchange-code') {
    const code = process.env.KAKAO_AUTHORIZE_CODE || process.argv[3];
    const token = await exchangeKakaoCode({ code });
    console.log(JSON.stringify({
      token_type: token.token_type,
      expires_in: token.expires_in,
      access_token_present: Boolean(token.access_token),
      refresh_token_present: Boolean(token.refresh_token),
    }, null, 2));
    return;
  }

  console.error('Usage: node scripts/kakao-oauth.cjs authorize-url|exchange-code [code]');
  process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  KAKAO_AUTHORIZE_ENDPOINT,
  KAKAO_TOKEN_ENDPOINT,
  buildAuthorizeUrl,
  exchangeKakaoCode,
  validateOAuthConfig,
};
