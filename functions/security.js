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
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-pat-client-token, x-pat-admin-token, x-pat-admin-id, x-pat-admin-password');
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
  if (!name) return '';
  const headers = req.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function assertToken(req, res, options) {
  const functions = require('firebase-functions');

  let expected = options.expected || process.env[options.envName] || '';

  try {
    if (!expected && options.envName === 'PAT_ADMIN_TOKEN') {
      expected = functions.config().pat?.admin_token || '';
    } else if (!expected && options.envName === 'PAT_CLIENT_TOKEN') {
      expected = functions.config().pat?.client_token || '';
    }
  } catch (e) {
    console.error('[PAT] token load failed:', e.message);
  }

  const clientToken = headerValue(req, options.headerName);
  if (expected && clientToken === expected) return true;

  const credentialHeaders = options.credentialHeaders || {};
  const credentialEnv = options.credentialEnv || {};
  const expectedId = process.env[credentialEnv.id] || '';
  const expectedPassword = process.env[credentialEnv.password] || '';
  const clientId = headerValue(req, credentialHeaders.id);
  const clientPassword = headerValue(req, credentialHeaders.password);
  if (expectedId && expectedPassword && clientId === expectedId && clientPassword === expectedPassword) {
    return true;
  }

  if (!expected) {
    res.status(503).json({ error: 'Server token not configured' });
    console.error('[PAT] token not configured:', options.envName);
    return false;
  }

  console.warn('[PAT] token mismatch:', {
    expected: expected.substring(0, 20) + '...',
    received: clientToken.substring(0, 20) + '...',
  });
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

module.exports = {
  validChurchCode,
  applyCors,
  assertChurchCode,
  assertToken,
};
