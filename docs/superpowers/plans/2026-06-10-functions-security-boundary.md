# Functions Security Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side security boundary to PAT Bible Firebase Functions without changing API paths or Firestore structure.

**Architecture:** Put pure validation and CORS/token logic in `functions/security.js`, test it directly, then wire each Function endpoint through it. The browser API wrapper adds token headers from config or browser storage.

**Tech Stack:** Node.js CommonJS, Firebase Functions v2, plain Node assert tests, browser global JavaScript.

---

### Task 1: Security Helper

**Files:**
- Create: `functions/security.js`
- Create: `tests/functions-security.test.cjs`

- [ ] **Step 1: Write failing tests**

Test invalid `churchCode`, CORS origin allow/deny, missing configured token, and valid token.

- [ ] **Step 2: Verify tests fail**

Run: `node tests\functions-security.test.cjs`

- [ ] **Step 3: Implement helper**

Export `validChurchCode`, `applyCors`, `assertChurchCode`, and `assertToken`.

- [ ] **Step 4: Verify tests pass**

Run: `node tests\functions-security.test.cjs`

### Task 2: Wire Functions

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: Replace local CORS/churchCode helpers with shared helper**

- [ ] **Step 2: Add `assertChurchCode` to every endpoint using `churchCode`**

- [ ] **Step 3: Add `assertToken` to write endpoints**

- [ ] **Step 4: Verify syntax and load**

Run: `node --check functions\index.js`
Run: `node -e "require('./functions/index.js'); console.log('functions require: OK')"`

### Task 3: Browser API Headers

**Files:**
- Modify: `app/firebase-config.js`
- Modify: `app/firebase-db.js`

- [ ] **Step 1: Read API base and optional tokens from `window.FIREBASE_CONFIG` or storage**

- [ ] **Step 2: Attach `x-pat-client-token` on normal writes and `x-pat-admin-token` on `saveVerse`**

- [ ] **Step 3: Verify app scripts parse**

Run: `node -e "const fs=require('fs');for(const f of fs.readdirSync('app/js').filter(f=>f.endsWith('.js'))){const code=fs.readFileSync('app/js/'+f,'utf8');new Function(code);console.log(f+': OK')}"`

### Task 4: Regression Verification

**Files:**
- Existing test files only

- [ ] **Step 1: Run focused tests**

Run:
`node tests\functions-security.test.cjs`
`node tests\family-cloud-sync.test.cjs`
`node tests\parish-dashboard.test.cjs`
`node tests\pwa-assets.test.cjs`

- [ ] **Step 2: Run diff check**

Run: `git diff --check`
