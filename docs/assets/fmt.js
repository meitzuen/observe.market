(function (root) {
  "use strict";

  // Shared formatting / escaping helpers (zh-TW). Loaded as window.UIFmt.

  const bad = (v) => v == null || Number.isNaN(v);

  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escAttr(s) {
    return String(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtMoney(v) {
    if (bad(v)) return "—";
    return v.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
  }

  function fmtPrice(v) {
    if (bad(v)) return "—";
    return v.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Signed percent, e.g. +1.23% / -0.50% / 0.00%
  function fmtPct(v) {
    if (bad(v)) return "—";
    return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
  }

  // CSS class for profit/loss colouring (price-up / price-down / price-neutral).
  function plClass(v) {
    if (bad(v) || v === 0) return "price-neutral";
    return v > 0 ? "price-up" : "price-down";
  }

  const api = { escHtml, escAttr, fmtMoney, fmtPrice, fmtPct, plClass };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.UIFmt = api;
})(typeof window !== "undefined" ? window : globalThis);
