(function (global) {
  "use strict";

  // Turns OCR text into a list of Taiwan stocks by matching it against
  // stock_info.json ({ code: { name, type } }). Pure functions, unit tested.

  // Higher wins when the same stock is seen several times.
  const RANK = { both: 3, name: 2, fuzzy: 1, code: 1 };

  const CJK = /[㐀-鿿]/;
  // 4-6 digits, optional trailing capital (00835B), not part of a longer
  // number, a decimal ("1050.00"), a thousands group ("1,050"), a percent, a
  // date ("2024/11/15") or a time ("13:30").
  const CODE_RE = /(?<![\d.,/:A-Za-z])(\d{4,6}[A-Z]?)(?![\d.,%/:A-Za-z])/g;
  // stock_info.json also lists indices (TAIEX, TPEx); only real codes count.
  const STOCK_CODE = /^\d{4,6}[A-Z]?$/;

  function toHalfWidth(s) {
    return String(s == null ? "" : s)
      .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/　/g, " ");
  }

  function compact(s) {
    return s.replace(/\s+/g, "");
  }

  const indexCache = new WeakMap();

  // Names longest first, so 「台積電」 masks before a shorter name could match
  // inside it. Fuzzy candidates are bucketed by length.
  function buildIndex(stockInfo) {
    if (indexCache.has(stockInfo)) return indexCache.get(stockInfo);
    const byName = new Map();
    for (const [code, info] of Object.entries(stockInfo || {})) {
      if (!STOCK_CODE.test(code)) continue;
      const name = compact(toHalfWidth(info && info.name ? info.name : ""));
      if (name.length < 2 || byName.has(name)) continue;
      byName.set(name, code);
    }
    const names = [...byName.keys()].sort((a, b) => b.length - a.length);
    const byLength = new Map();
    for (const n of names) {
      const cjk = [...n].filter((c) => CJK.test(c)).length;
      if (n.length < 3 || cjk < 2) continue;
      if (!byLength.has(n.length)) byLength.set(n.length, []);
      byLength.get(n.length).push(n);
    }
    const index = { byName, names, byLength };
    indexCache.set(stockInfo, index);
    return index;
  }

  function oneCharOff(a, b) {
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i] && ++diff > 1) return false;
    }
    return diff === 1;
  }

  function mask(s, start, len) {
    return s.slice(0, start) + "\u0000".repeat(len) + s.slice(start + len);
  }

  // Returns [{ code, via }] for one line, in reading order.
  function matchLine(line, stockInfo, index) {
    const hits = [];

    for (const m of line.matchAll(CODE_RE)) {
      if (stockInfo[m[1]]) hits.push({ code: m[1], via: "code", pos: m.index });
    }

    // Positions in the compacted line are only used for ordering; scale them so
    // they interleave sensibly with the code positions above.
    let rest = compact(line);
    const scale = rest.length ? line.length / rest.length : 1;
    const nameHits = [];
    for (const name of index.names) {
      if (name.length > rest.length) continue;
      let at = rest.indexOf(name);
      while (at !== -1) {
        nameHits.push({ code: index.byName.get(name), via: "name", pos: at * scale });
        rest = mask(rest, at, name.length);
        at = rest.indexOf(name, at + name.length);
      }
    }

    // One wrong character, e.g. 「鴻诲」 for 「鴻海」-length names of 3+.
    for (const [len, candidates] of index.byLength) {
      for (let i = 0; i + len <= rest.length; i++) {
        const win = rest.slice(i, i + len);
        if (win.includes("\u0000") || !CJK.test(win)) continue;
        const found = candidates.filter((n) => oneCharOff(win, n));
        if (found.length !== 1) continue; // ambiguous or none
        nameHits.push({ code: index.byName.get(found[0]), via: "fuzzy", pos: i * scale });
        rest = mask(rest, i, len);
        i += len - 1;
      }
    }

    // A code and its own name on the same line confirm each other.
    const named = new Set(nameHits.map((h) => h.code));
    for (const h of hits) if (named.has(h.code)) h.via = "both";
    const coded = new Set(hits.map((h) => h.code));
    for (const h of nameHits) if (!coded.has(h.code)) hits.push(h);

    return hits.sort((a, b) => a.pos - b.pos);
  }

  function extractStocks(text, stockInfo) {
    const info = stockInfo || {};
    const index = buildIndex(info);
    const found = new Map();
    for (const line of toHalfWidth(text).split(/\r?\n/)) {
      for (const h of matchLine(line, info, index)) {
        const prev = found.get(h.code);
        if (!prev) found.set(h.code, h.via);
        else if (RANK[h.via] > RANK[prev]) found.set(h.code, h.via);
      }
    }
    return [...found].map(([code, via]) => ({
      code,
      name: info[code].name,
      market: info[code].type === "tpex" ? "上櫃" : "上市",
      via,
    }));
  }

  // Merge results from several screenshots, keeping first-seen order and the
  // most confident match for each code.
  function mergeResults(lists) {
    const out = new Map();
    for (const list of lists) {
      for (const r of list) {
        const prev = out.get(r.code);
        if (!prev || RANK[r.via] > RANK[prev.via]) out.set(r.code, prev ? { ...prev, via: r.via } : r);
      }
    }
    return [...out.values()];
  }

  const api = { toHalfWidth, extractStocks, mergeResults };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") global.StockOCR = api;
})(typeof window !== "undefined" ? window : globalThis);
