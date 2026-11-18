const test = require("node:test");
const assert = require("node:assert");
const { escHtml, escAttr, fmtMoney, fmtPrice, fmtPct, plClass } = require("../../../docs/assets/fmt.js");

test("escHtml escapes markup characters", () => {
  assert.strictEqual(escHtml(`<a href="x">&</a>`), `&lt;a href="x"&gt;&amp;&lt;/a&gt;`);
});

test("escAttr escapes quotes", () => {
  assert.strictEqual(escAttr(`a"b'c`), "a&quot;b&#39;c");
});

test("number formatters handle nil/NaN", () => {
  for (const f of [fmtMoney, fmtPrice, fmtPct]) {
    assert.strictEqual(f(null), "—");
    assert.strictEqual(f(NaN), "—");
  }
});

test("number formatters format values", () => {
  assert.strictEqual(fmtMoney(1234567.4), "1,234,567");
  assert.strictEqual(fmtPrice(12.5), "12.50");
  assert.strictEqual(fmtPct(1.234), "+1.23%");
  assert.strictEqual(fmtPct(-0.5), "-0.50%");
  assert.strictEqual(fmtPct(0), "0.00%");
});

test("plClass picks colour class", () => {
  assert.strictEqual(plClass(1), "price-up");
  assert.strictEqual(plClass(-1), "price-down");
  assert.strictEqual(plClass(0), "price-neutral");
  assert.strictEqual(plClass(null), "price-neutral");
});
