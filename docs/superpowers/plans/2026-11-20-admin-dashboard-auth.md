# Admin Dashboard + Google Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/dashboard` with Google login (backend-owned OAuth, allowlist); the admin features of `bookmark`, `watchlist`, `surge`, `stock` are enabled by the logged-in session instead of `?admin=True`.

**Architecture:** FastAPI (Cloud Run, separate repo, updated by the user from an OpenAPI spec this plan produces) owns the OAuth code flow and issues an HttpOnly session cookie on `.smallplum.xyz`. The static frontend gets one new helper (`docs/assets/auth.js`, `window.UIAuth`) that asks `GET /auth/me` and sends credentialed, CSRF-headed writes. No Google SDK in the browser.

**Tech Stack:** Vanilla JS static pages (no build step), `node --test` unit tests, Playwright 1.48 UI tests, OpenAPI 3.1 YAML.

**Spec:** `docs/superpowers/specs/2026-11-20-admin-dashboard-auth-design.md`

## Global Constraints

- API base: `https://market.smallplum.xyz`, auth prefix `/api/mktobs/auth`.
- Session cookie name `mktobs_session` (HttpOnly, Secure, SameSite=Lax, `Domain=.smallplum.xyz`) is set only by the backend; frontend JS never reads or writes it.
- Every non-GET/HEAD API call from the frontend sends `credentials: "include"` and header `X-Requested-With: mktobs`.
- Admin mode must never be derived from the URL. `?admin=True` has no effect after this change.
- Reads (GET) stay anonymous and unchanged.
- No build step; follow existing style (`(function(root){...})` UMD export like `docs/assets/data.js`, `esc()` from `docs/assets/fmt.js` for any HTML interpolation).
- No git commits unless the user asks.

## Review Focus

1. `/auth/me` fails (network error / 5xx): pages render read-only, no admin buttons, no uncaught page error.
2. A write returns 401 (session expired): user is sent to `/dashboard`, not left with a silent failure.
3. `?admin=True` with no session shows no admin controls on all four pages.
4. `/dashboard?auth_error=forbidden` (non-allowlisted Google account) shows an explicit "not on allowlist" message, with a way to retry.
5. Email / error text from the API is rendered as text (no HTML injection) on the dashboard.

## File Structure

- Create `docs/superpowers/specs/2026-11-20-admin-auth-openapi.yaml`: backend contract (deliverable for the user).
- Create `docs/assets/auth.js`: `UIAuth` helper (one responsibility: session state + credentialed fetch).
- Create `docs/dashboard.html`: login / logged-in page.
- Modify `docs/assets/shell.js` (nav entry), `docs/bookmark.html`, `docs/watchlist.html`, `docs/surge.html`, `docs/stock.html`, `README.md`.
- Modify `tests/ui/pages.json`, `tests/ui/migrated.json`, `tests/ui/collections.spec.js`.
- Create `tests/ui/unit/auth.test.js`, `tests/ui/auth-mock.js` (shared Playwright route helper), `tests/ui/dashboard.spec.js`.

---

### Task 1: OpenAPI contract for the backend

**Files:**
- Create: `docs/superpowers/specs/2026-11-20-admin-auth-openapi.yaml`

**Interfaces:**
- Produces: the contract Tasks 2-4 and the user's FastAPI work rely on. Paths (all under `/api/mktobs`):
  - `GET /auth/google/login?next=` -> 302 to Google; sets signed `state` cookie; 400 if `next` origin not in `FRONTEND_ORIGINS`.
  - `GET /auth/google/callback?code&state` -> 302 to `next` with Set-Cookie `mktobs_session`; on non-allowlisted / unverified email 302 to `next` + `?auth_error=forbidden`; bad state 400.
  - `GET /auth/me` -> 200 `{"email": string, "admin": true}`, 401 `{"detail": "not_authenticated"}`.
  - `POST /auth/logout` -> 204, clears cookie; requires `X-Requested-With: mktobs`.
  - Every existing POST/PUT/PATCH/DELETE under `/bookmark`, `/watchlist`, `/surge` documented with `security: [sessionCookie]`, header parameter `X-Requested-With` (required), and responses 401 / 403 (`{"detail": "forbidden"}`) / 400 for missing header.
  - Components: `securitySchemes.sessionCookie` (apiKey in cookie `mktobs_session`); a "Deployment notes" description listing env vars `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ADMIN_EMAILS`, `FRONTEND_ORIGINS`, `COOKIE_DOMAIN`, the Google redirect URI (`https://market.smallplum.xyz/api/mktobs/auth/google/callback`), and the CORS requirement (explicit origins, `allow_credentials=True`, allow header `X-Requested-With`).

