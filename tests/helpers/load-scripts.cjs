'use strict';
// 테스트에서 외부 JS 모듈을 하나의 스크립트로 연결하는 헬퍼
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FILES = [
  'app/js/app-core.js',
  'app/js/verse.js',
  'app/js/family.js',
  'app/js/voice.js',
  'app/js/voice-ui.js',
  'app/js/memorize.js',
];

function loadAppScript() {
  return FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
}

module.exports = { loadAppScript };
