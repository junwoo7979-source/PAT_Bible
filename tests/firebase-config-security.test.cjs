const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = fs.readFileSync('app/firebase-config.js', 'utf8');

assert.match(config, /adminToken:\s*''/, 'browser config must not contain an admin token');
assert.doesNotMatch(config, /[a-f0-9]{64}/i, 'browser config must not contain token-like secrets');

console.log('firebase config security: PASS');
