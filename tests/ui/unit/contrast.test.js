const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(
  path.join(__dirname, "../../../docs/assets/ui.css"),
  "utf8",
);
const rootBlock = css.match(/:root\s*{([^}]*)}/)[1];

function token(name) {
  const m = rootBlock.match(
    new RegExp("--" + name + "\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;"),
  );
  assert.ok(m, `missing hex token --${name}`);
  return m[1];
}
function lum(hex) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const cases = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["text-muted", "surface", 4.5],
  ["text-muted", "bg", 4.5],
  ["accent", "surface", 4.5],
  ["accent", "accent-soft", 4.5],
  ["up", "surface", 4.5],
  ["up", "up-soft", 4.5],
  ["down", "surface", 4.5],
  ["down", "down-soft", 4.5],
  ["warn", "warn-soft", 4.5],
  ["text-subtle", "surface", 3.0],
];
for (const [fg, bg, min] of cases) {
  test(`--${fg} on --${bg} >= ${min}:1`, () => {
    const r = ratio(token(fg), token(bg));
    assert.ok(r >= min, `${fg}/${bg} is ${r.toFixed(2)}:1`);
  });
}
test("white text on --accent button >= 4.5:1", () => {
  assert.ok(ratio("#ffffff", token("accent")) >= 4.5);
});
