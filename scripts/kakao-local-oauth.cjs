const http = require('node:http');

const { loadEnvFile } = require('./env-loader.cjs');
const { buildAuthorizeUrl, exchangeKakaoCode } = require('./kakao-oauth.cjs');
const { buildDefaultBrief, buildMarketBriefTemplate, sendKakaoMemo } = require('./kakao-send-to-me.cjs');

const DEFAULT_PORT = 8766;
const DEFAULT_PATH = '/oauth/kakao';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildCallbackHtml({ status, title, message }) {
  const color = status === 'success' ? '#10b981' : '#ef4444';
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #111827; color: #f9fafb; }
    main { width: min(560px, calc(100vw - 32px)); padding: 32px; border: 1px solid #374151; border-radius: 20px; background: #1f2937; }
    .badge { color: ${color}; font-weight: 700; }
    p { line-height: 1.7; color: #d1d5db; }
  </style>
</head>
<body>
  <main>
    <div class="badge">${escapeHtml(status)}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}

function validateLocalOAuthConfig(env = process.env) {
  const required = ['KAKAO_REST_API_KEY'];
  const missing = required.filter((name) => !env[name]);
  return {
    ok: missing.length === 0,
    missing,
  };
}

function createCallbackServer({
  port = DEFAULT_PORT,
  callbackPath = DEFAULT_PATH,
  restApiKey = process.env.KAKAO_REST_API_KEY,
  redirectUri = `http://localhost:${port}${callbackPath}`,
  onComplete = () => {},
} = {}) {
  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, redirectUri);

    if (requestUrl.pathname !== callbackPath) {
      res.writeHead(404, { 'Content-Type': 'text/plain;charset=utf-8' });
      res.end('Not found');
      return;
    }

    const code = requestUrl.searchParams.get('code');
    const error = requestUrl.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html;charset=utf-8' });
      res.end(buildCallbackHtml({
        status: 'error',
        title: '카카오 동의 실패',
        message: requestUrl.searchParams.get('error_description') || error,
      }));
      onComplete({ ok: false, error });
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html;charset=utf-8' });
      res.end(buildCallbackHtml({
        status: 'error',
        title: '카카오 인가 코드 없음',
        message: '콜백 URL에 code 값이 없습니다.',
      }));
      onComplete({ ok: false, error: 'missing_code' });
      return;
    }

    try {
      const token = await exchangeKakaoCode({ restApiKey, redirectUri, code });
      const template = buildMarketBriefTemplate(buildDefaultBrief());
      const result = await sendKakaoMemo({
        accessToken: token.access_token,
        template,
      });

      res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
      res.end(buildCallbackHtml({
        status: 'success',
        title: '카카오톡 전송 완료',
        message: `나와의 채팅방으로 카드뉴스를 보냈습니다. result_code=${result.result_code}`,
      }));
      onComplete({ ok: true, result });
    } catch (caughtError) {
      res.writeHead(500, { 'Content-Type': 'text/html;charset=utf-8' });
      res.end(buildCallbackHtml({
        status: 'error',
        title: '카카오톡 전송 실패',
        message: caughtError.message,
      }));
      onComplete({ ok: false, error: caughtError.message });
    }
  });

  return {
    server,
    authorizeUrl: buildAuthorizeUrl({ restApiKey, redirectUri }),
    redirectUri,
  };
}

function main() {
  loadEnvFile();
  const port = Number(process.env.KAKAO_LOCAL_PORT || DEFAULT_PORT);
  const callbackPath = process.env.KAKAO_CALLBACK_PATH || DEFAULT_PATH;
  const config = validateLocalOAuthConfig();

  if (!config.ok) {
    console.error(`Missing required environment variables: ${config.missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const { server, authorizeUrl, redirectUri } = createCallbackServer({ port, callbackPath });

  server.listen(port, () => {
    console.log(`Kakao local callback server: http://localhost:${port}`);
    console.log(`Register Redirect URI in Kakao Developers: ${redirectUri}`);
    console.log(`Open this authorize URL: ${authorizeUrl.toString()}`);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_PATH,
  DEFAULT_PORT,
  buildCallbackHtml,
  createCallbackServer,
  validateLocalOAuthConfig,
};
