(function (root) {
  "use strict";

  // Admin session helper. Login is owned by the backend (Google OAuth + HttpOnly
  // cookie); this file only asks "who am I?" and sends credentialed writes.
  // Loaded as window.UIAuth.

  const API_BASE = "https://market.smallplum.xyz";
  const AUTH_BASE = API_BASE + "/api/mktobs/auth";
  const CSRF_HEADER = { "X-Requested-With": "mktobs" };

  const defaultFetch = (...a) => root.fetch(...a);
  let cache = null; // Promise of me(), cleared by logout() / force

  function loginUrl(next) {
    const target = next != null ? next : root.location.origin + "/dashboard";
    return AUTH_BASE + "/google/login?next=" + encodeURIComponent(target);
  }

  // {email, admin} when logged in, null on 401, throws on anything else.
  function me(opts) {
    const o = opts || {};
    if (cache && !o.force) return cache;
    const f = o.fetchImpl || defaultFetch;
    const p = (async () => {
      const res = await f(AUTH_BASE + "/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("HTTP " + res.status);
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

  async function logout(opts) {
    const f = (opts && opts.fetchImpl) || defaultFetch;
    cache = null;
    const res = await f(AUTH_BASE + "/logout", {
      method: "POST",
      credentials: "include",
      headers: CSRF_HEADER,
    });
    if (!res.ok && res.status !== 401) throw new Error("HTTP " + res.status);
  }

  // fetch with the session cookie; non-GET requests also carry the CSRF header.
  // A 401 sends the user to /dashboard to sign in again (the response is still returned).
  async function apiFetch(url, init, deps) {
    const d = deps || {};
    const f = d.fetchImpl || defaultFetch;
    const redirect = d.redirect || ((u) => root.location.assign(u));
    const opts = Object.assign({}, init, { credentials: "include" });
    const method = String(opts.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      opts.headers = Object.assign({}, opts.headers, CSRF_HEADER);
    }
    const res = await f(url, opts);
    if (res.status === 401) {
      cache = null;
      redirect("/dashboard");
    }
    return res;
  }

  const api = { API_BASE, AUTH_BASE, loginUrl, me, isAdmin, logout, apiFetch };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.UIAuth = api;
})(typeof window !== "undefined" ? window : globalThis);
