# Functions Security Boundary Design

## Goal

Protect PAT Bible Firebase Functions from unauthenticated cross-site writes while keeping the existing API paths and Firestore document structure unchanged.

## Scope

- Add shared request validation for all Functions endpoints.
- Restrict CORS to configured origins.
- Require a configured client write token for public write endpoints.
- Require a configured admin token for verse registration.
- Keep read endpoints available after church code validation.
- Keep existing front-end API method names and backend endpoint names.

## Architecture

`functions/security.js` owns pure request security helpers. `functions/index.js` calls those helpers at each endpoint boundary before touching Firestore. `app/firebase-db.js` sends optional token headers from runtime config or browser storage so deployments can enable the guard without changing API paths.

## Tokens

- `PAT_CLIENT_TOKEN`: required by `saveFamily`, `joinFamily`, and `saveRecord`.
- `PAT_ADMIN_TOKEN`: required by `saveVerse`.
- If a required environment token is missing, protected writes fail with `503` so an insecure deployment is visible immediately.

## CORS

`PAT_ALLOWED_ORIGINS` is a comma-separated list. Requests with no `Origin` header are allowed for server-to-server and local test calls. Requests with an unlisted origin are rejected before business logic runs.

## Testing

Add unit tests around the security helper for invalid church codes, missing tokens, valid tokens, and CORS origin decisions. Existing app and Functions syntax tests must still pass.
