'use strict';

function envList(name) {
  return (process.env[name] || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function validChurchCode(code) {
  return typeof code === 'string' && /^[a-zA-Z0-9_-]{1,30}$/.test(code);
}

function applyCors(req, res, options = {}) {
  const origin = req.headers?.origin || '';
  const allowedOrigins = options.allowedOrigins || envList('PAT_ALLOWED_ORIGINS');

  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-pat-client-token, x-pat-admin-token');
  res.set('Vary', 'Origin');

  if (!origin) {
    res.set('Access-Control-Allow-Origin', '*');
    return true;
  }

  if (!allowedOrigins.length || allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    return true;
  }

  res.status(403).json({ error: 'Origin not allowed' });
  return false;
}

function assertChurchCode(churchCode, res) {
  if (validChurchCode(churchCode)) return true;
  res.status(400).json({ error: 'Valid churchCode required' });
  return false;
}

function headerValue(req, name) {
  const headers = req.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function assertToken(req, res, options) {
  const expected = options.expected || process.env[options.envName] || '';
  if (!expected) {
    res.status(503).json({ error: 'Server token not configured' });
    return false;
  }

  if (headerValue(req, options.headerName) === expected) return true;

  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

module.exports = {
  validChurchCode,
  applyCors,
  assertChurchCode,
  assertToken,
};
