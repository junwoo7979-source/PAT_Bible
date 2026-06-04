const { loadEnvFile } = require('./env-loader.cjs');
const { refreshKakaoToken } = require('./kakao-oauth.cjs');
const { buildDefaultBrief, buildMarketBriefTemplate, sendKakaoMemo } = require('./kakao-send-to-me.cjs');
const { isAccessTokenValid, loadTokens, mergeTokenResponse, saveTokens } = require('./kakao-token-store.cjs');

async function getUsableAccessToken({
  tokens,
  now = Date.now(),
  refreshToken = refreshKakaoToken,
  save = saveTokens,
}) {
  if (isAccessTokenValid(tokens, now)) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) {
    throw new Error('Kakao login is required. Run: node scripts/kakao-local-oauth.cjs');
  }

  const response = await refreshToken({ refreshToken: tokens.refresh_token });
  const updated = mergeTokenResponse(tokens, response, now);
  save(updated);
  return updated.access_token;
}

async function main() {
  loadEnvFile();
  const accessToken = await getUsableAccessToken({ tokens: loadTokens() });
  const result = await sendKakaoMemo({
    accessToken,
    template: buildMarketBriefTemplate(buildDefaultBrief()),
  });
  console.log(JSON.stringify({ result_code: result.result_code }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  getUsableAccessToken,
};
