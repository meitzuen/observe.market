(function (global) {
  "use strict";

  // Single source of truth for site navigation. Adding a page = one entry.
  const NAV = [
    {
      label: "市場",
      items: [
        { href: "twse.html", label: "上市", desc: "上市大盤與個股行情" },
        { href: "tpex.html", label: "上櫃", desc: "上櫃大盤與個股行情" },
        { href: "index.html", label: "全部", desc: "上市＋上櫃整合大盤" },
      ],
    },
    {
      label: "策略",
      items: [
        { href: "punish.html", label: "處置股票", desc: "最新處置股票名單" },
        { href: "volume-candle.html", label: "爆量長紅黑K", desc: "爆量長紅／長黑 K 線個股" },
        { href: "gap.html", label: "跳空漲跌", desc: "開盤跳空強弱勢個股" },
        { href: "wantgoo.html", label: "基本面", desc: "Wantgoo 基本面數據排行" },
        { href: "volatility.html", label: "區間波動率", desc: "區間日／年化波動率與漲跌" },
        { href: "vcp.html", label: "VCP選股", desc: "收縮型態（VCP）選股" },
      ],
    },
    {
      label: "權證",
      items: [
        { href: "premium-warrant.html", label: "精選權證", desc: "精選權證清單" },
        { href: "warrant-filter.html", label: "權證篩選", desc: "依條件篩選權證" },
      ],
    },
    {
      label: "選股",
      items: [
        { href: "screener.html", label: "股票篩選", desc: "區間漲跌幅與成交量排行" },
        { href: "watchlist.html", label: "精選類股", desc: "我的自選股清單與即時價格" },
      ],
    },
    {
      label: "個人",
      items: [
        { href: "bookmark.html", label: "常用連結", desc: "常用外部連結" },
        { href: "portfolio.html", label: "持股試算", desc: "持股損益試算" },
      ],
    },
    {
      label: "當沖",
      items: [
        { href: "day-trade-calculator.html", label: "當沖計算機", desc: "當沖損益與成本試算" },
        { href: "xiaoge-strategy.html", label: "小哥策略", desc: "小哥當沖策略選股" },
      ],
    },
  ];

  // ---- pure helpers (unit tested) -----------------------------------------

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalize(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, "");
  }

  function searchPages(query, nav, limit) {
    const q = normalize(query);
    if (!q) return [];
    const out = [];
    nav.forEach((g) =>
      g.items.forEach((it) => {
        const label = normalize(it.label);
        const desc = normalize(it.desc);
        const file = normalize(it.href);
        let score = 0;
        if (label === q) score = 100;
        else if (label.startsWith(q)) score = 80;
        else if (label.includes(q)) score = 60;
        else if (file.includes(q)) score = 40;
        else if (desc.includes(q)) score = 20;
        if (score)
          out.push({ score, href: it.href, label: it.label, desc: it.desc, group: g.label });
      }),
    );
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit || 5);
  }

  // stocks: object keyed by code => { name, type }
  function searchStocks(query, stocks, limit) {
    const q = normalize(query);
    if (!q || !stocks) return [];
    const out = [];
    for (const id of Object.keys(stocks)) {
      const info = stocks[id] || {};
      const code = id.toLowerCase();
      const name = normalize(info.name);
      let score = 0;
      if (code === q) score = 100;
      else if (code.startsWith(q)) score = 80;
      else if (name.startsWith(q)) score = 70;
      else if (name.includes(q)) score = 50;
      if (score) out.push({ score, id, name: info.name || "", type: info.type });
    }
    out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return out.slice(0, limit || 8);
  }

  function latestDate(manifest) {
    let best = "";
    ["twse", "tpex"].forEach((m) => {
      const arr = manifest && manifest[m] && manifest[m].daily_price;
      if (Array.isArray(arr)) arr.forEach((d) => { if (typeof d === "string" && d > best) best = d; });
    });
    return best || null;
  }

  function isStale(latestISO, todayISO, maxDays) {
    if (!latestISO) return false;
    const ms = Date.parse(todayISO + "T00:00:00Z") - Date.parse(latestISO + "T00:00:00Z");
    return ms / 86400000 > (maxDays == null ? 3 : maxDays);
  }

  const api = { NAV, searchPages, searchStocks, latestDate, isStale, mount: function () {} };

  // ---- DOM (browser only) ---------------------------------------------------

  if (typeof document !== "undefined") {
    let overlay = null;
    let stockCache = null;
    let stockError = false;
    let selected = 0;
    let items = [];
    let opener = null;

    const loadJSON = (url) =>
      global.UIData
        ? global.UIData.loadJSON(url)
        : fetch(url).then((r) => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          });

    function currentPage() {
      const p = location.pathname;
      return p.substring(p.lastIndexOf("/") + 1) || "index.html";
    }

    function todayTaipei() {
      return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
    }

    function headerHtml(current) {
      const groups = NAV.map((g, i) => {
        const active = g.items.some((it) => it.href === current);
        return `<button class="nav-group-btn${active ? " active" : ""}" type="button" aria-expanded="false" aria-controls="mega-${i}">${esc(g.label)}</button>`;
      }).join("");
      const panels = NAV.map(
        (g, i) =>
          `<div class="mega" id="mega-${i}" hidden><div class="mega-grid">${g.items
            .map(
              (it) =>
                `<a class="mega-item${it.href === current ? " active" : ""}" href="${it.href}"${it.href === current ? ' aria-current="page"' : ""}><b>${esc(it.label)}</b><span>${esc(it.desc)}</span></a>`,
            )
            .join("")}</div></div>`,
      ).join("");
      // Open the active group; if none is active, open the first so links are reachable.
      const activeIdx = Math.max(0, NAV.findIndex((g) => g.items.some((it) => it.href === current)));
      const drawer = NAV.map(
        (g, gi) =>
          `<details${gi === activeIdx ? " open" : ""}><summary>${esc(g.label)}</summary>${g.items
            .map((it) => `<a href="${it.href}"${it.href === current ? ' class="active"' : ""}>${esc(it.label)}</a>`)
            .join("")}</details>`,
      ).join("");
      return `<a class="skip-link" href="#main">跳到主要內容</a>
        <div class="site-header-inner">
          <a class="brand" href="index.html"><img src="assets/logo.png" alt="" onerror="this.remove()"><span>Market Observer</span></a>
          <nav class="site-nav" aria-label="主選單">${groups}</nav>
          <button class="search-btn" type="button" aria-label="搜尋" data-open-search><span class="search-icon" aria-hidden="true">🔍</span><span class="search-text">搜尋代號或頁面</span><kbd>⌘K</kbd></button>
          <button class="nav-toggle" type="button" aria-label="選單" aria-expanded="false" aria-controls="site-drawer">☰</button>
        </div>
        ${panels}
        <div class="drawer" id="site-drawer" hidden>${drawer}</div>`;
    }

    function closeMenus(host, returnFocus) {
      host.querySelectorAll(".nav-group-btn").forEach((b) => {
        if (b.getAttribute("aria-expanded") === "true") {
          b.setAttribute("aria-expanded", "false");
          if (returnFocus) b.focus();
        }
      });
      host.querySelectorAll(".mega").forEach((m) => { m.hidden = true; });
    }

    function bindMenus(host) {
      host.querySelectorAll(".nav-group-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const wasOpen = btn.getAttribute("aria-expanded") === "true";
          closeMenus(host, false);
          if (!wasOpen) {
            btn.setAttribute("aria-expanded", "true");
            document.getElementById(btn.getAttribute("aria-controls")).hidden = false;
          }
        });
      });
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".nav-group-btn") && !e.target.closest(".mega")) closeMenus(host, false);
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeMenus(host, true);
      });
    }

    function bindDrawer(host) {
      const toggle = host.querySelector(".nav-toggle");
      const drawer = host.querySelector("#site-drawer");
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        drawer.hidden = open;
      });
      // Close the drawer if the viewport grows to desktop width while open.
      if (typeof global.matchMedia === "function") {
        const mq = global.matchMedia("(min-width: 768px)");
        const onChange = (e) => {
          if (e.matches) {
            drawer.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
          }
        };
        if (mq.addEventListener) mq.addEventListener("change", onChange);
        else if (mq.addListener) mq.addListener(onChange);
      }
    }

    // ---- search -------------------------------------------------------------

    function ensureStocks() {
      if (stockCache || stockError) return Promise.resolve();
      return loadJSON("data/stock_info.json")
        .then((d) => { stockCache = d; })
        .catch(() => { stockError = true; });
    }

    function itemHtml(i, a, b, c) {
      return `<a class="search-item" role="option" id="sr-${i}" data-index="${i}" href="${items[i].href}" aria-selected="false"><span class="si-main">${a}</span><span class="si-sub">${b}</span><span class="si-tag">${c}</span></a>`;
    }

    function highlight() {
      overlay.querySelectorAll(".search-item").forEach((el) => {
        const on = Number(el.dataset.index) === selected;
        el.setAttribute("aria-selected", String(on));
        if (on) el.scrollIntoView({ block: "nearest" });
      });
    }

    function renderResults(q) {
      const box = overlay.querySelector("#search-results");
      items = [];
      if (!q.trim()) {
        box.innerHTML = '<div class="search-hint">輸入股票代號、名稱或頁面名稱</div>';
        return;
      }
      let html = "";
      const stocks = searchStocks(q, stockCache, 8);
      const pages = searchPages(q, NAV, 5);
      if (stocks.length) {
        html += '<div class="search-group">個股</div>';
        stocks.forEach((s) => {
          items.push({ href: "stock.html?id=" + encodeURIComponent(s.id) });
          const tag = s.type === "tpex" ? "上櫃" : s.type === "twse" ? "上市" : "";
          html += itemHtml(items.length - 1, esc(s.id), esc(s.name), tag);
        });
      }
      if (pages.length) {
        html += '<div class="search-group">頁面</div>';
        pages.forEach((p) => {
          items.push({ href: p.href });
          html += itemHtml(items.length - 1, esc(p.label), esc(p.desc), esc(p.group));
        });
      }
      if (!items.length) html = '<div class="search-hint">找不到符合的結果</div>';
      if (stockError) html += '<div class="search-hint">股票清單載入失敗，僅能搜尋頁面</div>';
      selected = 0;
      box.innerHTML = html;
      highlight();
    }

    function move(delta) {
      if (!items.length) return;
      selected = (selected + delta + items.length) % items.length;
      highlight();
    }

    function buildOverlay() {
      overlay = document.createElement("div");
      overlay.className = "search-overlay";
      overlay.hidden = true;
      overlay.innerHTML =
        '<div class="search-dialog" role="dialog" aria-modal="true" aria-label="搜尋">' +
        '<input id="search-input" type="text" autocomplete="off" placeholder="搜尋代號、股票名稱或頁面…" aria-controls="search-results">' +
        '<div id="search-results" class="search-results" role="listbox"></div></div>';
      document.body.appendChild(overlay);
      const input = overlay.querySelector("input");
      overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeSearch(); });
      input.addEventListener("input", () => renderResults(input.value));
      // Delegated on the overlay so Escape/Tab work even when focus has
      // dropped to a non-focusable part of the dialog.
      overlay.addEventListener("keydown", (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
        else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
        else if (e.key === "Enter") { e.preventDefault(); if (items[selected]) location.href = items[selected].href; }
        else if (e.key === "Tab") { e.preventDefault(); input.focus(); }
      });
      // Keep focus on the input when clicking inert parts of the dialog;
      // result links must still receive their click.
      overlay.querySelector(".search-dialog").addEventListener("mousedown", (e) => {
        if (e.target === input || e.target.closest("a.search-item")) return;
        e.preventDefault();
        input.focus();
      });
    }

    function openSearch() {
      if (!overlay) buildOverlay();
      opener = document.activeElement;
      overlay.hidden = false;
      const input = overlay.querySelector("input");
      input.value = "";
      renderResults("");
      input.focus();
      ensureStocks().then(() => renderResults(input.value));
    }

    function closeSearch() {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      if (opener && opener.focus) opener.focus();
    }

    function bindShortcuts() {
      document.addEventListener("keydown", (e) => {
        const t = e.target;
        const typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
        if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "k") {
          e.preventDefault();
          if (overlay && !overlay.hidden) closeSearch();
          else openSearch();
          return;
        }
        // Pages that already bind "/" to their own #stock-search keep it.
        if (e.key === "/" && !typing && !document.getElementById("stock-search")) {
          e.preventDefault();
          openSearch();
        }
      });
    }

    // ---- footer + stale banner ----------------------------------------------

    function mountFooter() {
      let footer = document.getElementById("site-footer");
      if (!footer) {
        footer = document.createElement("footer");
        footer.id = "site-footer";
        document.body.appendChild(footer);
      }
      if (footer.dataset.mounted) return;
      footer.dataset.mounted = "1";
      footer.innerHTML = `<div class="footer-inner">
          <div><span class="footer-title">Market Observer 市場觀測站</span></div>
          <div class="footer-asof">資料日期載入中…</div>
          <div class="footer-disclaimer">本站資訊僅供參考，不構成任何投資建議，投資一定有風險，請謹慎評估並自行承擔投資決策之風險。<br>資料來源：臺灣證券交易所（TWSE）、證券櫃買中心（TPEx）公開資訊。</div>
          <div>© ${new Date().getFullYear()} Market Observer · <a href="https://github.com/meitzuen/observe.market">GitHub</a></div>
        </div>`;
    }

    function setAsOf(d) {
      const el = document.querySelector(".footer-asof");
      if (el) el.textContent = d ? "資料截至 " + d : "資料日期暫時無法取得";
    }

    function showStale(d) {
      try {
        if (sessionStorage.getItem("stale-dismissed") === d) return;
      } catch (e) { /* storage blocked: show the banner anyway */ }
      const host = document.getElementById("site-header");
      if (!host || document.querySelector("[data-stale-banner]")) return;
      const el = document.createElement("div");
      el.className = "banner banner-warn";
      el.setAttribute("data-stale-banner", "");
      el.setAttribute("role", "status");
      el.innerHTML = `<span>資料最後更新於 ${esc(d)}，可能因休市或更新延遲而非最新資料。</span><button type="button" class="banner-close" aria-label="關閉">✕</button>`;
      host.insertAdjacentElement("afterend", el);
      el.querySelector("button").addEventListener("click", () => {
        el.remove();
        try { sessionStorage.setItem("stale-dismissed", d); } catch (e) { /* ignore */ }
      });
    }

    function loadManifestInfo() {
      return loadJSON("data/manifest.json")
        .then((m) => {
          const d = latestDate(m);
          setAsOf(d);
          if (isStale(d, todayTaipei())) showStale(d);
        })
        .catch(() => setAsOf(null));
    }

    // ---- mount ------------------------------------------------------------------

    function mount() {
      const host = document.getElementById("site-header");
      if (host && !host.dataset.mounted) {
        host.dataset.mounted = "1";
        host.innerHTML = headerHtml(currentPage());
        const main = document.querySelector("#main, .container, .page, main");
        if (main && !main.id) main.id = "main";
        bindMenus(host);
        bindDrawer(host);
        host.querySelector("[data-open-search]").addEventListener("click", openSearch);
        bindShortcuts();
      }
      mountFooter();
      loadManifestInfo();
    }

    api.mount = mount;

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Shell = api;
})(typeof window !== "undefined" ? window : globalThis);
