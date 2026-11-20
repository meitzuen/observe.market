(function (root) {
  "use strict";

  // Admin session helper. The user signs in with Google Identity Services in the
  // browser; the resulting Google ID token (JWT, ~1h) is sent as
  // `Authorization: Bearer <token>` on admin API calls. The backend verifies it
  // (audience, email_verified, allowlist) on every request.
  // Loaded as window.UIAuth.

  const API_BASE = "https://market.smallplum.xyz";
  const AUTH_BASE = API_BASE + "/api/mktobs/auth";
  // OAuth client ID is public by design (it is visible in every Google sign-in URL).
  const GOOGLE_CLIENT_ID = "935744844603-da7cfqlbnkmivr57k9jtquqbqh5gdlnm.apps.googleusercontent.com";
  const TOKEN_KEY = "mktobs_id_token";
  const SKEW_SECONDS = 30; // treat a token this close to expiry as expired

  const defaultFetch = (...a) => root.fetch(...a);
  let cache = null; // Promise of me(), cleared on token change / force

  // ---- token storage -------------------------------------------------------

  function jwtExp(token) {
    try {
      const p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(root.atob(p)).exp || 0;
    } catch (e) {
      return 0;
    }
  }

  function storage() {
    try {
      return root.localStorage;
    } catch (e) {
      return null;
    }
  }

  function clearToken() {
    cache = null;
    const s = storage();
    try {
      if (s) s.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function setToken(token) {
    cache = null;
    const s = storage();
    try {
      if (s) s.setItem(TOKEN_KEY, token);
    } catch (e) {}
  }

  // The stored ID token, or null when missing / expired (expired tokens are removed).
  function getToken() {
    const s = storage();
    let t = null;
    try {
      t = s && s.getItem(TOKEN_KEY);
    } catch (e) {}
    if (!t) return null;
    if (jwtExp(t) <= Date.now() / 1000 + SKEW_SECONDS) {
      clearToken();
      return null;
    }
    return t;
  }

  // ---- session -------------------------------------------------------------

  // {email, admin} when the token is accepted. null when there is no usable token
  // or the backend answers 401. Throws (with .status) on 403 (not on the allowlist)
  // and on any other failure.
  function me(opts) {
    const o = opts || {};
    if (cache && !o.force) return cache;
    const token = getToken();
    if (!token) return Promise.resolve(null);
    const f = o.fetchImpl || defaultFetch;
    const p = (async () => {
      const res = await f(AUTH_BASE + "/me", { headers: { Authorization: "Bearer " + token } });
      if (res.status === 401) {
        clearToken();
        return null;
      }
      if (!res.ok) {
        if (res.status === 403) clearToken();
        const err = new Error("HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    })();
    cache = p;
    // A failure must not stick: the next call (e.g. Retry) fetches again.
    p.catch(() => {
      if (cache === p) cache = null;
    });
    return p;
  }

  async function isAdmin(opts) {
    try {
      const m = await me(opts);
      return !!(m && m.admin);
    } catch (e) {
      return false;
    }
  }

  function logout() {
    clearToken();
    try {
      if (root.google && root.google.accounts) root.google.accounts.id.disableAutoSelect();
    } catch (e) {}
  }

  // ---- Google sign-in (loaded on demand, only the dashboard needs it) ------

  function loadGsi() {
    return new Promise((resolve, reject) => {
      if (root.google && root.google.accounts && root.google.accounts.id) return resolve();
      const s = root.document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("無法載入 Google 登入"));
      root.document.head.appendChild(s);
    });
  }

  // Renders the Google button into `el`; onSignedIn() runs after a token is stored.
  async function renderSignIn(el, onSignedIn) {
    await loadGsi();
    root.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (resp) => {
        setToken(resp.credential);
        onSignedIn();
      },
      auto_select: true,
      cancel_on_tap_outside: false,
    });
    root.google.accounts.id.renderButton(el, { theme: "outline", size: "large", text: "signin_with", locale: "zh-TW" });
  }

  // ---- API calls -----------------------------------------------------------

  // fetch with `Authorization: Bearer <ID token>`. A 401 clears the token and
  // sends the user to /dashboard to sign in again (the response is still returned).
  async function apiFetch(url, init, deps) {
    const d = deps || {};
    const f = d.fetchImpl || defaultFetch;
    const redirect = d.redirect || ((u) => root.location.assign(u));
    const opts = Object.assign({}, init);
    const token = getToken();
    if (token) opts.headers = Object.assign({}, opts.headers, { Authorization: "Bearer " + token });
    const res = await f(url, opts);
    if (res.status === 401) {
      clearToken();
      redirect("/dashboard");
    }
    return res;
  }

  const api = { API_BASE, AUTH_BASE, GOOGLE_CLIENT_ID, getToken, me, isAdmin, logout, renderSignIn, apiFetch };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.UIAuth = api;
})(typeof window !== "undefined" ? window : globalThis);
