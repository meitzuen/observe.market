/* ==========================================================================
   Nerd Grid (Wireframe HUD) — shared behavior
   Theme toggle, nav-dropdown interaction, and Chart.js color tokens shared
   across every page in docs/. Pairs with assets/nerd-grid.css.
   ========================================================================== */

(function (global) {
  "use strict";

  // Dark mode has been removed — the app is light-only now.
  const THEME_EVENT = "nerdgrid:themechange";

  const CHART_PALETTE = {
    light: {
      seriesA: "rgba(0, 75, 150, 0.9)",
      seriesB: "rgba(0, 120, 100, 0.95)",
      gridH: "rgba(0, 60, 130, 0.16)",
      gridV: "rgba(0, 60, 130, 0.09)",
      tick: "rgba(0, 50, 110, 0.8)",
      // TW market convention: red = up, green = down
      up: "rgba(195, 30, 30, 1)",
      down: "rgba(0, 120, 100, 1)",
      tooltipBg: "rgba(255, 255, 255, 0.98)",
      tooltipBorder: "rgba(0, 60, 130, 0.4)",
      tooltipText: "rgba(0, 35, 85, 1)",
    },
  };

  function currentTheme() {
    return "light";
  }

  function chartColors(theme) {
    return CHART_PALETTE[theme || currentTheme()];
  }

  // No-op kept so existing `NerdGrid.initThemeToggle();` call sites across
  // pages don't need to change now that there's no toggle button or theme
  // to switch to.
  function initThemeToggle() {}

  function onThemeChange(handler) {
    document.addEventListener(THEME_EVENT, (e) => handler(e.detail.theme));
  }

  // Single source of truth for the site-wide nav. Add/rename/move a page
  // here once and every page picks it up — no more hand-editing 17 files.
  const NAV = [
    {
      label: "市場",
      items: [
        { href: "twse.html", label: "上市" },
        { href: "tpex.html", label: "上櫃" },
        { href: "index.html", label: "全部" },
      ],
    },
    {
      label: "策略",
      items: [
        { href: "punish.html", label: "處置股票" },
        { href: "volume-candle.html", label: "爆量長紅黑K" },
        { href: "gap.html", label: "跳空漲跌" },
        { href: "wantgoo.html", label: "基本面" },
        { href: "volatility.html", label: "區間波動率" },
        { href: "vcp.html", label: "VCP選股" },
      ],
    },
    {
      label: "權證",
      items: [
        { href: "premium-warrant.html", label: "精選權證" },
        { href: "warrant-filter.html", label: "權證篩選" },
      ],
    },
    {
      label: "選股",
      items: [
        { href: "screener.html", label: "股票篩選" },
        { href: "watchlist.html", label: "精選類股" },
      ],
    },
    {
      label: "個人",
      items: [
        { href: "bookmark.html", label: "常用連結" },
        { href: "portfolio.html", label: "持股試算" },
      ],
    },
    {
      label: "當沖",
      items: [
        { href: "day-trade-calculator.html", label: "當沖計算機" },
        { href: "xiaoge-strategy.html", label: "小哥策略" },
      ],
    },
  ];

  function currentPageFile() {
    const path = location.pathname;
    const file = path.substring(path.lastIndexOf("/") + 1);
    return file || "index.html";
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Renders the nav into #<containerId> (default "nav-bar") from NAV above,
  // marking whichever item matches the current file as active, then wires
  // up the dropdown interactions. Call this instead of hand-writing the
  // <nav> markup and instead of initNavDropdowns() directly.
  function initNav(containerId) {
    const container = document.getElementById(containerId || "nav-bar");
    if (!container) return;
    const current = currentPageFile();

    container.innerHTML = NAV.map((group) => {
      const groupActive = group.items.some((item) => item.href === current);
      const itemsHtml = group.items
        .map((item) => {
          const cls =
            "nav-dropdown-item" + (item.href === current ? " active" : "");
          return `<a href="${item.href}" class="${cls}">${escHtml(item.label)}</a>`;
        })
        .join("");
      const btnCls = "nav-link nav-dropdown-btn" + (groupActive ? " active" : "");
      return `<div class="nav-dropdown"><button class="${btnCls}">${escHtml(group.label)}</button><div class="nav-dropdown-menu">${itemsHtml}</div></div>`;
    }).join("");

    initNavDropdowns();
  }

  function initNavDropdowns() {
    // Click-to-toggle (not hover) so this works identically with mouse,
    // trackpad, and touch. Menus use position:fixed, so the top/left
    // offset still has to be computed in JS on open.
    const dropdowns = document.querySelectorAll(".nav-dropdown");

    function closeAllMenus() {
      dropdowns.forEach((dd) => {
        dd.querySelector(".nav-dropdown-menu").style.display = "none";
      });
    }

    dropdowns.forEach((dd) => {
      const btn = dd.querySelector(".nav-dropdown-btn");
      const menu = dd.querySelector(".nav-dropdown-menu");

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = menu.style.display === "flex";
        closeAllMenus();
        if (!isOpen) {
          const r = dd.getBoundingClientRect();
          menu.style.top = r.bottom + "px";
          menu.style.left = r.left + "px";
          menu.style.display = "flex";
        }
      });
    });

    document.addEventListener("click", closeAllMenus);
  }

  // Renders the shared site footer (brand, disclaimer, data-source credit,
  // copyright) and appends it to <body>. Self-mounting — any page that
  // loads this script gets the footer with no HTML edit needed, the same
  // way every page already gets the shared nav without hand-written markup.
  function renderFooter() {
    if (document.getElementById("site-footer")) return;
    const year = new Date().getFullYear();
    const footer = document.createElement("footer");
    footer.id = "site-footer";
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-brand">
          <span class="footer-title">Market Observer 市場觀測站</span>
          <span class="footer-tagline">台股即時數據觀測平台</span>
        </div>
        <div class="footer-disclaimer">
          本站資訊僅供參考，不構成任何投資建議，投資一定有風險，請謹慎評估並自行承擔投資決策之風險。<br />
          資料來源：臺灣證券交易所（TWSE）、證券櫃買中心（TPEx）公開資訊。
        </div>
        <div class="footer-copyright">© ${year} Market Observer. All rights reserved.</div>
      </div>
    `;
    document.body.appendChild(footer);
  }

  function initFooter() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", renderFooter);
    } else {
      renderFooter();
    }
  }

  // Auto-run on script load so every page gets the footer for free.
  initFooter();

  global.NerdGrid = {
    initThemeToggle,
    onThemeChange,
    initNavDropdowns,
    initNav,
    initFooter,
    currentTheme,
    chartColors,
  };
})(window);
