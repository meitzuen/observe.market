(function (root) {
  "use strict";

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Fetch JSON with a timeout and retry. A 404 is final (the file will not
  // appear on retry), everything else is retried `retries` times.
  async function loadJSON(url, opts) {
    const o = Object.assign(
      { timeout: 10000, retries: 1, retryDelay: 400, fetchImpl: null },
      opts || {},
    );
    const doFetch = o.fetchImpl || root.fetch.bind(root);
    let lastErr;
    for (let attempt = 0; attempt <= o.retries; attempt++) {
      const ctrl =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), o.timeout) : null;
      try {
        const res = await doFetch(url, ctrl ? { signal: ctrl.signal } : undefined);
        if (!res.ok) {
          const e = new Error("HTTP " + res.status + " for " + url);
          e.status = res.status;
          throw e;
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (err && err.status === 404) break;
        if (attempt < o.retries) await sleep(o.retryDelay);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    throw lastErr;
  }

  // Replace el's content with a consistent loading / empty / error state.
  function renderState(el, state, opts) {
    const o = opts || {};
    if (state === "loading") {
      const rows = o.rows || 4;
      el.innerHTML =
        '<div class="skeleton-block" role="status" aria-label="載入中">' +
        '<div class="skeleton"></div>'.repeat(rows) +
        "</div>";
      return;
    }
    if (state === "empty") {
      el.innerHTML =
        '<div class="empty-state"><div class="empty-title">' +
        esc(o.title || "沒有符合的資料") +
        "</div>" +
        (o.hint ? '<div class="empty-hint">' + esc(o.hint) + "</div>" : "") +
        (o.actionLabel
          ? '<button type="button" class="btn" data-action="empty">' +
            esc(o.actionLabel) +
            "</button>"
          : "") +
        "</div>";
      const b = el.querySelector('[data-action="empty"]');
      if (b && o.onAction) b.addEventListener("click", o.onAction);
      return;
    }
    if (state === "error") {
      el.innerHTML =
        '<div class="banner banner-error" role="alert"><span>' +
        esc(o.message || "資料載入失敗") +
        '</span><button type="button" class="btn btn-secondary" data-action="retry">重試</button></div>';
      const b = el.querySelector('[data-action="retry"]');
      if (b && o.onRetry) b.addEventListener("click", o.onRetry);
    }
  }

  // Static JSON (docs/data) is served from DATA_BASE. Leave it as "data/" to
  // read from the same origin, or point it at the R2 custom domain, e.g.
  // "https://data.observe.market/". Always ends with "/".
  const DATA_BASE = "data/";

  function dataUrl(path) {
    return DATA_BASE + String(path).replace(/^\/+/, "");
  }

  const api = { loadJSON, renderState, dataUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.UIData = api;
})(typeof window !== "undefined" ? window : globalThis);
