'use strict';

const crypto = require('crypto');

function passwordPepper(override) {
  if (override) return override;

  // functions.config()에서 pepper 읽기
  try {
    const functions = require('firebase-functions');
    const pepper = functions.config().pat?.pepper;
    if (pepper) {
      console.log('[PAT] Pepper 로드됨');
      return pepper;
    }
  } catch (e) {
    console.error('[PAT] Pepper 로드 실패:', e.message);
  }

  console.warn('[PAT] PAT_PASSWORD_PEPPER 미설정 — dev-pepper 사용 중!');
  return 'pat-bible-dev-pepper';
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

// 클라이언트가 saveFamily로 저장할 수 있는 허용 필드 (화이트리스트)
const FAMILY_ALLOWED_FIELDS = ['roomName', 'leaderName', 'parish', 'district', 'members'];

function sanitizeFamilyDataForSave(churchCode, data, pepper) {
  // allowlist만 복사 — 임의 필드(isAdmin, role 등) 주입 차단
  const next = {};
  for (const key of FAMILY_ALLOWED_FIELDS) {
    if (key in data) next[key] = data[key];
  }
  // 비밀번호는 allowlist 외부에서 별도 처리 → 해시로 변환
  if (data.familyPassword) {
    next.familyPasswordHash = hashFamilyPassword(churchCode, data.familyPassword, pepper);
  }
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
