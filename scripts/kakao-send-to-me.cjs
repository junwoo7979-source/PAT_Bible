const { loadEnvFile } = require('./env-loader.cjs');

const KAKAO_MEMO_ENDPOINT = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';
const DEFAULT_BRIEF_URL = 'https://junwoo7979-source.github.io/pat-market-brief/';
const DEFAULT_BRIEF_IMAGE_URL = 'https://opengraph.githubassets.com/1/junwoo7979-source/pat-market-brief';

function buildMarketBriefTemplate(brief) {
  const title = brief.title || '미국증시 장 마감 브리핑';
  const summary = brief.summary || '미국증시 특징주와 국내 증시 영향을 정리했습니다.';
  const url = brief.url || DEFAULT_BRIEF_URL;
  const imageUrl = brief.imageUrl || DEFAULT_BRIEF_IMAGE_URL;
  const relatedStocks = Array.isArray(brief.relatedStocks) ? brief.relatedStocks.join(', ') : '';
  const description = relatedStocks ? `${summary}\n\n한국 연관 종목: ${relatedStocks}` : summary;

  return {
    object_type: 'feed',
    content: {
      title,
      description,
      image_url: imageUrl,
      image_width: 800,
      image_height: 800,
      link: {
        web_url: url,
        mobile_web_url: url,
      },
    },
    buttons: [
      {
        title: '브리핑 보기',
        link: {
          web_url: url,
          mobile_web_url: url,
        },
      },
    ],
  };
}

function validateKakaoConfig(env = process.env) {
  const required = ['KAKAO_ACCESS_TOKEN'];
  const missing = required.filter((name) => !env[name]);
  return {
    ok: missing.length === 0,
    missing,
  };
}

async function sendKakaoMemo({ accessToken, template, fetchImpl = globalThis.fetch }) {
  if (!accessToken) {
    throw new Error('KAKAO_ACCESS_TOKEN is required.');
  }

  if (!fetchImpl) {
    throw new Error('fetch is not available. Use Node 18+ or pass fetchImpl.');
  }

  const body = new URLSearchParams();
  body.set('template_object', JSON.stringify(template));

  const response = await fetchImpl(KAKAO_MEMO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.msg || payload.message || `Kakao API request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function buildDefaultBrief() {
  return {
    title: process.env.PAT_MARKET_BRIEF_TITLE || '미국증시 장 마감 브리핑',
    summary: process.env.PAT_MARKET_BRIEF_SUMMARY || 'AI 반도체와 서버 인프라 흐름을 점검하고 국내 증시 영향을 정리했습니다.',
    url: process.env.PAT_MARKET_BRIEF_URL || DEFAULT_BRIEF_URL,
    imageUrl: process.env.PAT_MARKET_BRIEF_IMAGE_URL || DEFAULT_BRIEF_IMAGE_URL,
    relatedStocks: [
      '삼성전자',
      'SK하이닉스',
      '한미반도체',
      '이수페타시스',
      '대덕전자',
      '리노공업',
      'ISC',
      'HPSP',
      '원익IPS',
      '테크윙',
    ],
  };
}

async function main() {
  loadEnvFile();
  const config = validateKakaoConfig();
  const template = buildMarketBriefTemplate(buildDefaultBrief());

  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(template, null, 2));
    return;
  }

  if (!config.ok) {
    console.error(`Missing required environment variables: ${config.missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const result = await sendKakaoMemo({
    accessToken: process.env.KAKAO_ACCESS_TOKEN,
    template,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_BRIEF_IMAGE_URL,
  DEFAULT_BRIEF_URL,
  KAKAO_MEMO_ENDPOINT,
  buildDefaultBrief,
  buildMarketBriefTemplate,
  sendKakaoMemo,
  validateKakaoConfig,
};
