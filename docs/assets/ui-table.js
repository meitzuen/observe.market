(function (root) {
  "use strict";

  const isNil = (v) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));

  function sortRows(rows, key, dir) {
    const sign = dir === "desc" ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (isNil(av) && isNil(bv)) return 0;
      if (isNil(av)) return 1;
      if (isNil(bv)) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
      return String(av).localeCompare(String(bv), "zh-TW") * sign;
    });
  }

  function filterRows(rows, text, keys) {
    const q = String(text == null ? "" : text).trim().toLowerCase();
    if (!q) return rows.slice();
    return rows.filter((r) =>
      keys.some((k) => !isNil(r[k]) && String(r[k]).toLowerCase().includes(q)),
    );
  }

  function paginate(rows, page, size) {
    const total = rows.length;
    const per = Math.max(1, size | 0);
    const pages = Math.max(1, Math.ceil(total / per));
    const p = Math.min(Math.max(1, page | 0), pages);
    return { rows: rows.slice((p - 1) * per, p * per), page: p, pages, total };
  }

  function fmtNum(n, digits) {
    if (isNil(n)) return "--";
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0,
    });
  }

  function fmtPct(n, digits) {
    if (isNil(n)) return "--";
    const d = digits == null ? 2 : digits;
    const body = Math.abs(n).toFixed(d) + "%";
    if (Number(n.toFixed(d)) === 0) return (0).toFixed(d) + "%";
    return (n > 0 ? "+" : "−") + body;
  }

  function changeClass(n) {
    if (isNil(n) || n === 0) return "";
    return n > 0 ? "price-up" : "price-down";
  }

  const api = { sortRows, filterRows, paginate, fmtNum, fmtPct, changeClass };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.UITable = api;
})(typeof window !== "undefined" ? window : globalThis);
