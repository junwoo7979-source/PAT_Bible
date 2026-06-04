const assert = require('node:assert/strict');

const {
  buildDefaultBrief,
  buildMarketBriefTemplate,
  sendKakaoMemo,
  validateKakaoConfig,
} = require('../scripts/kakao-send-to-me.cjs');

const defaultBrief = buildDefaultBrief();
assert.doesNotMatch(defaultBrief.url, /example\.com/);
assert.doesNotMatch(defaultBrief.imageUrl, /example\.com/);

const brief = {
  title: '미국증시 장 마감 브리핑',
  summary: 'AI 반도체와 서버 인프라 흐름을 점검하고 국내 증시 영향을 정리했습니다.',
  url: 'https://example.com/pat-market-brief',
  imageUrl: 'https://example.com/pat-card-news-cover.png',
  relatedStocks: ['삼성전자', 'SK하이닉스', '한미반도체'],
};

const template = buildMarketBriefTemplate(brief);

assert.equal(template.object_type, 'feed');
assert.equal(template.content.title, brief.title);
assert.match(template.content.description, /국내 증시 영향/);
assert.equal(template.content.link.web_url, brief.url);
assert.equal(template.content.image_url, brief.imageUrl);
assert.equal(template.buttons[0].title, '브리핑 보기');

assert.deepEqual(validateKakaoConfig({}), {
  ok: false,
  missing: ['KAKAO_ACCESS_TOKEN'],
});

let request;
sendKakaoMemo({
  accessToken: 'test-token',
  template,
  fetchImpl: async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return { result_code: 0 };
      },
    };
  },
}).then((result) => {
  assert.deepEqual(result, { result_code: 0 });
  assert.equal(request.url, 'https://kapi.kakao.com/v2/api/talk/memo/default/send');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer test-token');
  assert.match(String(request.options.body), /template_object=/);
  console.log('kakao send-to-me helper: PASS');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
