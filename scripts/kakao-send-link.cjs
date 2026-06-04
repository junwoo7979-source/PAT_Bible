// PAT Bible 앱 링크를 카카오톡 '나에게 보내기'로 전송
const { loadEnvFile } = require('./env-loader.cjs');
const { sendKakaoMemo } = require('./kakao-send-to-me.cjs');
const { getUsableAccessToken } = require('./kakao-send-authenticated.cjs');
const { loadTokens } = require('./kakao-token-store.cjs');

const APP_URL = 'https://junwoo7979-source.github.io/PAT_Bible/app/index.html';

function buildLinkTemplate() {
  return {
    object_type: 'feed',
    content: {
      title: 'PAT Bible 성경 암송 앱',
      description: '세광교회 PAT · 모바일에서 바로 사용하세요.\n교회 코드 11111 로 입장 → 음성·타이핑 4중 검증 암송',
      image_url: 'https://opengraph.githubassets.com/1/junwoo7979-source/PAT_Bible',
      image_width: 800,
      image_height: 800,
      link: { web_url: APP_URL, mobile_web_url: APP_URL },
    },
    buttons: [
      { title: '앱 열기', link: { web_url: APP_URL, mobile_web_url: APP_URL } },
    ],
  };
}

async function main() {
  loadEnvFile();
  const accessToken = await getUsableAccessToken({ tokens: loadTokens() });
  const result = await sendKakaoMemo({ accessToken, template: buildLinkTemplate() });
  console.log(JSON.stringify({ result_code: result.result_code }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildLinkTemplate };
