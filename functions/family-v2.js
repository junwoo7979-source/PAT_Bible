'use strict';

// ============================================================
// PAT Bible — 가족 초대 기반 로그인 (v2) 헬퍼
// ------------------------------------------------------------
// 순수 함수 위주 — Firestore 의존 없는 로직은 여기서 단위테스트 가능.
// 스키마: SCHEMA.md 참조 (families/{familyId} 완전 격리)
// ============================================================

const crypto = require('crypto');

// 초대 코드 알파벳: 혼동 문자(0/O, 1/I/L) 제외
const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const INVITE_CODE_LENGTH = 8;

// ── 초대 코드 생성 ────────────────────────────────────────
function generateInviteCode() {
  const bytes = crypto.randomBytes(INVITE_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length];
  }
  return code;
}

function validInviteCodeFormat(code) {
  return typeof code === 'string' && /^[A-Z0-9]{6,16}$/.test(code);
}

// ── 1회용 토큰 생성 (초대 링크용) ─────────────────────────
function generateInviteToken() {
  return crypto.randomBytes(16).toString('hex'); // 32자 hex
}

// ── 폰번호 정규화 ─────────────────────────────────────────
// "010-1234-5678", "+82 10 1234 5678" → "01012345678"
function normalizePhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[^\d]/g, ''); // 숫자만
  // 국가코드 +82 → 0 변환 (한국)
  if (s.startsWith('82')) {
    s = '0' + s.slice(2);
  }
  return s;
}

function validPhone(normalized) {
  // 한국 휴대폰: 010/011/016/017/018/019 + 7~8자리
  return /^01[016789]\d{7,8}$/.test(normalized);
}

// ── 폰번호 해시 (역인덱스 키) ─────────────────────────────
function hashPhone(normalizedPhone, pepper) {
  const hmac = crypto.createHmac('sha256', pepper || 'pat-bible-dev-pepper');
  hmac.update('phone:');
  hmac.update(String(normalizedPhone || ''));
  return hmac.digest('hex');
}

// ── userId 생성 ───────────────────────────────────────────
// 폰번호 기반(구글 로그인 통합 전까지). 같은 폰 = 같은 userId (재로그인 일관성)
function phoneToUserId(normalizedPhone, pepper) {
  const hmac = crypto.createHmac('sha256', pepper || 'pat-bible-dev-pepper');
  hmac.update('uid:');
  hmac.update(String(normalizedPhone || ''));
  return 'u_' + hmac.digest('hex').slice(0, 24);
}

// ── 이름 검증 ─────────────────────────────────────────────
function validName(name, max) {
  const s = String(name || '').trim();
  return s.length >= 1 && s.length <= (max || 30);
}

// ── 공개용 가족방 데이터 (민감정보 제거) ──────────────────
function publicFamilyV2(id, data) {
  return {
    familyId: id,
    familyName: data.familyName || '',
    creatorName: data.creatorName || '',
    inviteCode: data.inviteCode || '',
    memberCount: data.memberCount || 0,
    authVersion: data.authVersion || 2,
  };
}

module.exports = {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  generateInviteCode,
  validInviteCodeFormat,
  generateInviteToken,
  normalizePhone,
  validPhone,
  hashPhone,
  phoneToUserId,
  validName,
  publicFamilyV2,
};
