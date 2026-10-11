(function (global) {
  "use strict";

  // Fallbacks match the :root tokens in ui.css, used if CSS vars are unreadable.
  const FALLBACK = {
    seriesA: "#3b5bdb",
    seriesB: "#0b7285",
    seriesC: "#e67700",
    gridH: "rgba(28, 35, 51, 0.08)",
    gridV: "rgba(28, 35, 51, 0.04)",
    tick: "#5b6478",
    up: "#c0262d",
    down: "#16794a",
    tooltipBg: "#ffffff",
    tooltipBorder: "#e3e6ee",
    tooltipText: "#1c2333",
  };

  function cssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  // Resolves chart colours from the design tokens in ui.css. Reads them at
  // call time so a future dark theme works.
  function colors() {
    return {
      seriesA: cssVar("--accent", FALLBACK.seriesA),
      seriesB: cssVar("--series-2", FALLBACK.seriesB),
      seriesC: cssVar("--series-3", FALLBACK.seriesC),
      gridH: FALLBACK.gridH,
      gridV: FALLBACK.gridV,
      tick: cssVar("--text-muted", FALLBACK.tick),
      up: cssVar("--up", FALLBACK.up),
      down: cssVar("--down", FALLBACK.down),
      tooltipBg: cssVar("--surface", FALLBACK.tooltipBg),
      tooltipBorder: cssVar("--border", FALLBACK.tooltipBorder),
      tooltipText: cssVar("--text", FALLBACK.tooltipText),
    };
  }

  global.ChartTheme = { colors };
})(window);
