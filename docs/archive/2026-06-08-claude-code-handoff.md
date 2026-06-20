# Claude Code Handoff - 2026-06-08

## Resume From Here

Open this local repository:

`C:\Users\SAMSUNG\Documents\Codex\2026-05-20\cusor\PAT_Bible`

Deployed app:

`https://junwoo7979-source.github.io/PAT_Bible/app/?v=1bc2137`

Main app file:

`app/index.html`

Latest pushed commit:

`1bc2137 Add installable PAT Bible app icon`

Branch:

`main`

Working tree status at handoff:

Expected clean after this handoff commit is pushed.

## User Goal

The user wants PAT Bible to work reliably on mobile microphone testing.

Key UX decision:

Do not rely on KakaoTalk in-app browser for microphone use. Instead, allow users to install PAT Bible as a mobile home-screen app icon and launch from that icon.

## What Was Done Today

### 1. Correct App URL

The original URL `http://junwoo7979-source.github.io/` showed GitHub Pages "Site not found".

Correct live app URL:

`https://junwoo7979-source.github.io/PAT_Bible/app/`

### 2. Microphone Permission Flow

Commits:

- `e0f6ba4 Fix microphone permission prompt flow`
- `f210928 Improve mobile microphone permission handling`

Changes:

- Desktop flow keeps a global microphone stream so the permission prompt does not repeat during voice step 1 and step 2.
- Mobile flow avoids double-prompting by not pre-calling `getUserMedia()` at `startMemorize()`.
- Mobile voice recognition auto-restart loop was disabled because repeated `SpeechRecognition.start()` can trigger repeated permission prompts.
- KakaoTalk in-app browser is detected with `KAKAOTALK` in the user agent.
- If KakaoTalk in-app browser is detected, the app shows a notice telling the user to open in Chrome/Safari.

Important functions in `app/index.html`:

- `isMobileBrowser()`
- `isKakaoInAppBrowser()`
- `requestMicPermissionAtSessionStart()`
- `ensureMicrophonePermission()`
- `showInAppBrowserMicNotice()`
- `startVoiceRecognition()`

### 3. Installable PAT Icon / PWA

Commit:

- `1bc2137 Add installable PAT Bible app icon`

Files added:

- `app/manifest.json`
- `app/sw.js`
- `app/icons/pat-icon.svg`

Changes in `app/index.html`:

- Added PWA meta tags.
- Added `<link rel="manifest" href="manifest.json">`.
- Added `<link rel="apple-touch-icon" href="icons/pat-icon.svg">`.
- Added `📱 PAT 아이콘 설치` button on the login screen.
- Added `installPatApp()` helper:
  - Android Chrome: uses `beforeinstallprompt` when available.
  - KakaoTalk in-app browser: tells user to open in another browser.
  - iPhone/iPad: tells user to use Safari share button then "Add to Home Screen".
- Registered service worker `sw.js`.

Verified deployed files:

- `app/index.html?v=1bc2137` returns 200 and contains manifest, install button, and service worker registration.
- `app/manifest.json?v=1bc2137` returns 200 and contains `display: standalone`.
- `app/sw.js?v=1bc2137` returns 200 and contains cache setup.

## Mobile User Instructions

Android:

1. Open this link in Chrome:
   `https://junwoo7979-source.github.io/PAT_Bible/app/?v=1bc2137`
2. Tap `📱 PAT 아이콘 설치`.
3. If no install popup appears, tap Chrome `⋮` menu.
4. Choose `앱 설치` or `홈 화면에 추가`.
5. Launch from the home-screen `PAT Bible` icon, not KakaoTalk.

iPhone:

1. Open the link in Safari.
2. Tap the share button.
3. Choose `홈 화면에 추가`.
4. Launch from the home-screen `PAT Bible` icon.

Important:

KakaoTalk in-app browser can repeatedly show microphone permission prompts or fail to persist permission. The user should use Chrome/Safari or the installed PAT Bible icon.

## Suggested Next Work

1. Test on an actual Android phone:
   - Open in Chrome.
   - Install PAT Bible icon.
   - Launch from icon.
   - Confirm microphone prompt appears only when tapping record, not repeatedly during voice step 1 and step 2.

2. Test KakaoTalk flow:
   - Open app link from KakaoTalk.
   - Confirm the app shows the Kakao in-app browser warning.
   - Confirm "앱 주소 복사" works.

3. Consider adding a clearer first-run modal:
   - "마이크 테스트는 홈 화면 PAT Bible 아이콘으로 실행하세요."
   - Buttons: "앱 주소 복사", "설치 방법 보기".

4. Consider replacing SVG icon with PNG 192x192 and 512x512 if Android install prompt is inconsistent. Some browsers are stricter with PWA icon requirements.

## Commands Used / Useful Checks

Check git status:

```powershell
git status --short
```

Check app script syntax:

```powershell
node -e "const fs=require('fs'); const html=fs.readFileSync('app/index.html','utf8'); const m=html.match(/<script>([\s\S]*?)<\/script>/); new Function(m[1]); console.log('syntax ok')"
```

Check service worker syntax:

```powershell
node --check app\sw.js
```

Check deployed app files:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'https://junwoo7979-source.github.io/PAT_Bible/app/index.html?v=1bc2137'
Invoke-WebRequest -UseBasicParsing -Uri 'https://junwoo7979-source.github.io/PAT_Bible/app/manifest.json?v=1bc2137'
Invoke-WebRequest -UseBasicParsing -Uri 'https://junwoo7979-source.github.io/PAT_Bible/app/sw.js?v=1bc2137'
```

## Notes For Claude Code

- Do not use KakaoTalk as the primary runtime for microphone tests.
- For microphone debugging, prefer Chrome on Android or Safari on iPhone.
- Do not remove the KakaoTalk in-app warning unless an alternative native Kakao flow is implemented.
- Preserve the PWA install path because this is now the user's chosen workaround for KakaoTalk instability.
