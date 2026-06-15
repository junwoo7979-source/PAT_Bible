'use strict';

const assert = require('assert');
const {
  validChurchCode,
  applyCors,
  assertChurchCode,
  assertToken,
} = require('../functions/security');

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    set(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

assert.equal(validChurchCode('11111'), true);
assert.equal(validChurchCode('church-01_A'), true);
assert.equal(validChurchCode('../bad'), false);
assert.equal(validChurchCode(''), false);
assert.equal(validChurchCode('x'.repeat(31)), false);

{
  const res = mockRes();
  const ok = applyCors({ headers: { origin: 'https://pat.example.com' } }, res, {
    allowedOrigins: ['https://pat.example.com'],
  });
  assert.equal(ok, true);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://pat.example.com');
  assert.match(res.headers.Vary, /Origin/);
}

{
  const res = mockRes();
  const ok = applyCors({ headers: { origin: 'https://evil.example.com' } }, res, {
    allowedOrigins: ['https://pat.example.com'],
  });
  assert.equal(ok, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Origin not allowed' });
}

{
  const res = mockRes();
  const ok = assertChurchCode('../bad', res);
  assert.equal(ok, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Valid churchCode required' });
}

{
  const res = mockRes();
  const ok = assertToken({ headers: {} }, res, {
    envName: 'PAT_CLIENT_TOKEN',
    expected: 'secret',
    headerName: 'x-pat-client-token',
  });
  assert.equal(ok, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
}

{
  const res = mockRes();
  const ok = assertToken({ headers: { 'x-pat-client-token': 'secret' } }, res, {
    envName: 'PAT_CLIENT_TOKEN',
    expected: 'secret',
    headerName: 'x-pat-client-token',
  });
  assert.equal(ok, true);
  assert.equal(res.statusCode, 200);
}

{
  process.env.PAT_ADMIN_TOKEN = 'env-secret';
  const res = mockRes();
  const ok = assertToken({ headers: { 'x-pat-admin-token': 'env-secret' } }, res, {
    envName: 'PAT_ADMIN_TOKEN',
    headerName: 'x-pat-admin-token',
  });
  delete process.env.PAT_ADMIN_TOKEN;
  assert.equal(ok, true);
  assert.equal(res.statusCode, 200);
}

{
  const res = mockRes();
  const ok = assertToken({ headers: {} }, res, {
    envName: 'PAT_ADMIN_TOKEN',
    expected: '',
    headerName: 'x-pat-admin-token',
  });
  assert.equal(ok, false);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: 'Server token not configured' });
}

console.log('functions security: PASS');
