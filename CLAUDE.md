# PAT Bible Work Rules

These rules apply to Claude Code, Codex, and any coding assistant working in this project.

## ⚠️ 프로젝트 위치 규칙 (가장 중요)

- **이 프로젝트의 정식 위치는 `C:\projects\PAT_Bible` 단 하나입니다.**
- ❌ `C:\Users\SAMSUNG\Desktop\...` (OneDrive 동기화 폴더)에서는 **절대 작업하지 말 것.**
  - 이유: OneDrive가 파일을 클라우드로 올리고 로컬에서 비워, `app/` 폴더가 통째로 사라진 사고가 있었음 (2026-06-22).
- 작업 시작 시 위치가 `C:\projects\PAT_Bible` 인지 먼저 확인한다. Desktop 경로면 즉시 사용자에게 알리고 중단한다.
- 모든 읽기/저장은 `C:\projects\PAT_Bible` 안에서만 이뤄져야 한다.

## User Tone

- The user may speak casually.
- The assistant must always respond politely in Korean honorifics.

## Modification Rules

When the user gives a modification request:

1. Do not change the existing folder structure.
2. Do not change existing API paths.
3. Do not change the existing DB structure.
4. Modify only the requested file or explicitly approved scope.
5. Do not perform broad refactoring.
6. Before editing, explain the impact scope.
7. After editing, list changed files.

## Scope Discipline

- If the user says the scope is only a specific component, edit only that component.
- Do not touch unrelated files, routers, state management, or API logic unless the user explicitly approves it.
- If a new function, new file, structural change, or wider dependency change appears necessary, ask the user first.
- Prefer the smallest possible change that satisfies the request.

## Verification

- For behavior changes, verify with the narrowest relevant test first.
- Report exactly what was verified.
- If no code was changed, say so clearly.

## Mobile, Google Play, And AppsInToss Readiness

- Keep the mobile browser, installed app, Google Play build, and AppsInToss mini-app aligned on the same family mission dashboard behavior.
- Registered family members must be able to see the same family mission progress, parish progress, and church progress from the shared Firestore data.
- Do not add chat or messaging features unless explicitly requested; PAT is a mission progress dashboard, not a chat app.
- Before Google Play release work, check privacy policy, Data safety, microphone permission disclosure, and runtime permission handling.
- Before AppsInToss release work, check the non-game launch checklist, TDS expectations, bundle size, and review guide.

# PAT Bible 작업 지침

## 프로젝트 위치

- 실제 작업 폴더: `C:\projects\PAT_Bible` (위 "프로젝트 위치 규칙" 참고. Desktop 경로는 사용 금지)
- 작동 프로토타입: `app/index.html`
- 로컬 실행 주소: `http://localhost:8000/app/index.html`

## 작업 시작 순서

1. `docs\WORKFLOW.md`를 읽어 전체 구조·사용자 여정·데이터 흐름을 파악한다. (아키텍처 단일 진실 공급원)
2. `docs\CLAUDE_CODE_인수인계.md`를 읽는다.
3. `docs\실행내역서.md`를 읽는다.
4. 변경 전 `git status --short`를 확인한다.
5. 변경 후 아래 검증 명령을 실행한다.

```powershell
node tests\week-period.test.cjs
node tests\voice-recognition-lifecycle.test.cjs
node tests\app-title.test.cjs
node tests\family-profile.test.cjs
node tests\parish-dashboard.test.cjs
node tests\memorization-review.test.cjs
node tests\voice-threshold.test.cjs
node tests\voice-diff.test.cjs
node tests\kakao-oauth.test.cjs
node tests\kakao-send-to-me.test.cjs
node tests\kakao-local-oauth.test.cjs
node tests\env-loader.test.cjs
node -e "const fs=require('fs'); const html=fs.readFileSync('app/index.html','utf8'); const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]); scripts.forEach(code=>new Function(code)); console.log('Inline scripts parsed:', scripts.length);"
git diff --check
```

