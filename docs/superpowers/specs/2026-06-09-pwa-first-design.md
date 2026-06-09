# PAT Bible PWA First Design

## Goal

PAT Bible development proceeds as a PWA-first app until a domain and later store packaging are ready.

## Scope

- Keep the existing web app, Firestore REST API, DB paths, and API behavior.
- Improve install reliability before domain connection by adding PNG PWA icons.
- Keep the home-screen install path clear for Android Chrome, iPhone Safari, and KakaoTalk in-app browser users.
- Keep Google Play/TWA as a later packaging step, not the current implementation target.

## Implementation Notes

- `app/manifest.json` should include 192x192 and 512x512 PNG icons plus the existing SVG icon.
- `app/sw.js` should cache the PNG icons so installed users can keep seeing the PAT icon offline.
- `app/index.html` should point `apple-touch-icon` at a PNG icon and keep the install button on the login screen.
- Tests should verify the manifest, service worker cache list, and login page icon references.

## Verification

- Run the PWA asset test.
- Run the app inline-script syntax check.
- Run the service worker syntax check.
