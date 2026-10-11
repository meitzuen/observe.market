const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../../../docs/assets/ui-table.js");

const rows = [
  { id: "2330", name: "台積電", close: 1085, chg: 1.87 },
  { id: "2454", name: "聯發科", close: 1420, chg: -0.7 },
  { id: "1101", name: "台泥", close: null, chg: null },
  { id: "2317", name: "鴻海", close: 215.5, chg: 0 },
];

test("sortRows numeric ascending puts nulls last", () => {
  assert.deepEqual(T.sortRows(rows, "close", "asc").map((r) => r.id), ["2317", "2330", "2454", "1101"]);
});

test("sortRows numeric descending still puts nulls last", () => {
  assert.deepEqual(T.sortRows(rows, "close", "desc").map((r) => r.id), ["2454", "2330", "2317", "1101"]);
});

test("sortRows does not mutate its input", () => {
  const copy = rows.map((r) => r.id);
  T.sortRows(rows, "close", "desc");
  assert.deepEqual(rows.map((r) => r.id), copy);
});

test("sortRows on strings", () => {
  assert.deepEqual(T.sortRows(rows, "id", "asc").map((r) => r.id), ["1101", "2317", "2330", "2454"]);
});

test("filterRows matches any key, case-insensitive; empty text returns all", () => {
  assert.deepEqual(T.filterRows(rows, "23", ["id", "name"]).map((r) => r.id), ["2330", "2317"]);
  assert.equal(T.filterRows(rows, "", ["id"]).length, 4);
  assert.equal(T.filterRows(rows, "zzz", ["id", "name"]).length, 0);
});

test("filterRows treats regex metacharacters literally", () => {
  assert.equal(T.filterRows(rows, ".*", ["id", "name"]).length, 0);
  assert.equal(T.filterRows(rows, "(", ["id", "name"]).length, 0);
});

test("paginate clamps the page and handles empty input", () => {
  const r = T.paginate(rows, 99, 3);
  assert.equal(r.page, 2);
  assert.equal(r.pages, 2);
  assert.equal(r.rows.length, 1);
  const e = T.paginate([], 5, 10);
  assert.deepEqual({ page: e.page, pages: e.pages, total: e.total, n: e.rows.length }, { page: 1, pages: 1, total: 0, n: 0 });
});

test("fmtNum", () => {
  assert.equal(T.fmtNum(1234.5, 1), "1,234.5");
  assert.equal(T.fmtNum(1085), "1,085");
  assert.equal(T.fmtNum(null), "--");
  assert.equal(T.fmtNum(NaN), "--");
});

test("fmtPct shows sign, uses a true minus, and handles missing", () => {
  assert.equal(T.fmtPct(1.2399), "+1.24%");
  assert.equal(T.fmtPct(-0.31), "−0.31%");
  assert.equal(T.fmtPct(0), "0.00%");
  assert.equal(T.fmtPct(undefined), "--");
});

test("changeClass follows TW convention", () => {
  assert.equal(T.changeClass(1), "price-up");
  assert.equal(T.changeClass(-1), "price-down");
  assert.equal(T.changeClass(0), "");
  assert.equal(T.changeClass(null), "");
});
