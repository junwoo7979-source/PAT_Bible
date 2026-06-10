'use strict';

const crypto = require('crypto');

function passwordPepper(override) {
  if (override) return override;
  const env = process.env.PAT_PASSWORD_PEPPER;
  if (!env) {
    console.warn('[PAT] PAT_PASSWORD_PEPPER 환경변수 미설정 — dev-pepper 사용 중. 운영 배포 전 반드시 설정하세요.');
  }
  return env || 'pat-bible-dev-pepper';
}

function hashFamilyPassword(churchCode, password, pepper) {
  const hmac = crypto.createHmac('sha256', passwordPepper(pepper));
  hmac.update(String(churchCode || ''));
  hmac.update(':');
  hmac.update(String(password || ''));
  return 'v1$' + hmac.digest('hex');
}

function verifyFamilyPassword(churchCode, password, storedHash, pepper) {
  if (!storedHash || !password) return false;
  return hashFamilyPassword(churchCode, password, pepper) === storedHash;
}

function sanitizeFamilyDataForSave(churchCode, data, pepper) {
  const next = { ...data };
  // 클라이언트가 임의로 보낸 해시 필드를 항상 제거 (계정 탈취 방지)
  delete next.familyPasswordHash;
  if (next.familyPassword) {
    next.familyPasswordHash = hashFamilyPassword(churchCode, next.familyPassword, pepper);
  }
  delete next.familyPassword;
  return next;
}

function publicFamily(id, data) {
  const family = { id, ...data };
  delete family.familyPassword;
  delete family.familyPasswordHash;
  return family;
}

module.exports = {
  hashFamilyPassword,
  verifyFamilyPassword,
  sanitizeFamilyDataForSave,
  publicFamily,
};
