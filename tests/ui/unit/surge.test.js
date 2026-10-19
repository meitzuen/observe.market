const test = require("node:test");
const assert = require("node:assert/strict");
const {
  findSurgeStart,
  pointTiers,
  daysToReach,
  analyzeSurge,
} = require("../../../docs/assets/surge.js");

const rows = (closes) =>
  closes.map((close, i) => ({ date: "d" + String(i).padStart(3, "0"), close }));

test("findSurgeStart: lowest close before the highest close", () => {
  // peak 20 at idx 4, lowest before it is 8 at idx 1
  const r = findSurgeStart(rows([10, 8, 9, 15, 20, 5, 6]));
  assert.equal(r.peakIdx, 4);
  assert.equal(r.startIdx, 1);
});

test("findSurgeStart: a lower close after the peak is ignored", () => {
  const r = findSurgeStart(rows([10, 12, 30, 2]));
  assert.equal(r.peakIdx, 2);
  assert.equal(r.startIdx, 0);
});

test("findSurgeStart: ties on the low pick the latest day, ties on the peak pick the first", () => {
  const r = findSurgeStart(rows([5, 9, 5, 9, 20, 20]));
  assert.equal(r.startIdx, 2);
  assert.equal(r.peakIdx, 4);
});

test("findSurgeStart: no rise (peak on the first day) returns null", () => {
  assert.equal(findSurgeStart(rows([30, 20, 10])), null);
  assert.equal(findSurgeStart([]), null);
});

test("pointTiers: 100+ uses 100/200/300, below 100 uses 25/50/75/100", () => {
  assert.deepEqual(pointTiers(100), [100, 200, 300]);
  assert.deepEqual(pointTiers(954), [100, 200, 300]);
  assert.deepEqual(pointTiers(99.9), [25, 50, 75, 100]);
  assert.deepEqual(pointTiers(7.4), [25, 50, 75, 100]);
});

test("daysToReach: counts trading days from the start day, first close at or above target", () => {
  const r = rows([10, 11, 14, 15, 21]);
  assert.equal(daysToReach(r, 0, 15), 3); // idx 3
  assert.equal(daysToReach(r, 0, 20), 4);
  assert.equal(daysToReach(r, 0, 21.5), null);
});

test("daysToReach: only looks after the start day", () => {
  const r = rows([50, 10, 12, 20]);
  assert.equal(daysToReach(r, 1, 20), 2);
});

test("daysToReach: tolerates floating point (10 * 1.5 === 15)", () => {
  const r = rows([10, 15.000000000001]);
  assert.equal(daysToReach(r, 0, 10 * 1.5), 1);
  const r2 = rows([0.1, 0.1 * 3]);
  assert.equal(daysToReach(r2, 0, 0.1 + 0.2), 1);
});

test("analyzeSurge: percent milestones and low-price point tiers", () => {
  // start close 10 -> +50% = 15, +100% = 20, +200% = 30
  const r = rows([12, 10, 11, 15, 20, 35, 40, 8]);
  const a = analyzeSurge(r);
  assert.equal(a.startIdx, 1);
  assert.equal(a.startClose, 10);
  assert.equal(a.startDate, "d001");
  assert.equal(a.startAtDataEdge, false);
  assert.deepEqual(
    a.percent.map((m) => [m.label, m.days]),
    [
      ["+50%", 2],
      ["+100%", 3],
      ["+200%", 4],
      ["+300%", 5],
      ["+400%", null],
    ],
  );
  // start < 100 -> 25/50/75/100 points: targets 35, 60, 85, 110
  assert.deepEqual(
    a.points.map((m) => [m.label, m.days]),
    [
      ["+25元", 4],
      ["+50元", null],
      ["+75元", null],
      ["+100元", null],
    ],
  );
});

test("analyzeSurge: high-price stock uses 100/200/300 points", () => {
  const r = rows([900, 954, 1100, 1250, 1500]);
  const a = analyzeSurge(r);
  assert.equal(a.startClose, 900);
  assert.deepEqual(
    a.points.map((m) => [m.label, m.days]),
    [
      ["+100元", 2], // 1000 <= 1100 (day 2)
      ["+200元", 2], // 1100 <= 1100 (day 2)
      ["+300元", 3], // 1200 <= 1250 (day 3)
    ],
  );
});

test("analyzeSurge: flags a start day on the first row of data", () => {
  const a = analyzeSurge(rows([5, 6, 9]));
  assert.equal(a.startIdx, 0);
  assert.equal(a.startAtDataEdge, true);
});

test("analyzeSurge: skips non-positive or missing closes and sorts by date", () => {
  const a = analyzeSurge([
    { date: "2026-01-03", close: 12 },
    { date: "2026-01-01", close: 10 },
    { date: "2026-01-02", close: null },
    { date: "2026-01-04", close: 0 },
    { date: "2026-01-05", close: 15 },
  ]);
  assert.equal(a.startDate, "2026-01-01");
  assert.equal(a.percent[0].days, 2); // 10 -> 15 on the 3rd valid row
});

test("analyzeSurge: returns null when the stock never rose", () => {
  assert.equal(analyzeSurge(rows([30, 20, 10])), null);
  assert.equal(analyzeSurge([]), null);
});

test("analyzeSurge: startDate pins the start day and reports hit details", () => {
  const r = rows([90, 100, 105, 110, 120, 130, 140, 150]);
  const a = analyzeSurge(r, { startDate: "d001" });
  assert.equal(a.startIdx, 1);
  assert.equal(a.startClose, 100);
  const m = a.percent[0]; // +50% = 150 at idx 7
  assert.equal(m.days, 6);
  assert.equal(m.date, "d007");
  assert.equal(m.close, 150);
  assert.equal(m.suspect, false);
  assert.equal(analyzeSurge(r, { startDate: "nope" }), null);
});

test("analyzeSurge: flags milestones after a >10.5% single-day move", () => {
  // +50% hit at idx 6, then a split-like -95%; +100% never reached
  const a = analyzeSurge(rows([100, 105, 110, 120, 130, 140, 150, 7.5, 8]), {
    startDate: "d000",
  });
  assert.equal(a.anomalies.length, 1);
  assert.equal(a.anomalies[0].date, "d007");
  assert.equal(a.percent[0].days, 6);
  assert.equal(a.percent[0].suspect, false); // hit before the anomaly
  assert.equal(a.percent[1].days, null);
  assert.equal(a.percent[1].suspect, true); // never hit, anomaly in the way
});