- [ ] **Step 1: Read the existing write calls** in `docs/bookmark.html` (~236-275), `docs/watchlist.html` (~850-925), `docs/surge.html` (~300, 605-630), `docs/stock.html` (~920) to copy the exact existing method + path shapes (e.g. `PATCH /watchlist/{name}`, `DELETE /watchlist/{name}/items/{stock_id}`, `PUT /watchlist/orders`, `PUT /surge/{id}`). Request/response bodies for these existing endpoints are `type: object` placeholders marked "unchanged"; only auth behaviour is specified.
- [ ] **Step 2: Write the YAML** with the interfaces above.
- [ ] **Step 3: Validate** it parses: `python -c "import yaml,sys; yaml.safe_load(open('docs/superpowers/specs/2026-11-20-admin-auth-openapi.yaml'))"` (run from repo root; `pip install pyyaml` if missing). Expected: no output, exit 0.

---

### Task 2: `UIAuth` helper (TDD)

**Files:**
- Create: `docs/assets/auth.js`
- Test: `tests/ui/unit/auth.test.js`

**Interfaces:**
- Consumes: Task 1 paths.
- Produces (CommonJS export + `window.UIAuth`), all deps injectable for tests:
  - `API_BASE: string`, `AUTH_BASE: string` (`API_BASE + "/api/mktobs/auth"`)
  - `loginUrl(next?: string): string` -> `${AUTH_BASE}/google/login?next=${encodeURIComponent(next ?? defaultNext)}`; `defaultNext` is `location.origin + "/dashboard"` in browsers (pass explicit `next` in tests).
  - `me(opts?: {fetchImpl?, force?: boolean}): Promise<{email: string, admin: boolean} | null>`: `null` on 401; throws `Error` on other non-OK or network failure; caches the successful/401 result per page until `force` or `logout()`.
  - `isAdmin(opts?): Promise<boolean>`: `me()` -> `!!(m && m.admin)`; returns `false` (never throws) if `me()` throws.
  - `logout(opts?): Promise<void>`: `POST ${AUTH_BASE}/logout` with credentials + CSRF header, clears the cache.
  - `apiFetch(url: string, init?: RequestInit, deps?: {fetchImpl?, redirect?: (url: string) => void}): Promise<Response>`: always `credentials: "include"`; for methods other than GET/HEAD adds header `X-Requested-With: mktobs` (preserving caller headers); if the response status is 401 calls `redirect("/dashboard")` (default `location.assign`) and still returns the response.

- [ ] **Step 1: Write failing tests** in `tests/ui/unit/auth.test.js` (same style as `unit/data.test.js`, fake `fetchImpl`). Names and assertions:
  - `loginUrl encodes next`: `loginUrl("https://observe.smallplum.xyz/dashboard?a=1")` equals `https://market.smallplum.xyz/api/mktobs/auth/google/login?next=https%3A%2F%2Fobserve.smallplum.xyz%2Fdashboard%3Fa%3D1`.
  - `me returns the body on 200`, `me returns null on 401`, `me throws on 500`, `me caches the result (one fetch for two calls)`, `me force bypasses cache`.
  - `isAdmin is true only when admin:true`, `isAdmin is false on 401`, `isAdmin is false (no throw) on network error`.
  - `apiFetch POST sends credentials include and X-Requested-With`, `apiFetch GET sends credentials but no X-Requested-With`, `apiFetch keeps caller headers (Content-Type)`, `apiFetch 401 calls redirect("/dashboard")`.
  - `logout POSTs to /auth/logout and clears the me cache` (call `me`, `logout`, `me` -> three fetches in total, the last `me` hits the network again).
- [ ] **Step 2: Run, expect FAIL** (module not found): from `tests/ui`: `node --test unit/auth.test.js`.
- [ ] **Step 3: Implement `docs/assets/auth.js`** per the interface block; mirror the IIFE/export pattern at the bottom of `docs/assets/data.js`. Cache is a module-level promise.
- [ ] **Step 4: Run, expect PASS**: `npm run test:unit` (all unit tests, not just the new file).

