// 안부 메시지를 카카오톡 '나에게 보내기'로 전송
const { loadEnvFile } = require('./env-loader.cjs');
const { sendKakaoMemo } = require('./kakao-send-to-me.cjs');
const { getUsableAccessToken } = require('./kakao-send-authenticated.cjs');
const { loadTokens } = require('./kakao-token-store.cjs');

function buildGreetingTemplate() {
  const text = '안녕하세요! 요즘 잘 지내고 계신가요?\n날씨 변화가 잦은 요즘 건강 잘 챙기시고, 하시는 일 모두 평안하시길 바랍니다. 오늘도 좋은 하루 보내세요 😊';
  return {
    object_type: 'text',
    text,
    link: { web_url: 'https://www.google.com', mobile_web_url: 'https://www.google.com' },
  };
}

async function main() {
  loadEnvFile();
  const accessToken = await getUsableAccessToken({ tokens: loadTokens() });
  const result = await sendKakaoMemo({ accessToken, template: buildGreetingTemplate() });
  console.log(JSON.stringify({ result_code: result.result_code }, null, 2));
}

if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { buildGreetingTemplate };
