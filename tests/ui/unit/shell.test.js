const test = require("node:test");
const assert = require("node:assert/strict");
const Shell = require("../../../docs/assets/shell.js");

const stocks = {
  "2330": { name: "台積電", type: "twse" },
  "2454": { name: "聯發科", type: "twse" },
  "00835B": { name: "第一金科技債10+", type: "tpex" },
  "6488": { name: "環球晶", type: "tpex" },
};

test("NAV has 6 groups and 17 pages", () => {
  assert.equal(Shell.NAV.length, 6);
  assert.equal(Shell.NAV.reduce((n, g) => n + g.items.length, 0), 17);
});

test("searchStocks: exact code ranks first", () => {
  const r = Shell.searchStocks("2330", stocks);
  assert.equal(r[0].id, "2330");
});

test("searchStocks: matches Chinese name substring", () => {
  const r = Shell.searchStocks("聯發", stocks);
  assert.deepEqual(r.map((s) => s.id), ["2454"]);
});

test("searchStocks: lowercase input matches letter-suffixed codes", () => {
  const r = Shell.searchStocks("00835b", stocks);
  assert.equal(r[0].id, "00835B");
});

test("searchStocks: regex metacharacters and markup do not throw or match", () => {
  for (const q of [".*", "(", "\\", "[a-", "<img src=x onerror=1>", "'; drop"]) {
    assert.deepEqual(Shell.searchStocks(q, stocks), [], `query ${q}`);
  }
});

test("searchStocks: empty query or missing data returns []", () => {
  assert.deepEqual(Shell.searchStocks("", stocks), []);
  assert.deepEqual(Shell.searchStocks("2330", null), []);
});

test("searchPages: matches label, then description", () => {
  assert.equal(Shell.searchPages("跳空", Shell.NAV)[0].href, "gap.html");
  assert.ok(Shell.searchPages("VCP", Shell.NAV).some((p) => p.href === "vcp.html"));
});

test("searchPages: hostile text returns []", () => {
  assert.deepEqual(Shell.searchPages("<script>", Shell.NAV), []);
});

test("latestDate picks the newest across markets (arrays are newest-first)", () => {
  const m = {
    twse: { daily_price: ["2026-10-08", "2026-10-07"] },
    tpex: { daily_price: ["2026-10-09", "2026-10-08"] },
  };
  assert.equal(Shell.latestDate(m), "2026-10-09");
});

test("latestDate tolerates missing or malformed manifest", () => {
  assert.equal(Shell.latestDate(null), null);
  assert.equal(Shell.latestDate({}), null);
  assert.equal(Shell.latestDate({ twse: { daily_price: "nope" } }), null);
});

test("isStale: more than 3 calendar days is stale, exactly 3 is not", () => {
  assert.equal(Shell.isStale("2026-10-06", "2026-10-09"), false);
  assert.equal(Shell.isStale("2026-10-05", "2026-10-09"), true);
  assert.equal(Shell.isStale("2026-10-09", "2026-10-09"), false);
});

test("isStale: unknown latest date is not reported as stale", () => {
  assert.equal(Shell.isStale(null, "2026-10-09"), false);
});