---

### Task 3: `/dashboard` page, nav entry, page registry

**Files:**
- Create: `docs/dashboard.html`, `tests/ui/auth-mock.js`, `tests/ui/dashboard.spec.js`
- Modify: `docs/assets/shell.js` (nav group "個人": add `{ href: "dashboard", label: "管理後台", desc: "Google 登入後使用管理功能" }`), `tests/ui/pages.json`, `tests/ui/migrated.json` (add `"dashboard.html"` to both), `README.md` (feature table row under 個人; project-structure line for `auth.js`; short "管理功能與登入" section listing the backend env vars by pointing to the OpenAPI file).

**Interfaces:**
- Consumes: `UIAuth.me`, `UIAuth.loginUrl`, `UIAuth.logout`, `esc` from `fmt.js`, page shell pattern from an existing small page (copy `docs/bookmark.html`'s `<head>`, shell/footer includes and `ui.css` classes; add `<script src="assets/auth.js">` after `data.js`).
- Produces: DOM contract used by tests: states `#auth-loading`, `#auth-logged-out` (contains `a#login-btn` whose `href` is `UIAuth.loginUrl()`, and `#auth-error` hidden unless `?auth_error=forbidden`), `#auth-logged-in` (contains `#user-email`, `button#logout-btn`, and `a` links to `bookmark`, `watchlist`, `surge`, `index` with text of their pages), and an error banner via `UIData.renderState` when `/auth/me` throws, with Retry re-running the check.
- `tests/ui/auth-mock.js` exports `mockAuth(page, { admin: boolean, meFails?: boolean })` routing `**/api/mktobs/auth/me` (200 `{email:"admin@example.com",admin:true}` / 401 / abort) and `**/api/mktobs/auth/logout` (204, flips state to 401), and `CORS` headers valid for credentialed requests: `access-control-allow-origin: http://127.0.0.1:4173`, `access-control-allow-credentials: true`, methods `GET,POST,PUT,PATCH,DELETE,OPTIONS`, headers `content-type,x-requested-with` (wildcards are rejected by browsers when credentials are included).

- [ ] **Step 1: Write failing Playwright tests** in `tests/ui/dashboard.spec.js` (desktop project only, like `collections.spec.js`):
  - `dashboard: logged out shows the login button`: `mockAuth(page,{admin:false})`; `#auth-logged-out` visible; `#login-btn` href starts with `https://market.smallplum.xyz/api/mktobs/auth/google/login?next=` and contains `dashboard`; `#auth-logged-in` hidden.
  - `dashboard: logged in shows email and admin links`: `#user-email` has text `admin@example.com`; links to `bookmark`, `watchlist`, `surge` visible.
  - `dashboard: logout returns to the login state`: click `#logout-btn`; `#auth-logged-out` visible.
  - `dashboard: auth_error=forbidden explains the allowlist`: goto `/dashboard.html?auth_error=forbidden` (logged out); `#auth-error` visible and contains `白名單`; `#login-btn` still visible.
  - `dashboard: /auth/me failure shows an error banner, Retry recovers`: `meFails:true` -> `.banner-error` visible; flip to success, click `[data-action="retry"]` -> logged-in state.
  - `dashboard: email is rendered as text`: `me` returns `email: "<img src=x onerror=window.__x=1>@e.com"`; `await expect(page.locator("#user-email img")).toHaveCount(0)` and `window.__x` undefined.
- [ ] **Step 2: Run, expect FAIL**: from `tests/ui`: `npx playwright test dashboard.spec.js --project=desktop`.
- [ ] **Step 3: Implement `docs/dashboard.html`, nav entry, registry entries, README** per the DOM contract above. Show only the state block matching the result; `#auth-loading` visible until `me()` settles.
- [ ] **Step 4: Run, expect PASS**: `npx playwright test dashboard.spec.js shell.spec.js smoke.spec.js` plus `npm run test:unit` (nav change is covered by `unit/shell.test.js` and the smoke page list).

---

### Task 4: Switch the four pages from `?admin=True` to the session

**Files:**
- Modify: `docs/bookmark.html` (`isManage` const at ~211; fetches at ~238, 251, 267; init at ~486), `docs/watchlist.html` (`isManage` at ~817; write fetches ~854-925; init ~1762), `docs/surge.html` (`isAdmin` at ~303, `callApi` at ~574, admin block at ~601), `docs/stock.html` (`isAdmin` at ~251, render at ~532, write fetch ~920)
- Modify: `tests/ui/collections.spec.js`

**Interfaces:**
- Consumes: `UIAuth.isAdmin()`, `UIAuth.apiFetch(url, init)` from Task 2; `mockAuth`, `CORS` from Task 3's `tests/ui/auth-mock.js`.
- Produces: no new public API. Behaviour: each page loads `assets/auth.js`, changes its admin flag from a synchronous URL-derived `const` to `let` assigned from `await UIAuth.isAdmin()` **before the first render that reads it**; every POST/PUT/PATCH/DELETE goes through `UIAuth.apiFetch`; GETs are unchanged.

- [ ] **Step 1: Update `tests/ui/collections.spec.js` first (failing tests):**
  - Replace its local `CORS` with the credentialed one from `auth-mock.js`.
  - Add `await mockAuth(page, { admin: true })` before `goto` in the admin tests (`bookmark: admin add, edit and delete use the API`, `watchlist: admin add and remove...`, and the `page2` admin case in `watchlist: empty list and no lists...`) and change their URLs from `?admin=True` to the plain path; add `{admin:false}` in the non-admin tests.
  - Add `bookmark/watchlist: ?admin=True without a session shows no admin controls` (mockAuth admin:false; goto `?admin=True`; bookmark: `#toggle-form-btn` hidden and `.bookmark-actions` count 0; watchlist: `#toggle-add-btn` hidden).
  - Add `bookmark: write 401 redirects to /dashboard`: admin mock, but the POST route fulfils 401; after submit `await expect(page).toHaveURL(/\/dashboard/)`.
  - Add `bookmark: /auth/me failure leaves the page read-only without page errors` (`meFails:true`; cards render; admin controls absent; `collectErrors` empty).
  - In an admin write test, assert the POST/PUT/DELETE requests carry header `x-requested-with: mktobs` (record `req.headers()` in the mock's `calls`).
- [ ] **Step 2: Run, expect FAIL**: `npx playwright test collections.spec.js --project=desktop`.
- [ ] **Step 3: Migrate the four pages.** Add `<script src="assets/auth.js"></script>` after `data.js`. Wrap each page's startup so `isManage`/`isAdmin` is resolved first. In `surge.html` `callApi` uses `UIAuth.apiFetch` and keeps its existing `Content-Type` header and error text; `stock.html`'s admin-only block (watchlist picker + portfolio link) is rendered from the resolved flag. Remove every `URLSearchParams(...).get("admin")` use (`grep -rn 'get("admin")' docs` must return nothing).
- [ ] **Step 4: Run the whole suite, expect PASS**: from `tests/ui`: `npm run test:unit && npm test`. `stock-security.spec.js` and `smoke.spec.js` must still pass; `stock.html` has no admin test today, so also add `stock: admin controls appear only with an admin session` to `collections.spec.js` (stock page `/stock.html?id=2330`, `#btn-add-watchlist` visible with admin mock, absent without).
- [ ] **Step 5: Manual check list for the user** (report, do not automate): after deploying the backend, open `/dashboard` -> sign in with an allowlisted account -> add/delete a bookmark; sign in with a non-allowlisted account -> see the allowlist message; `curl -X POST https://market.smallplum.xyz/api/mktobs/bookmark -H 'content-type: application/json' -d '{}'` returns 401.

---

## Self-review

- Spec coverage: OpenAPI (T1), `auth.js` + CSRF header + 401 redirect (T2), `/dashboard` + nav + README (T3), four pages off `?admin=True` + tests (T4). Backend implementation is intentionally out of this repo; T1 is its contract.
- Type consistency: `UIAuth.me/isAdmin/loginUrl/logout/apiFetch` signatures are identical in T2-T4; DOM ids in T3 are the ones its tests use.
- Review Focus: 1 -> T4 `/auth/me failure` test and T2 `isAdmin` no-throw; 2 -> T2 redirect test + T4 write-401 test; 3 -> T4 `?admin=True` test; 4 -> T3 `auth_error` test; 5 -> T3 text-render test.