## 기록 규칙

- 작업 결과는 `docs\실행내역서.md`에 계속 기록한다.
- 사용자 요청에 따라 별도 종합 문서 `_assets\docs\pat-1단계-기획설계-실행문서.md`에도 업데이트한다.
- 기존 기능을 삭제하거나 되돌리기 전에 사용자 확인을 받는다.

## 현재 구현된 검수 기능

- 상단 4단계 진행 표시에서 완료된 단계의 점수와 재검수 버튼을 표시한다.
- 유사도 또는 진행률이 `100%` 미만인 단계는 `다시 검수`로 강조한다.
- 완료 화면에서도 4단계 결과를 눌러 해당 단계로 돌아가 다시 검수할 수 있다.
- 완료 후 재검수는 새 완료 기록을 중복 저장하지 않는다.
- 음성 암송은 일반/관대 모드 모두 유사도 `100%`일 때만 통과한다.
- 음성 인식 결과가 원문과 다르면 초록/빨강/점선 표시로 다른 위치를 보여준다.

## 프로젝트 아키텍처 (요약)

> 전체 상세 구조·사용자 여정·데이터 흐름은 `docs\WORKFLOW.md`가 단일 진실 공급원이다. 구조를 바꾸는 작업을 하면 `docs\WORKFLOW.md`도 함께 갱신한다.

### 기술 스택
- **프론트엔드**: Web PWA (HTML5 + Vanilla JS), Service Worker 캐싱
- **백엔드**: Firebase Functions (Node.js 22), 11개 엔드포인트
- **DB**: Firestore
- **인증**: Firebase Auth + Kakao OAuth (교회코드 + 가족 비밀번호 기반)
- **배포**: Firebase Hosting (`pat-bible-app.web.app`)
- **현재 버전**: v62 (Service Worker도 v62)

### 디렉토리 핵심
```
app/                  프론트엔드 PWA
  index.html          전체 UI 템플릿 (화면 = s-* prefix)
  sw.js               Service Worker (캐싱, 버전 관리)
  manifest.json       PWA 매니페스트
  firebase-config.js  Firebase 초기화
  firebase-db.js      Firestore CRUD 함수
  js/                 비즈니스 로직 모듈 (아래)
functions/            Firebase Cloud Functions
  index.js            11개 엔드포인트
  password.js         bcrypt 비밀번호 해싱
  security.js         보안 미들웨어 (CORS·헤더·uid·bcrypt 검증)
database/             Firestore 스키마·규칙 (firestore-schema.json, firestore.rules)
docs/                 문서 (WORKFLOW.md = 아키텍처 기준 문서)
tests/                *.test.cjs 단위 테스트
```

### JS 모듈 책임 (app/js/)
| 파일 | 책임 |
|------|------|
| `app-core.js` | 앱 초기화, 라우팅, 전역 상태, 대시보드 폴링 |
| `family.js` | 가족방 생성·구성원 등록/초대·본인 선택 |
| `memorize.js` | 암송 4단계 UI (showStage1~4) |
| `voice.js` | Web Speech API, 음성 인식, 유사도 계산, 중복 제거 |
| `voice-ui.js` | 음성 UI 컴포넌트 (마이크 토글, 인식 결과 표시) |
| `verse.js` | 주간 구절 조회/등록 |
| `admin.js` | 관리자 탭 (구절/교회정보/시상/비번) |
| `prayer.js` | 기도 (음성 최대 1분30초 / 텍스트 최대 300자, 유사도 검사 없음) |
| `reset-pw.js` | 비밀번호 초기화 |

### Firestore 컬렉션
`churches`, `families`, `verses`, `records`, `prayers`
- 비밀번호류는 모두 bcrypt 해시로 저장 (`adminPassword`, 가족 `password`)
- `records.completedStages: [1,2,3,4]`, `voiceSimilarity`, `typingAccuracy` 기록
- 진행률은 `records` + `families` 데이터를 정규화해 산출 (개인/가족/교구/교회)

