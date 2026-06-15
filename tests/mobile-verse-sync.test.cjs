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

assert.match(
  swSource,
  /url\.origin\s*!==\s*location\.origin/,
  'service worker must bypass cache for cross-origin API requests',
);

assert.match(
  swSource,
  /fetch\(event\.request,\s*\{\s*cache:\s*'no-store'\s*\}\)/,
  'service worker must use no-store fetch for cross-origin API requests',
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
  functionsSource,
  /collection\(`churches\/\$\{churchCode\}\/verses`\)[\s\S]*orderBy\('createdAt', 'desc'\)[\s\S]*config:\s*\{\s*appTitle:/,
  'getConfig endpoint must fall back to latest legacy verse for already-installed mobile apps',
);

console.log('mobile verse sync: PASS');
