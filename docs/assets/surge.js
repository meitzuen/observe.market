(function (root) {
  "use strict";

  const PERCENT_STEPS = [0.5, 1, 2, 3, 4];
  const EPS = 1e-9;

  // Surge start = the lowest close before the highest close. Ties on the low
  // take the latest day (closest to the run-up); ties on the peak take the
  // first day. Returns null when the stock never rose above its first close.
  function findSurgeStart(rows) {
    if (!rows.length) return null;
    let peakIdx = 0;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].close > rows[peakIdx].close) peakIdx = i;
    }
    if (peakIdx === 0) return null;
    let startIdx = 0;
    for (let i = 1; i <= peakIdx; i++) {
      if (rows[i].close <= rows[startIdx].close) startIdx = i;
    }
    return { startIdx, peakIdx };
  }

  // Point (NT$) milestones: 100+ closes use 100/200/300, below 100 use
  // 25/50/75/100.
  function pointTiers(startClose) {
    return startClose >= 100 ? [100, 200, 300] : [25, 50, 75, 100];
  }

  // Trading days from the start row to the first later close at or above
  // target, or null if it never got there.
  function daysToReach(rows, startIdx, target) {
    const tol = EPS * Math.max(1, Math.abs(target));
    for (let j = startIdx + 1; j < rows.length; j++) {
      if (rows[j].close >= target - tol) return j - startIdx;
    }
    return null;
  }

  function analyzeSurge(history) {
    const rows = history
      .filter((r) => Number.isFinite(r.close) && r.close > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const found = findSurgeStart(rows);
    if (!found) return null;
    const { startIdx, peakIdx } = found;
    const startClose = rows[startIdx].close;

    const percent = PERCENT_STEPS.map((p) => ({
      label: "+" + Math.round(p * 100) + "%",
      days: daysToReach(rows, startIdx, startClose * (1 + p)),
    }));
    const points = pointTiers(startClose).map((pt) => ({
      label: "+" + pt + "元",
      days: daysToReach(rows, startIdx, startClose + pt),
    }));

    return {
      startIdx,
      startDate: rows[startIdx].date,
      startClose,
      peakDate: rows[peakIdx].date,
      peakClose: rows[peakIdx].close,
      // The run-up may have begun before our data does.
      startAtDataEdge: startIdx === 0,
      percent,
      points,
    };
  }

  const api = { findSurgeStart, pointTiers, daysToReach, analyzeSurge };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Surge = api;
})(typeof window !== "undefined" ? window : globalThis);
