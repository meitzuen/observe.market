const test = require("node:test");
const assert = require("node:assert/strict");
const { toHalfWidth, extractStocks, mergeResults } = require("../../../docs/assets/stock-ocr.js");

const stocks = {
  2330: { name: "台積電", type: "twse" },
  2317: { name: "鴻海", type: "twse" },
  2454: { name: "聯發科", type: "twse" },
  "00835B": { name: "第一金科技債10+", type: "tpex" },
  "0050": { name: "元大台灣50", type: "twse" },
  6488: { name: "環球晶", type: "tpex" },
  1234: { name: "黑松", type: "twse" },
};

const pick = (rows) => rows.map((r) => `${r.code}:${r.via}`);

test("toHalfWidth converts full-width digits and spaces", () => {
  assert.equal(toHalfWidth("２３３０　台積電"), "2330 台積電");
});

test("code and name on one line confirm each other", () => {
  const rows = extractStocks("2330 台積電 1,050.00 +1.45%\n2454 聯發科 1200", stocks);
  assert.deepEqual(pick(rows), ["2330:both", "2454:both"]);
  assert.deepEqual(rows[0], { code: "2330", name: "台積電", market: "上市", via: "both" });
});

test("name alone, with OCR spaces between characters", () => {
  assert.deepEqual(pick(extractStocks("環 球 晶   512 ▲3", stocks)), ["6488:name"]);
});

test("code alone is reported as low confidence", () => {
  assert.deepEqual(pick(extractStocks("代號 2317", stocks)), ["2317:code"]);
});

test("prices, thousands groups, percents, dates and times are not codes", () => {
  assert.deepEqual(extractStocks("1234.50  2,330  2330%  12345  2330/11/15  12:1234", stocks), []);
});

test("market indices in the stock list are not reported", () => {
  const withIndex = { ...stocks, TAIEX: { name: "加權指數", type: "twse" } };
  assert.deepEqual(extractStocks("加權指數 23,456", withIndex), []);
});

test("codes with a trailing letter and names containing digits", () => {
  const rows = extractStocks("00835B 第一金科技債10+\n0050 元大台灣50", stocks);
  assert.deepEqual(pick(rows), ["00835B:both", "0050:both"]);
  assert.equal(rows[0].market, "上櫃");
});

test("one wrong character in a 3+ char name is a fuzzy match", () => {
  assert.deepEqual(pick(extractStocks("聯發料 1200", stocks)), ["2454:fuzzy"]);
  // 2-char names are too short to match fuzzily.
  assert.deepEqual(extractStocks("鴻诲", stocks), []);
});

test("unknown codes are ignored and duplicates collapse to the best match", () => {
  const rows = extractStocks("9999 不存在\n2330\n台積電\n2330 台積電", stocks);
  assert.deepEqual(pick(rows), ["2330:both"]);
});

test("mergeResults keeps first-seen order and upgrades confidence", () => {
  const a = extractStocks("2317\n2330 台積電", stocks);
  const b = extractStocks("鴻海 2317\n環球晶", stocks);
  assert.deepEqual(pick(mergeResults([a, b])), ["2317:both", "2330:both", "6488:name"]);
});