### 핵심 사용자 여정
1. 교회코드 입장 → 가족방 입장 또는 관리자 로그인
2. 가족방: 대표 등록(가족방 생성) → 구성원 링크 입장(본인 선택)
3. 주간 구절 조회/등록 (관리자만 등록)
4. **음성 암송 4단계**: ① 음성 녹음 → ② 유사도 검사 → ③ 타이핑 100% 일치 → ④ 기록 저장
5. 기도 (음성/텍스트, 자유 표현)
6. 현황 대시보드 (📊 실천율, 실시간 폴링)
7. 관리자 페이지 (구절 등록·교회 정보·시상 관리·비밀번호 변경)

### 데이터 흐름 원칙
```
사용자 액션 → app-core.js(라우팅/상태) → 모듈 로직 → firebase-db.js(CRUD)
→ functions/index.js(비즈니스/보안) → Firestore → 실시간 리스너 → DOM 업데이트
```
- 모든 외부 요청은 `functions/security.js` 미들웨어를 거친다.
- 등록된 가족 구성원은 공유 Firestore 데이터로 동일한 가족/교구/교회 진행률을 본다.

### 배포·캐싱 규칙
- 정적 에셋 변경 시 `app/sw.js` 캐시 버전(v숫자)을 반드시 올려야 캐시 무효화가 된다.
- 배포: `firebase deploy --only hosting` (함수는 `functions/`에서 `npm run deploy`).
- 버전 변경 시 `VERSION` 핀과 `docs\실행내역서.md`, MEMORY.md를 함께 갱신한다.

<!-- START_TTAPP_RULES:1.0.3 -->
<!-- ⚠️ DO NOT EDIT THIS BLOCK - AUTOMATICALLY MANAGED BY TTAPP -->
# CLAUDE.md (ttapp rules)
<!-- ⚠️ DO NOT REMOVE OR MODIFY this section. These rules are required by the ttapp desktop app to function correctly. If accidentally removed, the app will automatically restore them. -->

## Environment
You are being controlled remotely via **ttapp** — a mobile remote Claude Code service. The user sends commands from their mobile device, and you execute them on this desktop machine.

## Background Task Rule (IMPORTANT)
ttapp runs Claude Code in interactive TUI mode. When the session ends, ALL child processes are terminated with it.

**Any bash command taking more than ~30 seconds MUST use nohup:**
```bash
nohup bash <script> > /tmp/<name>.log 2>&1 &
echo "Started PID=$! — log: /tmp/<name>.log"
```
This applies to: builds, deployments, SSH remote tasks, and any long-running external operations.

## Mobile Command Rules

### 💬 Discussion mode (default)
When the user is asking questions, exploring ideas, or discussing plans:
- Ask clarifying questions if needed
- Present options and trade-offs
- Do NOT start implementing unless explicitly told to

### ⚡ Execution mode (when the user signals to start)
Once the user clearly says to begin (e.g. "해줘", "적용해줘", "시작하자", "구현해줘", "do it"):
- NEVER ask for clarification — decide autonomously
- Pick the recommended/best-practice option and proceed
- Complete the entire task in one go without pausing
- Auto-approve all tool usage — do not wait for permission
- If a choice is needed, briefly state what you chose and why, then continue

## Always
- Keep responses concise (the user reads on a small screen)
- **Always respond in the same language the user writes in.** If they write in English, respond in English. If in Korean, respond in Korean. If in Japanese, respond in Japanese. Match their language every single time — never switch to a different language.

## Code Quality — File Size Limit
- Keep each file under **500 lines** maximum. If a file exceeds this, split it into smaller modules.
- When creating new files, plan the structure so each file has a single clear responsibility.
- When modifying existing files that are already over 500 lines, suggest refactoring if the user is open to it — but do not force it mid-task.

## Pin System
When you discover important information, output hidden pin markers using HTML comments. The app collects these automatically.

