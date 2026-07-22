const assert = require('node:assert/strict');
const fs = require('node:fs');

const dbSource = fs.readFileSync('app/firebase-db.js', 'utf8');
const appCoreSource = fs.readFileSync('app/js/app-core.js', 'utf8');
const functionsSource = fs.readFileSync('functions/index.js', 'utf8');
const swSource = fs.readFileSync('app/sw.js', 'utf8');
const firebaseConfig = fs.readFileSync('firebase.json', 'utf8');

assert.match(
  dbSource,
  /config\.verse\.ref\s*\+\s*'\|'\s*\+\s*config\.verse\.text\s*\+\s*'\|'\s*\+\s*config\.verse\.weekOf/,
  'config polling hash must include weekOf so mobile detects date/week-only verse edits',
);

// ★ SW v204: 무캐시 패스스루로 재작성됨(크로스오리진 분기 제거). 최신성 보장 방식이 바뀌었다.
//   ① 네비게이션은 no-store로 항상 네트워크 최신 index.html, ② 그 외 요청은 캐시하지 않고 통과.
assert.match(
  swSource,
  /event\.request\.mode === 'navigate'/,
  'service worker must handle navigation explicitly to guarantee fresh index.html',
);

assert.match(
  swSource,
  /fetch\(event\.request,\s*\{\s*cache:\s*'no-store'\s*\}\)/,
  'service worker navigation must use no-store fetch so installed PWAs get the latest app',
);

assert.doesNotMatch(
  swSource,
  /caches\.open\([^)]*\)[\s\S]{0,40}\.put\(/,
  'service worker must not cache responses (no-cache passthrough prevents stale app JS on mobile)',
);

assert.match(
  firebaseConfig,
  /"\*\*\/\*\.js"[\s\S]*?"Cache-Control"[\s\S]*?"public, max-age=0, must-revalidate"/,
  'Firebase Hosting must not serve stale app JavaScript to installed mobile PWAs',
);

assert.match(
  appCoreSource,
  /getLatestVerse\(DB\.church\.code\)/,
  'client must fall back to getLatestVerse when getConfig has no verse',
);

assert.match(
  appCoreSource,
  /function applyCloudConfig\(config\)/,
  'client must centralize cloud config application so mobile screens stay in sync',
);

assert.match(
  appCoreSource,
  /saveVerses\(\[DB\.verse\]\)/,
  'cloud config updates must refresh local pat_verses backup used by mobile screens',
);

assert.match(
  appCoreSource,
  /function syncAdminVerseFields\(\)/,
  'admin inputs must be refreshed when a cloud verse update is applied on mobile',
);

assert.match(
  appCoreSource,
  /document\.getElementById\('inRef'\)\.value\s*=\s*DB\.verse\.ref/,
  'admin verse reference input must receive the latest cloud verse',
);

assert.match(
  appCoreSource,
  /document\.getElementById\('inText'\)\.value\s*=\s*DB\.verse\.text/,
  'admin verse text input must receive the latest cloud verse',
);

assert.match(
  functionsSource,
  /collection\(`churches\/\$\{churchCode\}\/verses`\)[\s\S]*orderBy\('createdAt', 'desc'\)[\s\S]*config:\s*\{\s*appTitle:/,
  'getConfig endpoint must fall back to latest legacy verse for already-installed mobile apps',
);

console.log('mobile verse sync: PASS');
