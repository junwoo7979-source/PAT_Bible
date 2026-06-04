const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TOKEN_PATH = path.resolve(process.cwd(), '.kakao-tokens.json');

function loadTokens(filePath = DEFAULT_TOKEN_PATH) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveTokens(tokens, filePath = DEFAULT_TOKEN_PATH) {
  fs.writeFileSync(filePath, `${JSON.stringify(tokens, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return tokens;
}

function mergeTokenResponse(current, response, now = Date.now()) {
  const merged = {
    ...current,
    access_token: response.access_token,
    access_token_expires_at: now + (Number(response.expires_in) * 1000),
  };

  if (response.refresh_token) {
    merged.refresh_token = response.refresh_token;
  }
  if (response.refresh_token_expires_in) {
    merged.refresh_token_expires_at = now + (Number(response.refresh_token_expires_in) * 1000);
  }
  return merged;
}

function isAccessTokenValid(tokens, now = Date.now()) {
  return Boolean(tokens.access_token && tokens.access_token_expires_at > now);
}

module.exports = {
  DEFAULT_TOKEN_PATH,
  isAccessTokenValid,
  loadTokens,
  mergeTokenResponse,
  saveTokens,
};
