/* ==========================================================================
   Nerd Grid (Wireframe HUD) — shared behavior
   Theme toggle, nav-dropdown interaction, and Chart.js color tokens shared
   across every page in docs/. Pairs with assets/nerd-grid.css.
   ========================================================================== */

(function (global) {
  "use strict";

  const STORAGE_KEY = "theme";
  const THEME_EVENT = "nerdgrid:themechange";

  const CHART_PALETTE = {
    dark: {
      seriesA: "rgba(0, 190, 255, 0.85)", // twse / primary series
      seriesB: "rgba(0, 220, 180, 0.75)", // tpex / secondary series
      gridH: "rgba(0, 180, 255, 0.08)",
      gridV: "rgba(0, 180, 255, 0.05)",
      tick: "rgba(0, 190, 255, 0.5)",
      // TW market convention: red = up, green = down
      up: "rgba(255, 80, 80, 0.85)",
      down: "rgba(0, 220, 180, 0.85)",
      tooltipBg: "rgba(0, 8, 16, 0.92)",
      tooltipBorder: "rgba(0, 180, 255, 0.25)",
      tooltipText: "rgba(0, 190, 255, 0.9)",
    },
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
    return document.documentElement.getAttribute("data-theme") === "light"
      ? "light"
      : "dark";
  }

  function chartColors(theme) {
    return CHART_PALETTE[theme || currentTheme()];
  }

  function initThemeToggle(buttonId) {
    const btn = document.getElementById(buttonId || "theme-toggle");
    const saved = localStorage.getItem(STORAGE_KEY) || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    if (btn) btn.textContent = saved === "light" ? "☀️" : "🌙";

    if (!btn) return;
    btn.addEventListener("click", () => {
      const next = currentTheme() === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(STORAGE_KEY, next);
      btn.textContent = next === "light" ? "☀️" : "🌙";
      document.dispatchEvent(
        new CustomEvent(THEME_EVENT, { detail: { theme: next } }),
      );
    });
  }

  function onThemeChange(handler) {
    document.addEventListener(THEME_EVENT, (e) => handler(e.detail.theme));
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

  global.NerdGrid = {
    initThemeToggle,
    onThemeChange,
    initNavDropdowns,
    currentTheme,
    chartColors,
  };
})(window);
