# Kakao Persistent Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최초 승인 후 카카오 메시지를 재로그인 없이 자동 발송한다.

**Architecture:** 로컬 토큰 저장 모듈과 OAuth 갱신 기능을 추가하고, 자동 인증 발송 스크립트가 저장 토큰을 선택·갱신·사용한다. 최초 OAuth 콜백은 발급 토큰을 저장한다.

**Tech Stack:** Node.js CommonJS, Kakao OAuth REST API, node:fs, node:assert

---

### Task 1: 토큰 저장소

**Files:**
- Create: `scripts/kakao-token-store.cjs`
- Create: `tests/kakao-token-store.test.cjs`
- Modify: `.gitignore`

- [ ] 만료시각 계산, 저장, 조회, 유효성 판단 실패 테스트 작성
- [ ] 테스트 실패 확인
- [ ] 최소 구현 작성
- [ ] 테스트 통과 확인

### Task 2: OAuth 자동 갱신

**Files:**
- Modify: `scripts/kakao-oauth.cjs`
- Modify: `tests/kakao-oauth.test.cjs`

- [ ] 갱신 토큰 요청 형식 실패 테스트 작성
- [ ] 테스트 실패 확인
- [ ] `refreshKakaoToken` 최소 구현
- [ ] 테스트 통과 확인

### Task 3: 무승인 자동 발송

**Files:**
- Create: `scripts/kakao-send-authenticated.cjs`
- Create: `tests/kakao-send-authenticated.test.cjs`
- Modify: `scripts/kakao-local-oauth.cjs`
- Modify: `tests/kakao-local-oauth.test.cjs`

- [ ] 유효 토큰 즉시 사용과 만료 토큰 자동 갱신 실패 테스트 작성
- [ ] 테스트 실패 확인
- [ ] 자동 발송과 최초 OAuth 토큰 저장 구현
- [ ] 전체 카카오 테스트 통과 확인

### Task 4: 실제 검증과 문서 저장

**Files:**
- Modify: `docs/CLAUDE_CODE_인수인계.md`
- Modify: `docs/실행내역서.md`

- [ ] 최초 승인으로 `.kakao-tokens.json` 생성
- [ ] `node scripts/kakao-send-authenticated.cjs`로 무승인 발송 확인
- [ ] 비밀값 Git 제외 확인
- [ ] 문서 기록, 커밋, 푸시
