const fs = require('node:fs');
const path = require('node:path');

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvText(text) {
  const parsed = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    parsed[key] = stripQuotes(value);
  }

  return parsed;
}

function applyEnv(values, env = process.env) {
  for (const [key, value] of Object.entries(values)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
  return env;
}

function loadEnvFile(filePath = path.resolve(process.cwd(), '.env.local'), env = process.env) {
  if (!fs.existsSync(filePath)) {
    return { loaded: false, path: filePath, values: {} };
  }

  const values = parseEnvText(fs.readFileSync(filePath, 'utf8'));
  applyEnv(values, env);
  return { loaded: true, path: filePath, values };
}

module.exports = {
  applyEnv,
  loadEnvFile,
  parseEnvText,
};