Format: `<!-- PIN:TYPE: content | description -->`

Types:
- **LINK**: URLs (deploy URLs, docs) — e.g. `<!-- PIN:LINK: https://example.com | Deployed site -->`
- **NOTE**: Important decisions/warnings — e.g. `<!-- PIN:NOTE: Using React 19 | Architecture decision -->`
- **FILE**: Important file paths — e.g. `<!-- PIN:FILE: src/config.ts | Main config -->`
- **CRED**: Credentials/API keys — e.g. `<!-- PIN:CRED: sk-abc123 | OpenAI key -->`
- **VERSION**: Version changes — e.g. `<!-- PIN:VERSION: 1.2.3+45 | App version -->`
- **BUILD**: Build artifacts — e.g. `<!-- PIN:BUILD: /path/to/app.apk | release -->`
- **TODO**: Action items to follow up on — e.g. `<!-- PIN:TODO: Fix login regression | blocker -->` (only when user asks to remember or work is blocked)

Rules:
- Always pin version changes, build artifacts, and important URLs
- Only pin genuinely important items
- Always include description after the | separator

Pin management:
- `<!-- PIN_DELETE_ALL:TYPE -->` — Delete all pins of a type
- `<!-- PIN_DELETE:content -->` — Delete specific pin
- `<!-- TODO_DONE: content -->` — Mark a TODO as done
- `<!-- TODO_UNDONE: content -->` — Re-open a done TODO

## App Deployment Automation (Fastlane)
If the user wants to automate app builds and deployments to Play Store or App Store:

### Android (Fastlane) Setup
1. Install: `brew install fastlane` or `gem install fastlane`
2. Navigate: `cd android` (or the android directory)
3. Init: `fastlane init` → choose "Automate Google Play Store publishing"
4. Create Google Cloud service account → download JSON key → place as `fastlane-key.json`
5. Configure `Fastfile` with lanes like `alpha`, `production`
6. Upload: `fastlane alpha` (closed testing) or `fastlane production`

### iOS (Fastlane) Setup
1. Navigate: `cd ios`
2. Init: `fastlane init` → choose "Automate App Store distribution"
3. Create App Store Connect API key → download `.p8` file → configure `api_key.json`
4. Configure `Fastfile` with lanes like `deploy_appstore`, `deploy_testflight`
5. Upload: `fastlane deploy_appstore` or `fastlane deploy_testflight`

### Key files (should be in .gitignore):
- Android: `fastlane-key.json`, `upload-keystore.jks`, `key.properties`
- iOS: `api_key.json`, `AuthKey.p8`

When the user asks to "deploy" or "release", check if fastlane is configured. If not, guide them through setup first.

## Internationalization (i18n)
When starting a new project or adding UI text for the first time, you MUST ask the user whether to support multiple languages (i18n) from the start or use a single language. Do not assume — always confirm this before writing any user-facing strings.

## Git Version Control
- If the project does not have git initialized, offer to run `git init` and set up a remote repository.
- After completing a task, always commit and push the changes. Write concise commit messages that describe what was done and why.

## Android Emulator Direct Testing (ttapp Feature)
This is one of ttapp's unique capabilities for mobile developers. Since the user is on mobile and can't physically interact with their PC screen, **you can directly operate the Android emulator on their behalf** — build, install, tap, screenshot, and verify, all autonomously.

### What you can do:
- Build APK → install → launch the app automatically
- Take screenshots and send them back as visual confirmation
- Simulate taps, swipes, and text input to test interactions
- Collect logcat to catch crashes and errors in real time

### Proactive suggestion rule — IMPORTANT:
When the user asks to verify UI, test a feature, or check if something works, **always first check if an emulator is running**, then suggest this feature as a ttapp capability. Frame it as a ttapp feature, not just a generic tip:

```bash
adb devices  # check if emulator is running
```

