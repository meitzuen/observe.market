(function (root) {
  "use strict";

  const PERCENT_STEPS = [0.5, 1, 2, 3, 4];
  const EPS = 1e-9;
  // Prices are not adjusted for ex-rights/splits, so a single-day move beyond
  // this is flagged (same threshold as src/backtest.py).
  const SPLIT_PCT = 0.105;

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

  // Index of the first later close at or above target, or null.
  function indexToReach(rows, startIdx, target) {
    const tol = EPS * Math.max(1, Math.abs(target));
    for (let j = startIdx + 1; j < rows.length; j++) {
      if (rows[j].close >= target - tol) return j;
    }
    return null;
  }

  // Single-day moves beyond SPLIT_PCT after the start day: likely ex-rights or
  // a split that the raw prices do not reflect.
  function findAnomalies(rows, startIdx) {
    const out = [];
    for (let i = startIdx + 1; i < rows.length; i++) {
      const change = rows[i].close / rows[i - 1].close - 1;
      if (Math.abs(change) > SPLIT_PCT) {
        out.push({
          idx: i,
          date: rows[i].date,
          prevClose: rows[i - 1].close,
          close: rows[i].close,
          change,
        });
      }
    }
    return out;
  }

  function calendarDays(a, b) {
    return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  }

  // Milestone for one target: days, plus when/where it was hit. suspect = hit
  // after an anomaly, or never hit while an anomaly sits in the way.
  function milestone(rows, startIdx, label, target, firstAnomalyIdx) {
    const hit = indexToReach(rows, startIdx, target);
    const afterAnomaly = firstAnomalyIdx != null;
    if (hit == null) {
      return { label, target, days: null, suspect: afterAnomaly };
    }
    return {
      label,
      target,
      days: hit - startIdx,
      date: rows[hit].date,
      close: rows[hit].close,
      calendarDays: calendarDays(rows[startIdx].date, rows[hit].date),
      suspect: afterAnomaly && hit >= firstAnomalyIdx,
    };
  }

  // opts.startDate pins the start day; otherwise it is auto-detected. Returns
  // null when there is no rise (auto) or the date is not a trading day (pinned).
  function analyzeSurge(history, opts) {
    const rows = history
      .filter((r) => Number.isFinite(r.close) && r.close > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const pinned = opts && opts.startDate;
    let startIdx, peakIdx;
    if (pinned) {
      startIdx = rows.findIndex((r) => r.date === pinned);
      if (startIdx < 0) return null;
      peakIdx = startIdx;
      for (let i = startIdx + 1; i < rows.length; i++) {
        if (rows[i].close > rows[peakIdx].close) peakIdx = i;
      }
    } else {
      const found = findSurgeStart(rows);
      if (!found) return null;
      ({ startIdx, peakIdx } = found);
    }
    const startClose = rows[startIdx].close;

    const anomalies = findAnomalies(rows, startIdx);
    const firstAnomalyIdx = anomalies.length ? anomalies[0].idx : null;

    const percent = PERCENT_STEPS.map((p) =>
      milestone(
        rows,
        startIdx,
        "+" + Math.round(p * 100) + "%",
        startClose * (1 + p),
        firstAnomalyIdx,
      ),
    );
    const points = pointTiers(startClose).map((pt) =>
      milestone(rows, startIdx, "+" + pt + "元", startClose + pt, firstAnomalyIdx),
    );

    return {
      startIdx,
      startDate: rows[startIdx].date,
      startClose,
      peakDate: rows[peakIdx].date,
      peakClose: rows[peakIdx].close,
      // The run-up may have begun before our data does.
      startAtDataEdge: startIdx === 0,
      anomalies,
      percent,
      points,
    };
  }

  const api = {
    findSurgeStart,
    pointTiers,
    daysToReach,
    findAnomalies,
    analyzeSurge,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Surge = api;
})(typeof window !== "undefined" ? window : globalThis);
