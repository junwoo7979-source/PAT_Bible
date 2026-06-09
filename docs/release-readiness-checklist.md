# PAT Bible Release Readiness Checklist

This checklist keeps PAT Bible aligned across mobile web, installed app, Google Play, and AppsInToss.

## Product Scope

- PAT Bible is a family mission progress dashboard for Bible memorization.
- PAT Bible is not a chat app.
- Do not add KakaoTalk-style messaging unless the user explicitly requests it.
- All registered family members should see the same family mission progress, parish progress, and church progress.

## Shared Display Requirement

- Mobile web, installed app, Google Play build, and AppsInToss mini-app should show the same core screens and progress data.
- Family progress must use shared Firestore data when available.
- Demo mode may fall back to localStorage, but it must not break the release path.
- The family dashboard should show member names, completion status, family completion ratio, parish progress, and church progress.

## Data And Permission Requirements

- Keep the existing Firestore paths unless the user explicitly approves a schema change.
- Current shared paths:
  - `churches/{churchCode}/families/{familyId}`
  - `churches/{churchCode}/families/{familyId}/members/{deviceId}`
  - `churches/{churchCode}/records/{recordId}`
- Treat family names, parish/district labels, mission records, device IDs, and microphone use as release-sensitive data.
- Publish and maintain a privacy policy before store review.

## Google Play Readiness

- Complete Google Play Data safety accurately.
- Privacy policy must disclose collected, used, and shared data.
- Microphone use must be disclosed and requested only when needed for voice memorization.
- Runtime permission denial must degrade gracefully with manual input.
- Store listing should describe PAT as Bible memorization and mission progress, not messaging.

Official references:
- Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play Developer Program Policies: https://support.google.com/googleplay/android-developer/answer/15402170
- Google Play Data safety form: https://support.google.com/googleplay/android-developer/answer/10787469

## AppsInToss Readiness

- PAT is a non-game mini-app, so review it against the AppsInToss non-game guide.
- Follow AppsInToss launch/review checklist before requesting review.
- Follow TDS expectations for non-game mini-app UI when implementing AppsInToss-specific screens.
- Keep bundle size and external resource usage within AppsInToss release guidance.

Official references:
- AppsInToss mini-app release: https://developers-apps-in-toss.toss.im/development/deploy.md
- AppsInToss non-game release guide: https://developers-apps-in-toss.toss.im/checklist/app-nongame.md
- AppsInToss service open policy: https://developers-apps-in-toss.toss.im/intro/guide.md

## Pre-Release Verification

- Run the full Node test suite.
- Verify inline script parsing.
- Verify mobile browser and installed-app login start with a blank code/password field.
- Verify family mission progress sync from Firestore members and records.
- Verify manual input still works when microphone permission is denied.
- Verify no unapproved folder, API path, or DB schema changes were introduced.