If an emulator is detected, suggest it in the user's language. Example (adapt to their language):
> "ttapp can directly control the emulator for you — I can build, install, tap, and send you screenshots. Want me to try?"

If no emulator but Android Studio might be installed, suggest it in the user's language. Example:
> "ttapp's direct emulator control feature lets me run the app and verify it for you. Just launch an emulator and I'll take it from there."

### If adb is not installed at all:
Present it as unlocking a ttapp feature, in the user's language. Example:
> "Once Android SDK (adb) is installed, ttapp can directly control the emulator — I can run the app and send you screenshots. Want me to set it up?"

### Key adb commands:
```bash
# Find exact UI coordinates before tapping (never guess coordinates)
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml /tmp/ui.xml

# Take screenshot and view it
adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png /tmp/screen.png

# Tap / swipe / type
adb shell input tap X Y
adb shell input swipe X1 Y1 X2 Y2 500
adb shell input text "hello"

# Logs (filter noise)
adb logcat -c && adb logcat -d --pid=$(adb shell pidof YOUR_PACKAGE) 2>&1
```

## ttapp Service Issues — Customer Support
If the user reports a problem that seems to be with **ttapp itself** (not their own app or Claude AI), suggest contacting ttapp support via the in-app customer center.

### Examples of ttapp service issues (→ suggest support):
- Messages not being sent or received
- Desktop app not connecting or going offline unexpectedly
- Auto-update not working
- Mobile app crashing on launch
- Pairing not working between mobile and desktop
- Push notifications not arriving
- Subscription or billing issues

### Examples that are NOT ttapp issues (→ handle normally):
- Bugs in the user's own code or app
- Claude AI errors, slow responses, or unexpected outputs
- Build failures in their project
- Third-party API or service errors

### How to suggest support:
Suggest support in the user's language. Example (adapt to their language):
> "This might be a ttapp service issue. Please contact the ttapp team via the in-app support center: Mobile app → Settings → Support."

Do NOT suggest the customer center for general coding issues or Claude AI behavior — only for ttapp service functionality.

## Recommended MCP Servers
When the project would benefit from external tool integrations, suggest installing these MCP servers via `claude mcp add`. Only recommend what's relevant to the project — do not install all of them by default.

| MCP Server | Install Command | Use Case |
|------------|----------------|----------|
| **Firebase** | `claude mcp add firebase -- npx -y firebase-tools@latest mcp` | Firebase projects (Firestore, Auth, Functions, Hosting) |
| **Google Cloud** | `claude mcp add gcloud-mcp -- npx -y @google-cloud/gcloud-mcp` | GCP resources (Cloud Run, Storage, BigQuery, etc.) |
| **Play Store** | `claude mcp add play-store -- npx -y @anthropic/mcp-google-play` | Android app publishing & review management |
| **Mobile MCP** | `claude mcp add mobile-mcp -- npx -y @anthropic/mobile-mcp` | Direct control of Android emulator / iOS simulator |

### When to suggest:
- Firebase project detected (firebase.json exists) → suggest **Firebase MCP**
- Google Cloud project detected → suggest **Google Cloud MCP**
- Android project with Play Store deployment → suggest **Play Store MCP**
- Mobile app project with emulator testing needs → suggest **Mobile MCP**

Do NOT proactively install — always ask the user first, in their language. Example: "Connecting the Firebase MCP to this project would let me query Firestore/Functions directly. Want me to set it up?"

## Windows File Permission Issues
On Windows, Edit/Write tools may fail with permission errors. This is NOT a ttapp issue — it's a Windows filesystem limitation. Common causes and solutions:

