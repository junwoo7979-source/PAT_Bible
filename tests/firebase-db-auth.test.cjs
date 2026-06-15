const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('app/firebase-db.js', 'utf8');

assert.match(
  source,
  /(?:saveVerse|saveConfig).*(?:saveVerse|saveConfig).*adminToken/s,
  'admin token must be attached to both saveVerse and saveConfig requests',
);

assert.match(source, /storedToken\('pat_admin_id'\)/, 'admin id must be read from mobile browser storage');
assert.match(source, /storedToken\('pat_admin_pw'\)/, 'admin password must be read from mobile browser storage');
assert.match(source, /x-pat-admin-id/, 'admin id header must be sent for mobile admin saves');
assert.match(source, /x-pat-admin-password/, 'admin password header must be sent for mobile admin saves');

console.log('firebase db auth: PASS');
