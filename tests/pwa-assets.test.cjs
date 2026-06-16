const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('app/index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('app/manifest.json', 'utf8'));
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

assert.ok(fs.existsSync('app/icons/pat-icon-192.png'), '192 PNG icon file must exist');
assert.ok(fs.existsSync('app/icons/pat-icon-512.png'), '512 PNG icon file must exist');

console.log('pwa assets: PASS');