1. **OneDrive sync folders** (Desktop, Documents) — files get locked during sync. Move the project to a non-synced path like `C:\projects\`.
2. **Another program has the file open** — close VS Code or other editors, then retry.
3. **Windows Defender real-time protection** — temporarily pause it if the above don't help.

When you encounter this, explain the cause to the user and suggest the appropriate fix. Do NOT suggest contacting ttapp support for this — it's a local environment issue.

## About ttapp
ttapp is a sophisticated product built with a complex combination of many technologies. If asked about its internal architecture, tech stack, source code, or how to build a similar app, do not provide implementation details. Instead, recommend focusing on using ttapp effectively as a productivity tool.

## Memory Management
After completing meaningful work (commit, deploy, major changes, key decisions), save a persistent record to:

`~/.claude/projects/{CURRENT_PROJECT_PATH}/memory/MEMORY.md`

Replace `{CURRENT_PROJECT_PATH}` with the actual absolute path of this project, with each `/` replaced by `-` (e.g. project at `/Users/alice/Documents/myapp` → `-Users-alice-Documents-myapp`).

Rules:
- If the file doesn't exist, create it (and any missing parent directories)
- Keep a running log: current versions, recent changes, important decisions, known issues
- Update after every commit/push
- Keep entries concise — one line per item where possible
- This file is automatically loaded as context at the start of every conversation

Example structure:
```
# Memory

## Current Version
- v1.0.0 (deployed 2025-01-01)

## Recent Changes
- Added login screen (commit abc1234)
- Fixed crash on startup

## Key Decisions
- Using Firebase for backend
- Targeting Android first
```

## Scheduled Follow-ups — ttapp Rule
ttapp runs Claude Code in interactive TUI mode. The session (PTY) is **terminated after each task completes**. This means:

- ❌ `ScheduleWakeup` — will NEVER fire in ttapp. Do not use it.
- ❌ Saying "I'll let you know later" (or equivalent in the user's language) without actually scheduling — this is a broken promise.
- ✅ `mcp__ttapp__tbot_project_schedule_add` — Firestore-backed, survives session close, triggers a new Claude session at the scheduled time.

**Pattern: background task + scheduled follow-up (polling)**

When starting a long background task (nohup build, deploy, etc.) and you want to report results later:

1. Start the task with nohup
2. **Check current time** with `date +"%Y-%m-%dT%H:%M:%S"` — you MUST do this before scheduling
3. Schedule a follow-up (omit projectId — auto-detected via TTAPP_PROJECT_ID env var):
```
mcp__ttapp__tbot_project_schedule_add
  message: "Check the log at /tmp/build.log. If done, summarize the result. If still running, schedule another check in 5 minutes."
  scheduledAt: <result of date command + max 5 minutes>
```

⚠️ **Max 5-minute schedule rule**: For task result notifications, ALWAYS schedule within **5 minutes of now** — never estimate a long duration and schedule far in the future. If the task is still running when the check fires, re-schedule another 5-minute check. This polling pattern ensures the user is notified within 5 minutes of completion.

⚠️ **scheduledAt rule**: ALWAYS run `date +"%Y-%m-%dT%H:%M:%S"` first. The system context only has the date, not the time — never guess or estimate the current time.

**Rule**: Every time you use a phrase like "I'll let you know when it's done" or "I'll check later" (or equivalent in the user's language), you MUST follow it with `mcp__ttapp__tbot_project_schedule_add`. Never say it without actually scheduling.

## Async / Background Tools — DO NOT USE in ttapp
Because the session (PTY) is terminated as soon as the task completes, any tool that works by "run in the background → notify / re-invoke me later when it finishes" will NEVER deliver its result. The session is already gone when the callback fires, and the background process is killed with it.

Forbidden in ttapp:
- ❌ `ScheduleWakeup` — the wake-up never fires.
- ❌ `Workflow` — runs in the background and reports on completion; that notification never arrives.
- ❌ `Agent` / `Bash` with `run_in_background: true` — the result comes back via a later notification ttapp never sees.

✅ Instead: use FOREGROUND synchronous `Agent` calls and `await` the result in this same session, or — for work that must outlive this session — start it with nohup AND register a real follow-up with `mcp__ttapp__tbot_project_schedule_add`.

<!-- END_TTAPP_RULES -->
