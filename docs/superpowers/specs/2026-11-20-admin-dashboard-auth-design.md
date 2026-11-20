# Admin dashboard + Google login (design)

Size: small-to-medium change. Short design, approved in conversation 2026-11-20 (approach A and defaults).

## Intent
Today "admin" is only the URL flag `?admin=True`; `bookmark`, `watchlist`, `surge`, `stock` show write buttons and call
`https://market.smallplum.xyz/api/mktobs/*` with no credentials. Anyone can add the flag, so the only protection is
whatever the backend does. Goal: `/dashboard` asks for Google login (allowlist); only a logged-in allowlisted admin can
use write features, enforced by the backend, not by the URL.

## Goals
- `/dashboard` page: logged out -> "Sign in with Google"; logged in -> email, logout, links to admin-enabled pages.
- Backend (FastAPI on Cloud Run) owns the whole login flow; write endpoints require an admin session.
- The four pages decide admin mode from `GET /auth/me`, not from `?admin=True`.

## Non-goals / anti-goals
- No Firebase, no Google SDK in the browser, no tokens readable by JavaScript.
- No hosting migration (stays GitHub Pages).
- Must not leave a state where the UI hides buttons but the API still accepts anonymous writes.
- No user/role table; allowlist is a Cloud Run env var.

## Approaches considered
- **A (chosen)**: backend OAuth code flow + HttpOnly session cookie. Least frontend code, token never in JS.
- B: Google Identity Services button + backend verifies ID token. Extra browser SDK, flow split across both sides.
- C: Firebase Auth + Hosting. Extra service and hosting migration for a one-user allowlist.

## Design
Backend (spec in `2026-11-20-admin-auth-openapi.yaml`; implemented by the user in the FastAPI repo):
- `GET /api/mktobs/auth/google/login?next=<url>`: sets signed `state` cookie, 302 to Google. `next` must match
  `FRONTEND_ORIGINS` (open-redirect guard).
- `GET /api/mktobs/auth/google/callback`: verify state, exchange code, require `email_verified` and email in
  `ADMIN_EMAILS`; else 302 to `next?auth_error=forbidden`. On success Set-Cookie `mktobs_session` (signed, HttpOnly,
  Secure, SameSite=Lax, `Domain=.smallplum.xyz`, ~7 days) and 302 to `next`.
- `GET /auth/me` -> `{email, admin:true}` or 401. `POST /auth/logout` clears the cookie.
- `require_admin` dependency on every POST/PUT/DELETE under bookmark, watchlist, surge (401 no session, 403 not admin)
  and on write requests also requires header `X-Requested-With: mktobs` (CSRF).
- CORS: `allow_origins=FRONTEND_ORIGINS` (no `*`), `allow_credentials=True`, allow header `X-Requested-With`.
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ADMIN_EMAILS`, `FRONTEND_ORIGINS`, `COOKIE_DOMAIN`.

Frontend:
- New `docs/assets/auth.js` (`UIAuth`): `me()` (cached promise, null on 401), `isAdmin()`, `loginUrl(next)`, `logout()`,
  `apiFetch(url, opts)` (adds `credentials:"include"` and, for non-GET, `X-Requested-With`; on 401 redirects to /dashboard).
- New `docs/dashboard.html`, added to nav in `shell.js` (and README table).
- `bookmark`, `watchlist`, `surge`, `stock`: replace the `?admin=True` constant with `await UIAuth.isAdmin()` and switch
  write calls to `UIAuth.apiFetch`. Reads stay anonymous.
- UI tests: mock `/auth/me` and the API in Playwright; replace `?admin=True` tests with logged-in/logged-out cases.

## Constraints and known limits
- Cookie sharing needs frontend and API under the same site (`observe.smallplum.xyz` / `market.smallplum.xyz`: OK).
- Local preview at `localhost` can't receive a `.smallplum.xyz` cookie, so admin mode is testable only via mocked
  `/auth/me` in Playwright or by running the backend locally with `COOKIE_DOMAIN` unset and `localhost` in
  `FRONTEND_ORIGINS`.
- Google OAuth client needs the callback URL added as an authorized redirect URI (user action).

## Left to the builder
Exact visual layout of `/dashboard` (follow `ui.css` design system), error messages, session lifetime tuning.

## Revision (2026-11-20, after backend delivery): Bearer ID token instead of session cookie
The user asked for the admin APIs to be called with `Authorization: Bearer <Google ID token>`.
This replaces approach A's cookie flow with approach B:
- Frontend signs in with Google Identity Services on `/dashboard`; the ID token is kept in `localStorage`
  (key `mktobs_id_token`) and expires in about 1 hour (no refresh; the user signs in again).
- `UIAuth.apiFetch` adds the Bearer header; `UIAuth.me()` calls `GET /auth/me` with it (401 -> signed out,
  403 -> not on the allowlist). No cookies, so no CSRF header, no `/auth/google/*` or `/auth/logout` endpoints.
- Backend verifies the token on every request (audience, `email_verified`, `ADMIN_EMAILS`).
- Consequences accepted: the token is readable by page JavaScript (mitigated by the short lifetime); the OAuth
  setup needs "Authorized JavaScript origins" instead of a redirect URI.
