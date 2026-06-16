const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('app/index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('app/manifest.json', 'utf8'));
const assetLinks = JSON.parse(fs.readFileSync('app/.well-known/assetlinks.json', 'utf8'));
const firebaseConfig = JSON.parse(fs.readFileSync('firebase.json', 'utf8').replace(/^\uFEFF/, ''));
const sw = fs.readFileSync('app/sw.js', 'utf8');

const icons = manifest.icons || [];
const icon192 = icons.find(icon => icon.src && icon.src.split('?')[0] === 'icons/pat-icon-192.png');
const icon512 = icons.find(icon => icon.src && icon.src.split('?')[0] === 'icons/pat-icon-512.png');

assert.ok(icon192, 'manifest must register a 192x192 PNG icon');
assert.equal(icon192.sizes, '192x192');
assert.equal(icon192.type, 'image/png');
assert.match(icon192.purpose, /maskable/);

assert.ok(icon512, 'manifest must register a 512x512 PNG icon');
assert.equal(icon512.sizes, '512x512');
assert.equal(icon512.type, 'image/png');
assert.match(icon512.purpose, /maskable/);

assert.match(html, /<link rel="apple-touch-icon" href="icons\/pat-icon-192\.png">/);
assert.match(sw, /'\.\/icons\/pat-icon-192\.png'/);
assert.match(sw, /'\.\/icons\/pat-icon-512\.png'/);
assert.match(sw, /'\.\/js\/app-core\.js'/);
assert.match(sw, /'\.\/js\/verse\.js'/);
assert.match(sw, /'\.\/js\/family\.js'/);
assert.match(sw, /'\.\/js\/voice\.js'/);
assert.match(sw, /'\.\/js\/voice-ui\.js'/);
assert.match(sw, /'\.\/js\/memorize\.js'/);
assert.doesNotMatch(
  html,
  /window\.location\.reload\(\)/,
  'service worker updates must not force reload on app start'
);

assert.ok(fs.existsSync('app/icons/pat-icon-192.png'), '192 PNG icon file must exist');
assert.ok(fs.existsSync('app/icons/pat-icon-512.png'), '512 PNG icon file must exist');

assert.deepEqual(assetLinks[0].relation, ['delegate_permission/common.handle_all_urls']);
assert.equal(assetLinks[0].target.namespace, 'android_app');
assert.equal(assetLinks[0].target.package_name, 'com.patbible.app');
assert.ok(
  assetLinks[0].target.sha256_cert_fingerprints.includes(
    'F4:2B:12:83:B9:3E:DA:9F:78:18:AE:7B:7D:AA:66:20:71:1B:0C:8D:5E:50:76:BB:3A:D0:3C:FA:91:27:D9:DD'
  ),
  'assetlinks.json must include the signed APK certificate fingerprint'
);
assert.ok(
  firebaseConfig.hosting.ignore.includes('!**/.well-known/**'),
  'Firebase Hosting must not ignore .well-known assetlinks files'
);

console.log('pwa assets: PASS');
