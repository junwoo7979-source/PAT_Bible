const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('app/firebase-db.js', 'utf8');

assert.match(
  source,
  /(?:saveVerse|saveConfig).*(?:saveVerse|saveConfig).*adminToken/s,
  'admin token must be attached to both saveVerse and saveConfig requests',
);

console.log('firebase db auth: PASS');
