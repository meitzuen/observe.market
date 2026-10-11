# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Nerd Grid" wireframe-HUD front end of all 18 pages with the modern-fintech design system, a shared shell (mega-menu, ⌘K search, footer), and consistent loading/empty/error/stale states.

**Architecture:** Vanilla static HTML/CSS/JS served from `docs/` (no build step). New shared files `ui.css`, `shell.js`, `data.js`, `chart-theme.js`, `ui-table.js`, and `market-page.js` sit beside the old `nerd-grid.*` files. Pages migrate one group at a time; `ui.css` keeps legacy `--hud-*` variable aliases and `shell.js` keeps a `NerdGrid` shim so half-migrated states never break. A dev-only Playwright + `node --test` layer under `tests/ui/` gates every task.

**Tech Stack:** HTML/CSS/JS (no framework), Chart.js 4.4.7 (pinned, CDN), lightweight-charts 4.2.3 (already pinned on `stock.html`), Node ≥ 20 + `@playwright/test` 1.48.2 (dev only), `node:test`.

**Spec:** `specs/2026-10-11-ui-redesign-design.md`

## Global Constraints

- Front end only: do not touch `src/`, `docs/data/**`, `.github/workflows/update_data.yml`, or any data format or filename.
- Light theme only. Tokens must be structured so dark mode is a future override of `:root` values.
- No build step, no framework, no new runtime dependency. External scripts only from `cdn.jsdelivr.net` / `unpkg.com`, with an exact version.
- TW convention: red (`--up`) = price up, green (`--down`) = price down. Direction is always also shown with ▲/▼ or +/−.
- Existing URLs (`twse.html`, `tpex.html`, `stock.html?id=<code>`, …) and element IDs that page scripts rely on (`date-picker`, `last-update`, `stock-search`, …) keep working.
- Tokens: `--bg #f6f7fb`, `--surface #ffffff`, `--border #e3e6ee`, `--text #1c2333`, `--text-muted #5b6478`, `--text-subtle #8a93a6`, `--accent #3b5bdb`, `--accent-soft #edf2ff`, `--up #c0262d`, `--up-soft #fde8e8`, `--down #16794a`, `--down-soft #e3f5ec`, `--warn #92600a`, `--warn-soft #fff7e0`; radius 8px / 12px; font Inter + Noto Sans TC; sizes 12/14/16/20/28px; 4px spacing scale.
- Body-text contrast ≥ 4.5:1 (`--text`, `--text-muted`, accent/up/down/warn on their surfaces). `--text-subtle` (3.09:1 on white) is allowed **only** for placeholders, disabled and decorative text; captions use `--text-muted`.
- Mobile: no horizontal page scroll at 390px width (tables scroll inside `.table-container`).
- Mobile breakpoint is `< 768px`.
- Stale-data banner threshold: newest `daily_price` date in `manifest.json` more than 3 calendar days before today (Asia/Taipei).
- Shared data facts: `data/stock_info.json` is an **object keyed by stock code** (`{"2330":{"name":"台積電","type":"twse"}}`, ~3,150 entries; type is `twse` or `tpex`); `data/manifest.json` has `twse`/`tpex` objects whose date arrays (e.g. `daily_price`) are sorted **newest first**.
- Commit after every task. Work on branch `ui-redesign`.

## Review Focus

Inputs and failure modes the spec implies but no feature task would exercise on its own; each is pinned by a test in the task that owns the code.

1. **Hostile / regex-looking search text** (`<img onerror=x>`, `.*`, `(`, `\`) → no exception, nothing injected into the DOM, "no results" shown. *(Task 4)*
2. **Stock codes with letters and mixed case** (ETFs/bonds such as `00835B`, typed as `00835b`) → still found. *(Task 4)*
3. **`manifest.json` missing, 404, or invalid** → header and nav still render, no stale banner, footer shows "資料日期暫時無法取得", no uncaught error. *(Task 4)*
4. **`stock_info.json` fails to load** → page results still work and a "股票清單載入失敗" note appears. *(Task 4)*
5. **Very narrow phone (320px) with long Chinese text** → header and page do not overflow horizontally. *(Task 4)*
6. **`/` shortcut collides with pages that already bind `/` to their own `#stock-search`** → shell must not hijack it. *(Task 4)*
7. **sessionStorage blocked** → dismissing the stale banner must not throw. *(Task 4)*

---

## File Structure

| File | Responsibility |
|---|---|
| `docs/assets/ui.css` (new) | Tokens, base, layout, all components, header/mega-menu/search/footer styles, legacy `--hud-*` aliases |
| `docs/assets/shell.js` (new) | `NAV`, header + mega-menu + mobile drawer, ⌘K search, footer, stale banner, `NerdGrid` compat shim |
| `docs/assets/data.js` (new) | `UIData.loadJSON` (timeout, retry) and `UIData.renderState` (loading/empty/error) |
| `docs/assets/chart-theme.js` (new) | `ChartTheme.colors()` reading CSS tokens |
| `docs/assets/ui-table.js` (new) | Pure helpers: sort, filter, paginate, number/percent formatting |
| `docs/assets/market-page.js` (new) | The market-dashboard script shared by `twse.html` and `tpex.html` |
| `docs/ui-gallery.html` (new) | Every component and state on one page (noindex, not in nav) |
| `tests/ui/**` (new) | Dev-only: static server, Playwright smoke/gallery/shell specs, `node:test` unit tests |
| `.github/workflows/ui-smoke.yml` (new) | Runs the tests on PRs touching `docs/**` or `tests/ui/**` |
| `docs/*.html` (modify) | Migrated page by page |
| `docs/assets/nerd-grid.css`, `nerd-grid.js` (delete in Task 13) | Old theme |

## Migration Recipe (referenced by Tasks 6–12)

Each task repeats the steps it needs; this is the reference. For every page `P.html`:

- **R1 head:** replace `<link rel="stylesheet" href="assets/nerd-grid.css" />` with `<link rel="stylesheet" href="assets/ui.css" />`. Replace the Google Fonts `<link>` whose `href` contains `JetBrains+Mono` with:
  `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet" />`
- **R2 header:** replace the whole `<header>…</header>` element with `<header id="site-header"></header>`. In the existing `<div class="container">` add `id="main"` and insert as its **first child**:
  ```html
  <div class="page-header">
    <div>
      <h1 class="page-title">PAGE TITLE</h1>
      <p class="page-subtitle">ONE-LINE DESCRIPTION</p>
    </div>
    <div class="page-actions">
      <select id="date-picker" class="date-select" aria-label="選擇日期"></select>
      <span id="last-update" class="last-update"></span>
    </div>
  </div>
  ```
  Keep the `date-picker` / `last-update` IDs exactly. Omit the `page-actions` div if the old header had neither. Reuse the page's old `<h1>` text for the title.
- **R3 scripts:** replace `<script src="assets/nerd-grid.js"></script>` with
  `<script src="assets/data.js"></script>` `<script src="assets/chart-theme.js"></script>` `<script src="assets/shell.js"></script>`
  (omit `chart-theme.js` on pages with no chart).
- **R4 calls:** delete `NerdGrid.initThemeToggle();` and `NerdGrid.initNav();`; delete any `NerdGrid.onThemeChange(...)` statement; replace `NerdGrid.chartColors()` / `NerdGrid.chartColors(NerdGrid.currentTheme())` with `ChartTheme.colors()`.
- **R5 page `<style>`:** keep page-local rules that are still needed. Delete rules that duplicate `ui.css` (header, nav, `.card`, `.btn`, table base, `.loader`, `.stat-*`, `.badge`, `.tag`). `--hud-*` variables keep working through aliases; convert them to the new tokens only when you are editing that rule anyway.
- **R6 verify:** add the page to `tests/ui/migrated.json`, run `cd tests/ui && npx playwright test smoke.spec.js -g "P.html"`, then open the PNGs in `tests/ui/test-results/shots/{desktop,mobile}/` and confirm: header renders, nothing overlaps, tables readable, chart present, no leftover monospace/blue-hairline styling.

---

### Task 1: Branch and test harness (baseline)

**Files:**
- Create: `tests/ui/package.json`, `tests/ui/serve.js`, `tests/ui/playwright.config.js`, `tests/ui/pages.json`, `tests/ui/migrated.json`, `tests/ui/baseline-overflow.json`, `tests/ui/known-404.json`, `tests/ui/smoke.spec.js`
- Create: `.github/workflows/ui-smoke.yml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `tests/ui/migrated.json` — JSON array of page filenames; every migration task appends to it. `smoke.spec.js` applies the strict shell assertions to those pages. Run from `tests/ui/`: `npm test` (all Playwright), `npm run test:unit` (node:test).

- [ ] **Step 1: Create the branch**

```bash
git switch -c ui-redesign
```

- [ ] **Step 2: Write `tests/ui/package.json`**

```json
{
  "name": "observe-market-ui-tests",
  "private": true,
  "scripts": {
    "test": "playwright test",
    "test:unit": "node --test \"unit/*.test.js\""
  },
  "devDependencies": {
    "@playwright/test": "1.48.2"
  }
}
```

- [ ] **Step 3: Write `tests/ui/serve.js`** (dependency-free static server for `docs/`)

```js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../docs");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.normalize(path.join(root, p));
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404).end("not found");
        return;
      }
      res
        .writeHead(200, {
          "content-type": types[path.extname(file)] || "application/octet-stream",
        })
        .end(buf);
    });
  })
  .listen(4173, "127.0.0.1", () => console.log("serving", root));
```

- [ ] **Step 4: Write `tests/ui/playwright.config.js`**

```js
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.js/,
  timeout: 45000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "node serve.js",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
```

- [ ] **Step 5: Write the data files**

`tests/ui/pages.json`:
```json
[
  "index.html", "twse.html", "tpex.html", "stock.html",
  "gap.html", "volume-candle.html", "xiaoge-strategy.html", "punish.html",
  "vcp.html", "wantgoo.html", "volatility.html", "screener.html",
  "warrant-filter.html", "premium-warrant.html",
  "day-trade-calculator.html", "portfolio.html",
  "bookmark.html", "watchlist.html"
]
```
`tests/ui/migrated.json`: `[]`
`tests/ui/baseline-overflow.json`: `[]`
`tests/ui/known-404.json`: `[]`

- [ ] **Step 6: Write the failing/baseline smoke test `tests/ui/smoke.spec.js`**

```js
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const pages = require("./pages.json");
const migrated = new Set(require("./migrated.json"));
const baselineOverflow = new Set(require("./baseline-overflow.json"));
const known404 = require("./known-404.json").map((s) => new RegExp(s));
const ORIGIN = "http://127.0.0.1:4173";

for (const file of pages) {
  test(`${file} loads cleanly`, async ({ page }, testInfo) => {
    const problems = [];
    page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.origin !== ORIGIN || r.status() < 400) return;
      if (u.pathname.endsWith("favicon.ico")) return;
      if (known404.some((re) => re.test(u.pathname))) return;
      problems.push(`${r.status()} ${u.pathname}`);
    });

    await page.goto("/" + file, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    const shotDir = path.join("test-results", "shots", testInfo.project.name);
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({
      path: path.join(shotDir, file.replace(".html", ".png")),
      fullPage: true,
    });

    expect(problems, problems.join("\n")).toEqual([]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (migrated.has(file) || !baselineOverflow.has(file)) {
      expect(overflow, "horizontal page overflow (px)").toBeLessThanOrEqual(1);
    }

    if (migrated.has(file)) {
      await expect(page.locator("#site-header .brand")).toBeVisible();
      await expect(page.locator("#site-header .site-nav")).toHaveCount(1);
      await expect(page.locator("#site-footer")).toHaveCount(1);
      await expect(page.locator('link[href$="assets/ui.css"]')).toHaveCount(1);
      await expect(
        page.locator('link[href*="nerd-grid"], script[src*="nerd-grid"]'),
      ).toHaveCount(0);
    }
  });
}
```

- [ ] **Step 7: Install and run the baseline**

```bash
cd tests/ui && npm install && npx playwright install chromium && npx playwright test smoke.spec.js
```
Expected: all pages pass the load/no-error check; some may fail only the overflow assertion on `mobile`. For each page failing **overflow** (read the failure list), add its filename to `tests/ui/baseline-overflow.json`. For each same-origin 404 that is legitimate (a data file that genuinely does not exist for some date), add a path regex to `known-404.json` and note why in the commit message. Re-run until green. Anything else (uncaught errors) is a real pre-existing bug: list it in the commit message, do not fix it here.

- [ ] **Step 8: Ignore tooling output, add CI**

Append to `.gitignore`:
```
# UI test tooling
tests/ui/node_modules/
tests/ui/test-results/
tests/ui/playwright-report/
```
`.github/workflows/ui-smoke.yml`:
```yaml
name: UI smoke
on:
  pull_request:
    paths:
      - "docs/**"
      - "tests/ui/**"
permissions:
  contents: read
jobs:
  ui:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: tests/ui/package-lock.json
      - run: npm ci
        working-directory: tests/ui
      - run: npx playwright install --with-deps chromium
        working-directory: tests/ui
      - run: npm run test:unit
        working-directory: tests/ui
      - run: npm test
        working-directory: tests/ui
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ui-screenshots
          path: tests/ui/test-results/shots
```

- [ ] **Step 9: Commit**

```bash
git add .gitignore .github/workflows/ui-smoke.yml tests/ui/package.json tests/ui/package-lock.json tests/ui/serve.js tests/ui/playwright.config.js tests/ui/pages.json tests/ui/migrated.json tests/ui/baseline-overflow.json tests/ui/known-404.json tests/ui/smoke.spec.js
git commit -m "test(ui): add Playwright smoke harness and baseline for all pages"
```

---

### Task 2: Design system `ui.css` and component gallery

**Files:**
- Create: `docs/assets/ui.css`, `docs/ui-gallery.html`, `tests/ui/unit/contrast.test.js`, `tests/ui/gallery.spec.js`
- Modify: `specs/2026-10-11-ui-redesign-design.md` (one-line clarification)

**Interfaces:**
- Produces: CSS custom properties listed in Global Constraints plus `--border-strong`, `--hover`, `--accent-hover`, `--series-2 #0b7285`, `--series-3 #e67700`, `--radius`, `--radius-lg`, `--shadow`, `--shadow-pop`, `--font`, `--s1`…`--s6` (4,8,12,16,24,32px); legacy `--hud-*` aliases. Class API: `.container`/`.page`, `.grid`, `.page-header/.page-title/.page-subtitle/.page-actions/.last-update`, `.card/.card-title`, `.sidebar-section`, `.btn/.btn-primary/.btn-secondary`, `.chip/.chip.active`, `.pill/.pill-up/.pill-down`, `.badge/.badge-primary/.badge-accent/.badge-danger`, `.tag/.tag-warn/.tag-danger`, `.search-box`, `.filter-pill`, `.date-select`, `.stats/.stat-item/.stat-label/.stat-value/.stat-change`, `.table-container/.table-container.sticky`, `.price-up/.price-down`, `.toolbar`, `.tabs/.tab`, `[data-tip]`, `.empty-state`, `.skeleton/.skeleton-block`, `.banner/.banner-error/.banner-warn/.banner-close`, `.loader`, `.list-item`, `.stock-link`, `.pagination`; shell classes used by Task 5 (`#site-header`, `.site-header-inner`, `.brand`, `.site-nav`, `.nav-group-btn`, `.mega`, `.mega-grid`, `.mega-item`, `.search-btn`, `.nav-toggle`, `.drawer`, `.search-overlay`, `.search-dialog`, `.search-results`, `.search-group`, `.search-item`, `.search-hint`, `#site-footer`, `.footer-*`, `.skip-link`).

- [ ] **Step 1: Write the failing contrast test `tests/ui/unit/contrast.test.js`**

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tests/ui && npm run test:unit`
Expected: FAIL — `ENOENT … ui.css`.

- [ ] **Step 3: Write `docs/assets/ui.css`**

```css
/* ==========================================================================
   Market Observer design system — modern fintech, light theme.
   Tokens first; dark mode later = override :root values only.
   ========================================================================== */

:root {
  --bg: #f6f7fb;
  --surface: #ffffff;
  --border: #e3e6ee;
  --border-strong: #cfd4e0;
  --text: #1c2333;
  --text-muted: #5b6478;
  --text-subtle: #8a93a6; /* placeholders / disabled / decorative only */
  --accent: #3b5bdb;
  --accent-hover: #3351c4;
  --accent-soft: #edf2ff;
  --up: #c0262d; /* TW convention: red = up */
  --up-soft: #fde8e8;
  --down: #16794a; /* green = down */
  --down-soft: #e3f5ec;
  --warn: #92600a;
  --warn-soft: #fff7e0;
  --hover: #f1f3f9;
  --series-2: #0b7285;
  --series-3: #e67700;

  --radius: 8px;
  --radius-lg: 12px;
  --shadow: 0 1px 3px rgba(20, 30, 60, 0.08), 0 1px 2px rgba(20, 30, 60, 0.06);
  --shadow-pop: 0 12px 32px rgba(20, 30, 60, 0.16);
  --font: "Inter", "Noto Sans TC", system-ui, -apple-system, "Segoe UI",
    sans-serif;

  --s1: 4px;
  --s2: 8px;
  --s3: 12px;
  --s4: 16px;
  --s5: 24px;
  --s6: 32px;

  /* Legacy aliases so un-migrated page-local styles keep working. Removed in
     the cleanup task once `grep -- --hud-` finds nothing. */
  --hud-bg: var(--bg);
  --hud-bg-raised: var(--surface);
  --hud-card-bg: var(--surface);
  --hud-border-1: var(--border-strong);
  --hud-border-2: var(--border);
  --hud-border-3: var(--border);
  --hud-grid-h: rgba(28, 35, 51, 0.08);
  --hud-grid-v: rgba(28, 35, 51, 0.04);
  --hud-text-1: var(--text);
  --hud-text-2: var(--text);
  --hud-text-3: var(--text-muted);
  --hud-text-4: var(--text-muted);
  --hud-up: var(--up);
  --hud-up-dim: var(--up);
  --hud-down: var(--down);
  --hud-down-dim: var(--down);
  --hud-danger-border: var(--up);
  --hud-danger-text: var(--up);
  --hud-hover-bg: var(--hover);
  --hud-active-bg: var(--accent-soft);
  --hud-radius: var(--radius);
  --hud-font: var(--font);
}

/* ---- base ---------------------------------------------------------------- */
*,
*::before,
*::after {
  box-sizing: border-box;
}
html {
  -webkit-text-size-adjust: 100%;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}
h1,
h2,
h3 {
  margin: 0;
  font-weight: 600;
  line-height: 1.3;
}
a {
  color: var(--accent);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.skip-link {
  position: absolute;
  left: -9999px;
  top: var(--s2);
  background: var(--surface);
  padding: var(--s2) var(--s3);
  border-radius: var(--radius);
  z-index: 300;
}
.skip-link:focus {
  left: var(--s2);
}
::placeholder {
  color: var(--text-subtle);
}

/* ---- layout -------------------------------------------------------------- */
.container,
.page {
  max-width: 1400px;
  margin: 0 auto;
  padding: var(--s4);
}
@media (min-width: 768px) {
  .container,
  .page {
    padding: var(--s5) var(--s5);
  }
}
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--s4);
}
@media (min-width: 1024px) {
  .grid {
    grid-template-columns: 2.5fr 1fr;
  }
}
.page-header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--s4);
}
.page-title {
  font-size: 20px;
}
.page-subtitle {
  margin: 2px 0 0;
  color: var(--text-muted);
}
.page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
  align-items: center;
}
.last-update {
  font-size: 12px;
  color: var(--text-muted);
}

/* ---- card ---------------------------------------------------------------- */
.card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: var(--s4);
}
@media (min-width: 768px) {
  .card {
    padding: var(--s5);
  }
}
.card-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s2);
  margin: 0 0 var(--s4);
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.sidebar-section {
  margin-bottom: var(--s4);
}
.list-item {
  padding: var(--s2) 0;
  border-bottom: 1px solid var(--border);
}
.list-item:last-child {
  border-bottom: 0;
}
.list-item:hover {
  background: var(--hover);
}

/* ---- buttons / chips / pills / tags -------------------------------------- */
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s1);
  padding: 6px var(--s3);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  background: var(--hover);
}
.btn:disabled {
  color: var(--text-subtle);
  cursor: not-allowed;
}
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}
.btn-secondary {
  color: var(--text-muted);
}
.chip {
  display: inline-flex;
  align-items: center;
  padding: 3px var(--s3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.chip:hover {
  background: var(--hover);
}
.chip.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.pill {
  display: inline-block;
  padding: 1px var(--s2);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  background: var(--hover);
  color: var(--text-muted);
}
.pill-up {
  background: var(--up-soft);
  color: var(--up);
}
.pill-down {
  background: var(--down-soft);
  color: var(--down);
}
.badge {
  display: inline-block;
  padding: 0 var(--s2);
  border-radius: 999px;
  background: var(--hover);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}
.badge-primary,
.badge-accent {
  background: var(--accent-soft);
  color: var(--accent);
}
.badge-danger {
  background: var(--up-soft);
  color: var(--up);
}
.tag {
  display: inline-block;
  padding: 0 6px;
  margin-right: var(--s1);
  border-radius: 4px;
  background: var(--hover);
  color: var(--text-muted);
  font-size: 11px;
}
.tag-warn {
  background: var(--warn-soft);
  color: var(--warn);
}
.tag-danger {
  background: var(--up-soft);
  color: var(--up);
}

/* ---- inputs / toolbar ---------------------------------------------------- */
input[type="text"],
input[type="number"],
input[type="search"],
input[type="date"],
select,
.date-select {
  padding: 6px var(--s3);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  font: inherit;
  font-size: 13px;
}
input:focus,
select:focus {
  outline: 2px solid var(--accent);
  outline-offset: 0;
  border-color: var(--accent);
}
.search-box {
  margin-bottom: var(--s4);
}
.search-box input {
  width: 100%;
  padding: 10px var(--s3);
  font-size: 14px;
}
.filter-pill {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: 4px var(--s3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  font-size: 12px;
}
.filter-pill input,
.filter-pill select {
  width: 72px;
  padding: 2px 6px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
  align-items: center;
  margin-bottom: var(--s4);
}
.tabs {
  display: flex;
  gap: var(--s1);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--s4);
  overflow-x: auto;
}
.tab {
  padding: var(--s2) var(--s3);
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
[data-tip] {
  position: relative;
  cursor: help;
}
[data-tip]:hover::after,
[data-tip]:focus-visible::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  background: var(--text);
  color: #fff;
  padding: 4px var(--s2);
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  z-index: 50;
}

/* ---- table --------------------------------------------------------------- */
.table-container {
  overflow-x: auto;
}
.table-container.sticky {
  max-height: 70vh;
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  text-align: left;
}
th {
  padding: var(--s3) 10px;
  background: #fafbfd;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.table-container.sticky th {
  position: sticky;
  top: 0;
  z-index: 2;
}
td {
  padding: 10px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
tbody tr:hover td {
  background: var(--hover);
}
.price-up {
  color: var(--up);
  font-weight: 500;
}
.price-down {
  color: var(--down);
  font-weight: 500;
}
.stock-link {
  color: var(--accent);
  font-weight: 500;
}
.sort-icon {
  color: var(--text-subtle);
}
@media (max-width: 767px) {
  .table-container td:first-child,
  .table-container th:first-child {
    position: sticky;
    left: 0;
    background: var(--surface);
    z-index: 1;
  }
}
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--s4);
  margin-top: var(--s4);
  padding-top: var(--s4);
  border-top: 1px solid var(--border);
  color: var(--text-muted);
}

/* ---- stats ---------------------------------------------------------------- */
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s3);
}
.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--s3);
  background: var(--bg);
  border-radius: var(--radius);
}
.stat-label {
  font-size: 12px;
  color: var(--text-muted);
}
.stat-value {
  font-size: 20px;
  font-weight: 600;
}
.stat-change {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

/* ---- states ---------------------------------------------------------------- */
.loader {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 160px;
  color: var(--text-muted);
}
.skeleton-block {
  display: grid;
  gap: var(--s2);
  padding: var(--s2) 0;
}
.skeleton {
  height: 16px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--hover), var(--border), var(--hover));
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
.empty-state {
  padding: var(--s6) var(--s4);
  text-align: center;
  color: var(--text-muted);
}
.empty-title {
  font-weight: 600;
  color: var(--text);
}
.empty-hint {
  margin-top: var(--s1);
}
.empty-state .btn {
  margin-top: var(--s3);
}
.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border-radius: var(--radius);
  font-size: 13px;
}
.banner-error {
  background: var(--up-soft);
  color: var(--up);
}
.banner-warn {
  background: var(--warn-soft);
  color: var(--warn);
  border-radius: 0;
  justify-content: center;
}
.banner-close {
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

/* ---- shell: header / mega-menu / drawer ------------------------------------ */
#site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  min-height: 56px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.site-header-inner {
  display: flex;
  align-items: center;
  gap: var(--s3);
  max-width: 1400px;
  height: 56px;
  margin: 0 auto;
  padding: 0 var(--s4);
}
.brand {
  display: flex;
  align-items: center;
  gap: var(--s2);
  color: var(--text);
  font-weight: 700;
  white-space: nowrap;
}
.brand:hover {
  text-decoration: none;
}
.brand img {
  height: 28px;
  width: auto;
}
.site-nav {
  display: none;
  flex: 1;
  gap: 2px;
}
@media (min-width: 768px) {
  .site-nav {
    display: flex;
  }
}
.nav-group-btn {
  padding: 6px var(--s3);
  background: none;
  border: 0;
  border-radius: var(--radius);
  color: var(--text-muted);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.nav-group-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.nav-group-btn.active,
.nav-group-btn[aria-expanded="true"] {
  color: var(--accent);
  background: var(--accent-soft);
}
.mega {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  padding: var(--s4);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-pop);
}
.mega[hidden] {
  display: none;
}
.mega-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--s2);
  max-width: 1400px;
  margin: 0 auto;
}
.mega-item {
  display: block;
  padding: var(--s2) var(--s3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
}
.mega-item:hover {
  background: var(--hover);
  text-decoration: none;
}
.mega-item.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.mega-item b {
  display: block;
  font-weight: 600;
}
.mega-item span {
  font-size: 12px;
  color: var(--text-muted);
}
.search-btn {
  display: flex;
  align-items: center;
  gap: var(--s2);
  margin-left: auto;
  padding: 6px var(--s3);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.search-btn kbd {
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: var(--surface);
  font: inherit;
  font-size: 11px;
}
@media (max-width: 767px) {
  .search-btn span,
  .search-btn kbd {
    display: none;
  }
}
.nav-toggle {
  padding: 4px var(--s3);
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font: inherit;
  font-size: 18px;
  cursor: pointer;
}
@media (min-width: 768px) {
  .nav-toggle {
    display: none;
  }
}
.drawer {
  padding: var(--s2) var(--s4) var(--s4);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  max-height: calc(100vh - 56px);
  overflow: auto;
}
.drawer[hidden] {
  display: none;
}
.drawer summary {
  padding: var(--s3) 0;
  font-weight: 600;
  cursor: pointer;
}
.drawer a {
  display: block;
  padding: var(--s2) var(--s3);
  color: var(--text);
}
.drawer a.active {
  color: var(--accent);
  font-weight: 600;
}

/* ---- shell: search -------------------------------------------------------- */
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: rgba(20, 30, 60, 0.4);
}
.search-overlay[hidden] {
  display: none;
}
@media (max-width: 767px) {
  .search-overlay {
    padding-top: 0;
    background: var(--surface);
  }
}
.search-dialog {
  width: min(560px, 92vw);
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
}
@media (max-width: 767px) {
  .search-dialog {
    width: 100%;
    height: 100%;
    border-radius: 0;
    box-shadow: none;
  }
}
.search-dialog input {
  width: 100%;
  padding: var(--s4);
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  font-size: 16px;
  outline: none;
}
.search-results {
  max-height: 50vh;
  overflow: auto;
  padding: var(--s2);
}
@media (max-width: 767px) {
  .search-results {
    max-height: none;
  }
}
.search-group {
  padding: var(--s2) var(--s3);
  font-size: 12px;
  color: var(--text-muted);
}
.search-item {
  display: flex;
  align-items: baseline;
  gap: var(--s3);
  padding: var(--s2) var(--s3);
  border-radius: var(--radius);
  color: var(--text);
}
.search-item:hover {
  text-decoration: none;
}
.search-item[aria-selected="true"] {
  background: var(--accent-soft);
}
.si-main {
  font-weight: 600;
}
.si-sub {
  flex: 1;
  color: var(--text-muted);
}
.si-tag {
  font-size: 12px;
  color: var(--text-muted);
}
.search-hint {
  padding: var(--s3);
  color: var(--text-muted);
}

/* ---- shell: footer ---------------------------------------------------------- */
#site-footer {
  margin-top: var(--s6);
  padding: var(--s5) var(--s4) var(--s6);
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.footer-inner {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  max-width: 1400px;
  margin: 0 auto;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}
.footer-title {
  color: var(--text);
  font-weight: 600;
  font-size: 14px;
}
.footer-disclaimer {
  max-width: 720px;
  margin: 0 auto;
  line-height: 1.8;
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd tests/ui && npm run test:unit`
Expected: PASS (13 tests). If a ratio fails, darken that token by ~5% and re-run; do not lower the threshold.

- [ ] **Step 5: Write the failing gallery test `tests/ui/gallery.spec.js`**

```js
const { test, expect } = require("@playwright/test");

const COMPONENTS = [
  "button", "chip", "pill", "tag", "badge", "search-input", "select",
  "stat-tile", "data-table", "page-header", "toolbar", "tabs", "tooltip",
  "empty-state", "skeleton", "error-banner", "stale-banner",
];

test("gallery renders every component with design tokens applied", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
  for (const name of COMPONENTS) {
    await expect(
      page.locator(`[data-component="${name}"]`).first(),
      `component ${name}`,
    ).toBeVisible();
  }
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(246, 247, 251)");
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font).toContain("Inter");
  expect(errors).toEqual([]);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd tests/ui && npx playwright test gallery.spec.js --project=desktop`
Expected: FAIL — `/ui-gallery.html` returns 404 / components not found.

- [ ] **Step 7: Write `docs/ui-gallery.html`**

```html
<!doctype html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>UI Gallery | Market Observer</title>
    <link rel="icon" href="assets/favicon.png" type="image/png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="assets/ui.css" />
    <style>
      .gallery-section { margin-bottom: var(--s5); }
      .gallery-section > h2 { font-size: 14px; color: var(--text-muted); margin-bottom: var(--s3); }
      .row { display: flex; flex-wrap: wrap; gap: var(--s3); align-items: center; }
    </style>
  </head>
  <body>
    <header id="site-header"></header>
    <div class="container" id="main">
      <div class="page-header" data-component="page-header">
        <div>
          <h1 class="page-title">UI Gallery</h1>
          <p class="page-subtitle">Every component and state, used as the visual reference.</p>
        </div>
        <div class="page-actions">
          <select id="date-picker" class="date-select" aria-label="選擇日期">
            <option>2026-10-09</option>
          </select>
          <span id="last-update" class="last-update">最後更新: 2026-10-09</span>
        </div>
      </div>

      <div class="card gallery-section">
        <h2>Buttons, chips, pills, tags, badges</h2>
        <div class="row">
          <button class="btn btn-primary" data-component="button">Primary</button>
          <button class="btn">Secondary</button>
          <button class="btn" disabled>Disabled</button>
          <button class="chip active" data-component="chip">MA5</button>
          <button class="chip">MA10</button>
          <span class="pill pill-up" data-component="pill">▲ 1.24%</span>
          <span class="pill pill-down">▼ 0.31%</span>
          <span class="tag tag-warn" data-component="tag">處置中</span>
          <span class="badge badge-accent" data-component="badge">1,082</span>
        </div>
      </div>

      <div class="card gallery-section">
        <h2>Inputs and toolbar</h2>
        <div class="toolbar" data-component="toolbar">
          <div class="search-box" style="margin: 0; flex: 1; min-width: 220px" data-component="search-input">
            <input type="text" placeholder="搜尋代號或名稱..." />
          </div>
          <select data-component="select">
            <option>全部市場</option>
            <option>上市</option>
            <option>上櫃</option>
          </select>
          <div class="filter-pill">價格 <input type="number" placeholder="最低" /> – <input type="number" placeholder="最高" /></div>
          <span class="pill" data-component="tooltip" data-tip="提示文字" tabindex="0">ⓘ 說明</span>
        </div>
        <div class="tabs" data-component="tabs">
          <button class="tab active">1M</button>
          <button class="tab">3M</button>
          <button class="tab">6M</button>
          <button class="tab">1Y</button>
        </div>
      </div>

      <div class="grid gallery-section">
        <div class="card">
          <h2 class="card-title">Data table</h2>
          <div class="table-container sticky" data-component="data-table">
            <table>
              <thead>
                <tr><th>代號</th><th>名稱</th><th>收盤</th><th>漲跌幅</th></tr>
              </thead>
              <tbody>
                <tr><td><a class="stock-link" href="stock.html?id=2330">2330</a></td><td>台積電</td><td>1,085.0</td><td class="price-up">▲ 1.87%</td></tr>
                <tr><td><a class="stock-link" href="stock.html?id=2454">2454</a></td><td>聯發科</td><td>1,420.0</td><td class="price-down">▼ 0.70%</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <h2 class="card-title">市場摘要</h2>
          <div class="stats">
            <div class="stat-item" data-component="stat-tile">
              <span class="stat-label">加權指數</span>
              <span class="stat-value">23,481</span>
              <span class="stat-change price-up">▲ 1.24%</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">成交金額</span>
              <span class="stat-value">4,126 億</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card gallery-section">
        <h2>States</h2>
        <div id="state-skeleton" data-component="skeleton"></div>
        <div id="state-empty" data-component="empty-state"></div>
        <div id="state-error" data-component="error-banner"></div>
        <div class="banner banner-warn" data-component="stale-banner">
          <span>資料最後更新於 2026-10-01，可能因休市或更新延遲而非最新資料。</span>
          <button type="button" class="banner-close" aria-label="關閉">✕</button>
        </div>
      </div>
    </div>
    <footer id="site-footer"></footer>

    <script>
      // Placeholder state renderers until data.js is added in Task 3.
      document.getElementById("state-skeleton").innerHTML =
        '<div class="skeleton-block"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
      document.getElementById("state-empty").innerHTML =
        '<div class="empty-state"><div class="empty-title">沒有符合的資料</div><div class="empty-hint">請調整篩選條件</div></div>';
      document.getElementById("state-error").innerHTML =
        '<div class="banner banner-error" role="alert"><span>資料載入失敗</span><button class="btn btn-secondary">重試</button></div>';
    </script>
  </body>
</html>
```

- [ ] **Step 8: Run to verify it passes**

Run: `cd tests/ui && npx playwright test gallery.spec.js --project=desktop`
Expected: PASS. Open `tests/ui/test-results/` is not needed; open `http://127.0.0.1:4173/ui-gallery.html` (`node serve.js`) once and look at it: cards soft-shadowed, grey page, blue accent.

- [ ] **Step 9: Clarify the spec's `--text-subtle` rule**

In `specs/2026-10-11-ui-redesign-design.md` §2 change the `--text-subtle` row's "Use" cell from `captions, placeholders (large/auxiliary text only)` to `placeholders, disabled and decorative text only (3.09:1 on white; captions use --text-muted)`.

- [ ] **Step 10: Commit**

```bash
git add docs/assets/ui.css docs/ui-gallery.html tests/ui/unit/contrast.test.js tests/ui/gallery.spec.js specs/2026-10-11-ui-redesign-design.md
git commit -m "feat(ui): add ui.css design system and component gallery"
```

---

### Task 3: `data.js` — loading, retry, and state rendering

**Files:**
- Create: `docs/assets/data.js`, `tests/ui/unit/data.test.js`
- Modify: `docs/ui-gallery.html`, `tests/ui/gallery.spec.js`

**Interfaces:**
- Produces: global `UIData` (also `module.exports` under Node):
  - `loadJSON(url: string, opts?: {timeout?: number=10000, retries?: number=1, retryDelay?: number=400, fetchImpl?: Function}): Promise<any>` — rejects with an `Error` (has `.status` for HTTP failures); a 404 is **not** retried.
  - `renderState(el: HTMLElement, state: "loading"|"empty"|"error", opts?: {title?, hint?, message?, actionLabel?, onAction?, onRetry?, rows?: number}): void` — replaces `el.innerHTML`.

- [ ] **Step 1: Write the failing test `tests/ui/unit/data.test.js`**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadJSON } = require("../../../docs/assets/data.js");

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const notOk = (status) => ({ ok: false, status, json: async () => ({}) });

test("returns parsed JSON on success", async () => {
  const data = await loadJSON("x.json", { fetchImpl: async () => ok({ a: 1 }) });
  assert.deepEqual(data, { a: 1 });
});

test("retries once after a network failure then succeeds", async () => {
  let calls = 0;
  const data = await loadJSON("x.json", {
    retryDelay: 1,
    fetchImpl: async () => {
      calls++;
      if (calls === 1) throw new TypeError("network down");
      return ok([1, 2]);
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(data, [1, 2]);
});

test("throws after retries are exhausted", async () => {
  let calls = 0;
  await assert.rejects(
    loadJSON("x.json", {
      retries: 1,
      retryDelay: 1,
      fetchImpl: async () => {
        calls++;
        return notOk(503);
      },
    }),
    (e) => e.status === 503,
  );
  assert.equal(calls, 2);
});

test("does not retry a 404", async () => {
  let calls = 0;
  await assert.rejects(
    loadJSON("missing.json", {
      retryDelay: 1,
      fetchImpl: async () => {
        calls++;
        return notOk(404);
      },
    }),
    (e) => e.status === 404,
  );
  assert.equal(calls, 1);
});

test("aborts when the request exceeds the timeout", async () => {
  const hang = (url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    });
  await assert.rejects(
    loadJSON("slow.json", { timeout: 20, retries: 0, fetchImpl: hang }),
    (e) => e.name === "AbortError",
  );
});

test("rejects when the body is not valid JSON", async () => {
  await assert.rejects(
    loadJSON("bad.json", {
      retries: 0,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
    }),
    SyntaxError,
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tests/ui && npm run test:unit`
Expected: FAIL — `Cannot find module '../../../docs/assets/data.js'`.

- [ ] **Step 3: Write `docs/assets/data.js`**

```js
(function (root) {
  "use strict";

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Fetch JSON with a timeout and retry. A 404 is final (the file will not
  // appear on retry), everything else is retried `retries` times.
  async function loadJSON(url, opts) {
    const o = Object.assign(
      { timeout: 10000, retries: 1, retryDelay: 400, fetchImpl: null },
      opts || {},
    );
    const doFetch = o.fetchImpl || root.fetch.bind(root);
    let lastErr;
    for (let attempt = 0; attempt <= o.retries; attempt++) {
      const ctrl =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), o.timeout) : null;
      try {
        const res = await doFetch(url, ctrl ? { signal: ctrl.signal } : undefined);
        if (!res.ok) {
          const e = new Error("HTTP " + res.status + " for " + url);
          e.status = res.status;
          throw e;
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (err && err.status === 404) break;
        if (attempt < o.retries) await sleep(o.retryDelay);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    throw lastErr;
  }

  // Replace el's content with a consistent loading / empty / error state.
  function renderState(el, state, opts) {
    const o = opts || {};
    if (state === "loading") {
      const rows = o.rows || 4;
      el.innerHTML =
        '<div class="skeleton-block" role="status" aria-label="載入中">' +
        '<div class="skeleton"></div>'.repeat(rows) +
        "</div>";
      return;
    }
    if (state === "empty") {
      el.innerHTML =
        '<div class="empty-state"><div class="empty-title">' +
        esc(o.title || "沒有符合的資料") +
        "</div>" +
        (o.hint ? '<div class="empty-hint">' + esc(o.hint) + "</div>" : "") +
        (o.actionLabel
          ? '<button type="button" class="btn" data-action="empty">' +
            esc(o.actionLabel) +
            "</button>"
          : "") +
        "</div>";
      const b = el.querySelector('[data-action="empty"]');
      if (b && o.onAction) b.addEventListener("click", o.onAction);
      return;
    }
    if (state === "error") {
      el.innerHTML =
        '<div class="banner banner-error" role="alert"><span>' +
        esc(o.message || "資料載入失敗") +
        '</span><button type="button" class="btn btn-secondary" data-action="retry">重試</button></div>';
      const b = el.querySelector('[data-action="retry"]');
      if (b && o.onRetry) b.addEventListener("click", o.onRetry);
    }
  }

  const api = { loadJSON, renderState };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.UIData = api;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd tests/ui && npm run test:unit`
Expected: PASS (contrast + 6 data tests).

- [ ] **Step 5: Use `UIData.renderState` in the gallery and test it**

In `docs/ui-gallery.html` replace the whole trailing `<script>…</script>` block with:
```html
    <script src="assets/data.js"></script>
    <script>
      UIData.renderState(document.getElementById("state-skeleton"), "loading");
      UIData.renderState(document.getElementById("state-empty"), "empty", {
        title: "沒有符合的資料",
        hint: "請調整篩選條件",
        actionLabel: "重設篩選",
        onAction: () => (document.body.dataset.reset = "1"),
      });
      UIData.renderState(document.getElementById("state-error"), "error", {
        message: "資料載入失敗",
        onRetry: () => (document.body.dataset.retried = "1"),
      });
    </script>
```
Append to `tests/ui/gallery.spec.js`:
```js
test("renderState wires retry and empty-state actions", async ({ page }) => {
  await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
  await page.locator("#state-error [data-action=retry]").click();
  await expect(page.locator("body")).toHaveAttribute("data-retried", "1");
  await page.locator("#state-empty [data-action=empty]").click();
  await expect(page.locator("body")).toHaveAttribute("data-reset", "1");
  await expect(page.locator("#state-skeleton .skeleton")).toHaveCount(4);
});

test("renderState escapes message text", async ({ page }) => {
  await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    UIData.renderState(document.getElementById("state-error"), "error", {
      message: "<img src=x onerror=window.__pwned=1>",
    });
  });
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(page.locator("#state-error span")).toContainText("<img");
});
```

- [ ] **Step 6: Run and commit**

Run: `cd tests/ui && npx playwright test gallery.spec.js --project=desktop`
Expected: PASS (3 tests).
```bash
git add docs/assets/data.js docs/ui-gallery.html tests/ui/unit/data.test.js tests/ui/gallery.spec.js
git commit -m "feat(ui): add data.js loader with retry/timeout and state renderer"
```

---

### Task 4: `shell.js` — header, mega-menu, search, footer, stale banner

**Files:**
- Create: `docs/assets/shell.js`, `tests/ui/unit/shell.test.js`, `tests/ui/shell.spec.js`
- Modify: `docs/ui-gallery.html` (add shell script)

**Interfaces:**
- Consumes: `UIData.loadJSON(url)` from Task 3 (falls back to `fetch` if absent); `ui.css` classes from Task 2.
- Produces: global `Shell` / `module.exports` = `{ NAV, searchPages(query, nav, limit?) → [{score,href,label,desc,group}], searchStocks(query, stocksObj, limit?) → [{score,id,name,type}], latestDate(manifest) → "YYYY-MM-DD"|null, isStale(latestISO, todayISO, maxDays=3) → boolean (false when latestISO is null), mount() }`; DOM contract: `<header id="site-header">` is filled; `<footer id="site-footer">` is created if missing; first `.container/.page/main` gets `id="main"` if it has none. Also defines `window.NerdGrid` shim (`initThemeToggle`, `initNav`, `initNavDropdowns`, `initFooter`, `onThemeChange` no-ops; `currentTheme()` → `"light"`; `chartColors()` → `ChartTheme.colors()` or `{}`) **only if** `window.NerdGrid` is undefined.

- [ ] **Step 1: Write the failing unit tests `tests/ui/unit/shell.test.js`**

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tests/ui && npm run test:unit`
Expected: FAIL — `Cannot find module '../../../docs/assets/shell.js'`.

- [ ] **Step 3: Write `docs/assets/shell.js`**

```js
(function (global) {
  "use strict";

  // Single source of truth for site navigation. Adding a page = one entry.
  const NAV = [
    {
      label: "市場",
      items: [
        { href: "twse.html", label: "上市", desc: "上市大盤與個股行情" },
        { href: "tpex.html", label: "上櫃", desc: "上櫃大盤與個股行情" },
        { href: "index.html", label: "全部", desc: "上市＋上櫃整合大盤" },
      ],
    },
    {
      label: "策略",
      items: [
        { href: "punish.html", label: "處置股票", desc: "最新處置股票名單" },
        { href: "volume-candle.html", label: "爆量長紅黑K", desc: "爆量長紅／長黑 K 線個股" },
        { href: "gap.html", label: "跳空漲跌", desc: "開盤跳空強弱勢個股" },
        { href: "wantgoo.html", label: "基本面", desc: "Wantgoo 基本面數據排行" },
        { href: "volatility.html", label: "區間波動率", desc: "區間日／年化波動率與漲跌" },
        { href: "vcp.html", label: "VCP選股", desc: "收縮型態（VCP）選股" },
      ],
    },
    {
      label: "權證",
      items: [
        { href: "premium-warrant.html", label: "精選權證", desc: "精選權證清單" },
        { href: "warrant-filter.html", label: "權證篩選", desc: "依條件篩選權證" },
      ],
    },
    {
      label: "選股",
      items: [
        { href: "screener.html", label: "股票篩選", desc: "區間漲跌幅與成交量排行" },
        { href: "watchlist.html", label: "精選類股", desc: "依類股瀏覽精選股票" },
      ],
    },
    {
      label: "個人",
      items: [
        { href: "bookmark.html", label: "常用連結", desc: "常用外部連結" },
        { href: "portfolio.html", label: "持股試算", desc: "持股損益試算" },
      ],
    },
    {
      label: "當沖",
      items: [
        { href: "day-trade-calculator.html", label: "當沖計算機", desc: "當沖損益與成本試算" },
        { href: "xiaoge-strategy.html", label: "小哥策略", desc: "小哥當沖策略選股" },
      ],
    },
  ];

  // ---- pure helpers (unit tested) -----------------------------------------

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalize(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, "");
  }

  function searchPages(query, nav, limit) {
    const q = normalize(query);
    if (!q) return [];
    const out = [];
    nav.forEach((g) =>
      g.items.forEach((it) => {
        const label = normalize(it.label);
        const desc = normalize(it.desc);
        const file = normalize(it.href);
        let score = 0;
        if (label === q) score = 100;
        else if (label.startsWith(q)) score = 80;
        else if (label.includes(q)) score = 60;
        else if (file.includes(q)) score = 40;
        else if (desc.includes(q)) score = 20;
        if (score)
          out.push({ score, href: it.href, label: it.label, desc: it.desc, group: g.label });
      }),
    );
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit || 5);
  }

  // stocks: object keyed by code => { name, type }
  function searchStocks(query, stocks, limit) {
    const q = normalize(query);
    if (!q || !stocks) return [];
    const out = [];
    for (const id of Object.keys(stocks)) {
      const info = stocks[id] || {};
      const code = id.toLowerCase();
      const name = normalize(info.name);
      let score = 0;
      if (code === q) score = 100;
      else if (code.startsWith(q)) score = 80;
      else if (name.startsWith(q)) score = 70;
      else if (name.includes(q)) score = 50;
      if (score) out.push({ score, id, name: info.name || "", type: info.type });
    }
    out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return out.slice(0, limit || 8);
  }

  function latestDate(manifest) {
    let best = "";
    ["twse", "tpex"].forEach((m) => {
      const arr = manifest && manifest[m] && manifest[m].daily_price;
      if (Array.isArray(arr)) arr.forEach((d) => { if (typeof d === "string" && d > best) best = d; });
    });
    return best || null;
  }

  function isStale(latestISO, todayISO, maxDays) {
    if (!latestISO) return false;
    const ms = Date.parse(todayISO + "T00:00:00Z") - Date.parse(latestISO + "T00:00:00Z");
    return ms / 86400000 > (maxDays == null ? 3 : maxDays);
  }

  const api = { NAV, searchPages, searchStocks, latestDate, isStale };

  // ---- DOM (browser only) ---------------------------------------------------

  if (typeof document !== "undefined") {
    let overlay = null;
    let stockCache = null;
    let stockError = false;
    let selected = 0;
    let items = [];
    let opener = null;

    const loadJSON = (url) =>
      global.UIData
        ? global.UIData.loadJSON(url)
        : fetch(url).then((r) => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          });

    function currentPage() {
      const p = location.pathname;
      return p.substring(p.lastIndexOf("/") + 1) || "index.html";
    }

    function todayTaipei() {
      return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
    }

    function headerHtml(current) {
      const groups = NAV.map((g, i) => {
        const active = g.items.some((it) => it.href === current);
        return `<button class="nav-group-btn${active ? " active" : ""}" type="button" aria-expanded="false" aria-controls="mega-${i}">${esc(g.label)}</button>`;
      }).join("");
      const panels = NAV.map(
        (g, i) =>
          `<div class="mega" id="mega-${i}" hidden><div class="mega-grid">${g.items
            .map(
              (it) =>
                `<a class="mega-item${it.href === current ? " active" : ""}" href="${it.href}"${it.href === current ? ' aria-current="page"' : ""}><b>${esc(it.label)}</b><span>${esc(it.desc)}</span></a>`,
            )
            .join("")}</div></div>`,
      ).join("");
      const drawer = NAV.map(
        (g) =>
          `<details${g.items.some((it) => it.href === current) ? " open" : ""}><summary>${esc(g.label)}</summary>${g.items
            .map((it) => `<a href="${it.href}"${it.href === current ? ' class="active"' : ""}>${esc(it.label)}</a>`)
            .join("")}</details>`,
      ).join("");
      return `<a class="skip-link" href="#main">跳到主要內容</a>
        <div class="site-header-inner">
          <a class="brand" href="index.html"><img src="assets/logo.png" alt="" onerror="this.remove()"><span>Market Observer</span></a>
          <nav class="site-nav" aria-label="主選單">${groups}</nav>
          <button class="search-btn" type="button" aria-label="搜尋" data-open-search><span>搜尋代號或頁面</span><kbd>⌘K</kbd></button>
          <button class="nav-toggle" type="button" aria-label="選單" aria-expanded="false" aria-controls="site-drawer">☰</button>
        </div>
        ${panels}
        <div class="drawer" id="site-drawer" hidden>${drawer}</div>`;
    }

    function closeMenus(host, returnFocus) {
      host.querySelectorAll(".nav-group-btn").forEach((b) => {
        if (b.getAttribute("aria-expanded") === "true") {
          b.setAttribute("aria-expanded", "false");
          if (returnFocus) b.focus();
        }
      });
      host.querySelectorAll(".mega").forEach((m) => { m.hidden = true; });
    }

    function bindMenus(host) {
      host.querySelectorAll(".nav-group-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const wasOpen = btn.getAttribute("aria-expanded") === "true";
          closeMenus(host, false);
          if (!wasOpen) {
            btn.setAttribute("aria-expanded", "true");
            document.getElementById(btn.getAttribute("aria-controls")).hidden = false;
          }
        });
      });
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".nav-group-btn") && !e.target.closest(".mega")) closeMenus(host, false);
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeMenus(host, true);
      });
    }

    function bindDrawer(host) {
      const toggle = host.querySelector(".nav-toggle");
      const drawer = host.querySelector("#site-drawer");
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        drawer.hidden = open;
      });
    }

    // ---- search -------------------------------------------------------------

    function ensureStocks() {
      if (stockCache || stockError) return Promise.resolve();
      return loadJSON("data/stock_info.json")
        .then((d) => { stockCache = d; })
        .catch(() => { stockError = true; });
    }

    function itemHtml(i, a, b, c) {
      return `<a class="search-item" role="option" id="sr-${i}" data-index="${i}" href="${items[i].href}" aria-selected="false"><span class="si-main">${a}</span><span class="si-sub">${b}</span><span class="si-tag">${c}</span></a>`;
    }

    function highlight() {
      overlay.querySelectorAll(".search-item").forEach((el) => {
        const on = Number(el.dataset.index) === selected;
        el.setAttribute("aria-selected", String(on));
        if (on) el.scrollIntoView({ block: "nearest" });
      });
    }

    function renderResults(q) {
      const box = overlay.querySelector("#search-results");
      items = [];
      if (!q.trim()) {
        box.innerHTML = '<div class="search-hint">輸入股票代號、名稱或頁面名稱</div>';
        return;
      }
      let html = "";
      const stocks = searchStocks(q, stockCache, 8);
      const pages = searchPages(q, NAV, 5);
      if (stocks.length) {
        html += '<div class="search-group">個股</div>';
        stocks.forEach((s) => {
          items.push({ href: "stock.html?id=" + encodeURIComponent(s.id) });
          const tag = s.type === "tpex" ? "上櫃" : s.type === "twse" ? "上市" : "";
          html += itemHtml(items.length - 1, esc(s.id), esc(s.name), tag);
        });
      }
      if (pages.length) {
        html += '<div class="search-group">頁面</div>';
        pages.forEach((p) => {
          items.push({ href: p.href });
          html += itemHtml(items.length - 1, esc(p.label), esc(p.desc), esc(p.group));
        });
      }
      if (!items.length) html = '<div class="search-hint">找不到符合的結果</div>';
      if (stockError) html += '<div class="search-hint">股票清單載入失敗，僅能搜尋頁面</div>';
      selected = 0;
      box.innerHTML = html;
      highlight();
    }

    function move(delta) {
      if (!items.length) return;
      selected = (selected + delta + items.length) % items.length;
      highlight();
    }

    function buildOverlay() {
      overlay = document.createElement("div");
      overlay.className = "search-overlay";
      overlay.hidden = true;
      overlay.innerHTML =
        '<div class="search-dialog" role="dialog" aria-modal="true" aria-label="搜尋">' +
        '<input id="search-input" type="text" autocomplete="off" placeholder="搜尋代號、股票名稱或頁面…" aria-controls="search-results">' +
        '<div id="search-results" class="search-results" role="listbox"></div></div>';
      document.body.appendChild(overlay);
      const input = overlay.querySelector("input");
      overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeSearch(); });
      input.addEventListener("input", () => renderResults(input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
        else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
        else if (e.key === "Enter") { e.preventDefault(); if (items[selected]) location.href = items[selected].href; }
        else if (e.key === "Tab") { e.preventDefault(); }
      });
    }

    function openSearch() {
      if (!overlay) buildOverlay();
      opener = document.activeElement;
      overlay.hidden = false;
      const input = overlay.querySelector("input");
      input.value = "";
      renderResults("");
      input.focus();
      ensureStocks().then(() => renderResults(input.value));
    }

    function closeSearch() {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      if (opener && opener.focus) opener.focus();
    }

    function bindShortcuts() {
      document.addEventListener("keydown", (e) => {
        const t = e.target;
        const typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
        if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "k") {
          e.preventDefault();
          if (overlay && !overlay.hidden) closeSearch();
          else openSearch();
          return;
        }
        // Pages that already bind "/" to their own #stock-search keep it.
        if (e.key === "/" && !typing && !document.getElementById("stock-search")) {
          e.preventDefault();
          openSearch();
        }
      });
    }

    // ---- footer + stale banner ----------------------------------------------

    function mountFooter() {
      let footer = document.getElementById("site-footer");
      if (!footer) {
        footer = document.createElement("footer");
        footer.id = "site-footer";
        document.body.appendChild(footer);
      }
      if (footer.dataset.mounted) return;
      footer.dataset.mounted = "1";
      footer.innerHTML = `<div class="footer-inner">
          <div><span class="footer-title">Market Observer 市場觀測站</span></div>
          <div class="footer-asof">資料日期載入中…</div>
          <div class="footer-disclaimer">本站資訊僅供參考，不構成任何投資建議，投資一定有風險，請謹慎評估並自行承擔投資決策之風險。<br>資料來源：臺灣證券交易所（TWSE）、證券櫃買中心（TPEx）公開資訊。</div>
          <div>© ${new Date().getFullYear()} Market Observer · <a href="https://github.com/mzuen/observe.market">GitHub</a></div>
        </div>`;
    }

    function setAsOf(d) {
      const el = document.querySelector(".footer-asof");
      if (el) el.textContent = d ? "資料截至 " + d : "資料日期暫時無法取得";
    }

    function showStale(d) {
      try {
        if (sessionStorage.getItem("stale-dismissed") === d) return;
      } catch (e) { /* storage blocked: show the banner anyway */ }
      const host = document.getElementById("site-header");
      if (!host || document.querySelector(".banner-warn")) return;
      const el = document.createElement("div");
      el.className = "banner banner-warn";
      el.setAttribute("role", "status");
      el.innerHTML = `<span>資料最後更新於 ${esc(d)}，可能因休市或更新延遲而非最新資料。</span><button type="button" class="banner-close" aria-label="關閉">✕</button>`;
      host.insertAdjacentElement("afterend", el);
      el.querySelector("button").addEventListener("click", () => {
        el.remove();
        try { sessionStorage.setItem("stale-dismissed", d); } catch (e) { /* ignore */ }
      });
    }

    function loadManifestInfo() {
      return loadJSON("data/manifest.json")
        .then((m) => {
          const d = latestDate(m);
          setAsOf(d);
          if (isStale(d, todayTaipei())) showStale(d);
        })
        .catch(() => setAsOf(null));
    }

    // ---- mount ------------------------------------------------------------------

    function mount() {
      const host = document.getElementById("site-header");
      if (host && !host.dataset.mounted) {
        host.dataset.mounted = "1";
        host.innerHTML = headerHtml(currentPage());
        const main = document.querySelector("#main, .container, .page, main");
        if (main && !main.id) main.id = "main";
        bindMenus(host);
        bindDrawer(host);
        host.querySelector("[data-open-search]").addEventListener("click", openSearch);
        bindShortcuts();
      }
      mountFooter();
      loadManifestInfo();
    }

    api.mount = mount;

    if (!global.NerdGrid) {
      global.NerdGrid = {
        initThemeToggle() {},
        initNav() {},
        initNavDropdowns() {},
        initFooter() {},
        onThemeChange() {},
        currentTheme() { return "light"; },
        chartColors() { return global.ChartTheme ? global.ChartTheme.colors() : {}; },
      };
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Shell = api;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `cd tests/ui && npm run test:unit`
Expected: PASS (contrast + data + 12 shell tests).

- [ ] **Step 5: Add the shell to the gallery**

In `docs/ui-gallery.html`, directly after the line `<script src="assets/data.js"></script>` add `<script src="assets/shell.js"></script>`; remove the hard-coded empty `<footer id="site-footer"></footer>` line (the shell creates it).

- [ ] **Step 6: Write the failing browser tests `tests/ui/shell.spec.js`**

```js
const { test, expect } = require("@playwright/test");

const STALE_MANIFEST = {
  twse: { daily_price: ["2020-01-01"] },
  tpex: { daily_price: ["2020-01-01"] },
};

test.describe("desktop shell", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  test("renders six groups and opens/closes a mega-menu", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    const buttons = page.locator("#site-header .nav-group-btn");
    await expect(buttons).toHaveCount(6);
    const strategy = buttons.nth(1);
    await strategy.click();
    await expect(strategy).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#mega-1 .mega-item")).toHaveCount(6);
    await page.keyboard.press("Escape");
    await expect(strategy).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#mega-1")).toBeHidden();
    await expect(strategy).toBeFocused();
  });

  test("Ctrl+K search finds a stock and Enter navigates to stock.html?id=", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await expect(page.locator(".search-overlay")).toBeVisible();
    await page.locator("#search-input").fill("2330");
    await expect(page.locator(".search-item").first()).toContainText("2330");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/stock\.html\?id=2330$/);
  });

  test("search finds pages by name", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.locator("[data-open-search]").click();
    await page.locator("#search-input").fill("跳空");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/gap\.html$/);
  });

  test("lowercase letter-suffixed code is found", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.locator("#search-input").fill("00835b");
    await expect(page.locator(".search-item").first()).toContainText("00835B");
  });

  test("hostile search text injects nothing and shows no-result", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.locator("#search-input").fill("<img src=x onerror=window.__pwned=1>");
    await expect(page.locator(".search-hint")).toContainText("找不到");
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    for (const q of [".*", "(", "\\", "[a-"]) {
      await page.locator("#search-input").fill(q);
      await expect(page.locator("#search-results")).toBeVisible();
    }
  });

  test("stock_info failure still allows page search with a notice", async ({ page }) => {
    await page.route("**/data/stock_info.json", (r) => r.fulfill({ status: 500, body: "x" }));
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.locator("#search-input").fill("vcp");
    await expect(page.locator(".search-item").first()).toContainText("VCP");
    await expect(page.locator("#search-results")).toContainText("股票清單載入失敗");
  });

  test("manifest failure keeps the header and shows an unavailable date", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/data/manifest.json", (r) => r.fulfill({ status: 404, body: "no" }));
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await expect(page.locator("#site-header .nav-group-btn")).toHaveCount(6);
    await expect(page.locator(".footer-asof")).toHaveText("資料日期暫時無法取得");
    expect(errors).toEqual([]);
  });

  test("invalid manifest JSON is handled", async ({ page }) => {
    await page.route("**/data/manifest.json", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "{not json" }),
    );
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await expect(page.locator(".footer-asof")).toHaveText("資料日期暫時無法取得");
  });

  test("stale banner appears, dismisses, and survives blocked sessionStorage", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", {
        get() { throw new Error("blocked"); },
      });
    });
    await page.route("**/data/manifest.json", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STALE_MANIFEST) }),
    );
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    const banner = page.locator("#site-header + .banner-warn");
    await expect(banner).toContainText("2020-01-01");
    await expect(page.locator(".footer-asof")).toHaveText("資料截至 2020-01-01");
    await banner.locator("button").click();
    await expect(banner).toHaveCount(0);
  });

  test("/ does not open global search on pages that own #stock-search", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.evaluate(() => {
      const i = document.createElement("input");
      i.id = "stock-search";
      i.style.display = "none";
      document.body.appendChild(i);
    });
    await page.keyboard.press("/");
    await expect(page.locator(".search-overlay")).toHaveCount(0);
  });
});

test.describe("mobile shell", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile");
  });

  test("hamburger opens the drawer and nav buttons are hidden", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await expect(page.locator("#site-header .site-nav")).toBeHidden();
    await page.locator(".nav-toggle").click();
    await expect(page.locator("#site-drawer")).toBeVisible();
    await expect(page.locator("#site-drawer a").first()).toBeVisible();
  });

  test("320px width does not overflow horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("search opens full-screen on mobile", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.locator("[data-open-search]").click();
    const box = await page.locator(".search-dialog").boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(388);
  });
});
```

- [ ] **Step 7: Run browser tests, fix until green**

Run: `cd tests/ui && npx playwright test shell.spec.js`
Expected: PASS on both projects (desktop group + mobile group). If the 320px test fails, the cause is in `.site-header-inner` (reduce `gap`/`padding` in `ui.css`) or the gallery's `.filter-pill` row; fix the CSS, not the test.

- [ ] **Step 8: Commit**

```bash
git add docs/assets/shell.js docs/ui-gallery.html tests/ui/unit/shell.test.js tests/ui/shell.spec.js
git commit -m "feat(ui): add shared shell with mega-menu, global search, footer and stale banner"
```

---

### Task 5: `chart-theme.js` and `ui-table.js`

**Files:**
- Create: `docs/assets/chart-theme.js`, `docs/assets/ui-table.js`, `tests/ui/unit/ui-table.test.js`
- Modify: `docs/ui-gallery.html`, `tests/ui/gallery.spec.js`

**Interfaces:**
- Produces: `ChartTheme.colors() → {seriesA, seriesB, seriesC, gridH, gridV, tick, up, down, tooltipBg, tooltipBorder, tooltipText}` (same key names as the old `NerdGrid.chartColors()` plus `seriesC`).
- Produces: `UITable` (also `module.exports`): `sortRows(rows, key, dir="asc"|"desc") → new array` (null/undefined last, numbers numeric, strings by `localeCompare("zh-TW")`), `filterRows(rows, text, keys[]) → new array` (case-insensitive substring over `keys`; empty text returns all), `paginate(rows, page, size) → {rows, page, pages, total}` (page clamped to `[1, pages]`, `pages ≥ 1`), `fmtNum(n, digits=0) → "1,234.5"|"--"`, `fmtPct(n, digits=2) → "+1.24%"|"−0.31%"|"--"`, `changeClass(n) → "price-up"|"price-down"|""`.

- [ ] **Step 1: Write the failing test `tests/ui/unit/ui-table.test.js`**

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tests/ui && npm run test:unit`
Expected: FAIL — `Cannot find module '../../../docs/assets/ui-table.js'`.

- [ ] **Step 3: Write `docs/assets/ui-table.js`**

```js
(function (root) {
  "use strict";

  const isNil = (v) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));

  function sortRows(rows, key, dir) {
    const sign = dir === "desc" ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (isNil(av) && isNil(bv)) return 0;
      if (isNil(av)) return 1;
      if (isNil(bv)) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
      return String(av).localeCompare(String(bv), "zh-TW") * sign;
    });
  }

  function filterRows(rows, text, keys) {
    const q = String(text == null ? "" : text).trim().toLowerCase();
    if (!q) return rows.slice();
    return rows.filter((r) =>
      keys.some((k) => !isNil(r[k]) && String(r[k]).toLowerCase().includes(q)),
    );
  }

  function paginate(rows, page, size) {
    const total = rows.length;
    const per = Math.max(1, size | 0);
    const pages = Math.max(1, Math.ceil(total / per));
    const p = Math.min(Math.max(1, page | 0), pages);
    return { rows: rows.slice((p - 1) * per, p * per), page: p, pages, total };
  }

  function fmtNum(n, digits) {
    if (isNil(n)) return "--";
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0,
    });
  }

  function fmtPct(n, digits) {
    if (isNil(n)) return "--";
    const d = digits == null ? 2 : digits;
    const body = Math.abs(n).toFixed(d) + "%";
    if (Number(n.toFixed(d)) === 0) return (0).toFixed(d) + "%";
    return (n > 0 ? "+" : "−") + body;
  }

  function changeClass(n) {
    if (isNil(n) || n === 0) return "";
    return n > 0 ? "price-up" : "price-down";
  }

  const api = { sortRows, filterRows, paginate, fmtNum, fmtPct, changeClass };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.UITable = api;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd tests/ui && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Write `docs/assets/chart-theme.js`**

```js
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

  // Same key names as the old NerdGrid.chartColors(), so call sites only
  // change the receiver. Reads tokens at call time so a future dark theme works.
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
```

- [ ] **Step 6: Add a gallery test for `ChartTheme`, and wire scripts**

In `docs/ui-gallery.html` add after the `shell.js` script tag:
```html
    <script src="assets/chart-theme.js"></script>
    <script src="assets/ui-table.js"></script>
```
Append to `tests/ui/gallery.spec.js`:
```js
test("ChartTheme reads tokens and UITable is available", async ({ page }) => {
  await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
  const c = await page.evaluate(() => ChartTheme.colors());
  expect(c.up).toBe("#c0262d");
  expect(c.down).toBe("#16794a");
  expect(c.seriesA).toBe("#3b5bdb");
  for (const k of ["gridH", "gridV", "tick", "tooltipBg", "tooltipBorder", "tooltipText"]) {
    expect(c[k], k).toBeTruthy();
  }
  expect(await page.evaluate(() => UITable.fmtPct(1.5))).toBe("+1.50%");
});
```

- [ ] **Step 7: Run and commit**

Run: `cd tests/ui && npm run test:unit && npx playwright test gallery.spec.js shell.spec.js`
Expected: PASS.
```bash
git add docs/assets/chart-theme.js docs/assets/ui-table.js docs/ui-gallery.html tests/ui/unit/ui-table.test.js tests/ui/gallery.spec.js
git commit -m "feat(ui): add chart-theme.js and ui-table.js helpers"
```

---

### Task 6: Migrate `twse.html` and `tpex.html` onto a shared `market-page.js`

`twse.html` and `tpex.html` are 995 lines each and differ by only 6 lines (the `currentMarket` value and the cross-redirect). This task collapses the shared inline script into `docs/assets/market-page.js` and turns both HTML files into thin, themed pages.

**Files:**
- Create: `docs/assets/market-page.js`
- Modify: `docs/twse.html`, `docs/tpex.html`, `tests/ui/migrated.json`

**Interfaces:**
- Consumes: `Shell`, `UIData`, `ChartTheme` (Tasks 3–5); Chart.js 4.4.7 global `Chart`.
- Produces: `market-page.js` reads `document.body.dataset.market` (`"twse"` | `"tpex"`). All element IDs used by the old inline script stay unchanged.

- [ ] **Step 1: Write the failing check**

Edit `tests/ui/migrated.json` to `["twse.html", "tpex.html"]`.
Run: `cd tests/ui && npx playwright test smoke.spec.js -g "twse.html|tpex.html"`
Expected: FAIL — `#site-header .brand` not found / `nerd-grid` references present.

- [ ] **Step 2: Prove the two pages really are equivalent**

Run: `diff docs/twse.html docs/tpex.html`
Expected output is exactly the three hunks `let currentMarket = "…"`, and the two `marketParam === "…"` / `window.location.href = "….html"` lines. If there is any other difference, stop and carry it into `market-page.js` as an explicit `data-*` attribute on `<body>`.

- [ ] **Step 3: Create `docs/assets/market-page.js`**

Extract the inline script from `docs/twse.html`: it is the contents of the **second** `<script>` element (the one beginning `NerdGrid.initThemeToggle();` right after `<script src="assets/nerd-grid.js"></script>`), through its closing `</script>`. Save it as `docs/assets/market-page.js` and apply exactly these edits:

1. Delete the two lines `NerdGrid.initThemeToggle();` and `NerdGrid.initNav();`.
2. Replace `let currentMarket = "twse";` with `let currentMarket = document.body.dataset.market;`.
3. Replace the block
   ```js
   if (marketParam === "tpex") {
     window.location.href = "tpex.html";
     return;
   } else if (marketParam === "warrant") {
     window.location.href = "premium-warrant.html";
     return;
   }
   ```
   with
   ```js
   if (marketParam === "warrant") {
     window.location.href = "premium-warrant.html";
     return;
   }
   if (
     (marketParam === "twse" || marketParam === "tpex") &&
     marketParam !== currentMarket
   ) {
     window.location.href = marketParam + ".html";
     return;
   }
   ```
4. Delete the line `NerdGrid.onThemeChange(() => renderChart(indexData));`.
5. Replace every `NerdGrid.chartColors(` call (find with `grep -n "NerdGrid" docs/assets/market-page.js`) by `ChartTheme.colors(` and drop its argument. The command `grep -n "NerdGrid" docs/assets/market-page.js` must print nothing afterwards.

- [ ] **Step 4: Convert `docs/twse.html`**

Apply Migration Recipe R1–R3 with these page-specific values:
- R2 title: `上市大盤`, subtitle: `TWSE 加權指數、個股行情、跳空漲跌與處置股`. The old header's `date-picker` and `last-update` map to the `page-actions` block.
- In `<head>` replace `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>` with `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>`.
- Add `data-market="twse"` to `<body>`.
- Replace the whole pagination `<div id="pagination-controls" style="…">…</div>` block (the one containing `prev-page`, `page-info`, `next-page`) with:
  ```html
  <div id="pagination-controls" class="pagination">
    <button id="prev-page" class="btn btn-secondary">上一頁</button>
    <span id="page-info">第 1 / 1 頁</span>
    <button id="next-page" class="btn btn-secondary">下一頁</button>
  </div>
  ```
- Replace the two `<script src="assets/nerd-grid.js"></script>` + inline `<script>…</script>` elements at the bottom with:
  ```html
  <script src="assets/data.js"></script>
  <script src="assets/chart-theme.js"></script>
  <script src="assets/ui-table.js"></script>
  <script src="assets/shell.js"></script>
  <script src="assets/market-page.js"></script>
  ```
- R5: in the page `<style>` (22 lines) delete rules duplicated by `ui.css`; keep anything specific to this page's `market-tab`/layout.

- [ ] **Step 5: Convert `docs/tpex.html`** — identical to Step 4 except R2 title `上櫃大盤`, subtitle `TPEx 櫃買指數、個股行情、跳空漲跌與處置股`, and `data-market="tpex"`.

- [ ] **Step 6: Run the smoke tests**

Run: `cd tests/ui && npx playwright test smoke.spec.js -g "twse.html|tpex.html"`
Expected: PASS on desktop and mobile.

- [ ] **Step 7: Behavior checks (browser, manual)**

Serve with `cd tests/ui && node serve.js`, open `http://127.0.0.1:4173/twse.html` and confirm: index chart renders; date picker lists dates newest-first and changing it reloads table, gap list and punish list; search box filters; sort by clicking a header; pagination buttons; `/` focuses `#stock-search` (not the global search); `twse.html?market=tpex` redirects to `tpex.html`; `tpex.html?market=twse` redirects to `twse.html`; `?market=warrant` goes to `premium-warrant.html`. View `tests/ui/test-results/shots/{desktop,mobile}/twse.png` per R6.

- [ ] **Step 8: Commit**

```bash
git add docs/assets/market-page.js docs/twse.html docs/tpex.html tests/ui/migrated.json
git commit -m "feat(ui): migrate twse/tpex to ui.css + shell with shared market-page.js"
```

---

### Task 7: Migrate `index.html` and `stock.html`

**Files:**
- Modify: `docs/index.html`, `docs/stock.html`, `tests/ui/migrated.json`

- [ ] **Step 1: Failing check**

Append `"index.html"` and `"stock.html"` to `tests/ui/migrated.json`.
Run: `cd tests/ui && npx playwright test smoke.spec.js -g "index.html|stock.html"`
Expected: FAIL on the shell assertions.

- [ ] **Step 2: Migrate `index.html`**

Apply Migration Recipe R1–R6 with:
- R2 title `全市場大盤`, subtitle `上市／上櫃大盤指數、個股行情與市場摘要`. Keep the **existing** `<h1>`-less tagline text (`台股即時數據觀測平台`) out of the page body — it now lives in the footer/meta.
- Pin Chart.js: `https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js`.
- The page keeps its own inline script (it has the all-markets `market-tab` logic that differs from `twse`/`tpex`). Apply R4 only: `grep -n "NerdGrid" docs/index.html` must show nothing afterwards.
- Keep the page's `<meta>` description/OG/canonical tags untouched; update `<meta name="theme-color">` to `#f6f7fb`.
- Convert the `.ma-toggle` / `.ma-toggle-row` rules in the page `<style>` to the shared `.chip` / `.chip.active` classes: change the buttons' `class="ma-toggle"` to `class="chip"`, make the JS toggle `active` on `.chip`, and delete the `.ma-toggle*` rules. (Search the inline script for `ma-toggle` and update every selector.)

- [ ] **Step 3: Migrate `stock.html`**

Apply R1–R6 with:
- R2 title: leave the title text empty in markup and let the existing script that sets the stock name fill `#…` — **before editing**, run `grep -n "h1\|document.title\|stock-name\|stock-title" docs/stock.html` and keep whichever element currently shows the code and name, moving it into `.page-title`.
- `stock.html` loads `lightweight-charts@4.2.3` (already pinned): keep it, it does not use `chart-theme.js`. Where the inline script hard-codes colours (search for `#`, `rgba(` and `NerdGrid.chartColors`), replace with `ChartTheme.colors().up` / `.down` / `.tick` / `.gridH` so candles follow the TW convention from the tokens.
- Keep the `?id=` handling untouched.
- Add `<script src="assets/chart-theme.js"></script>` before `shell.js`.

- [ ] **Step 4: Run and verify**

Run: `cd tests/ui && npx playwright test smoke.spec.js -g "index.html|stock.html"`
Expected: PASS.
Manual: `index.html` — both indexes plot, MA5/10/20 chips toggle lines, market summary updates with the date. `stock.html?id=2330` and `stock.html?id=00835B` — chart draws, range controls work, recent-trades table readable at 390px.

- [ ] **Step 5: Commit**

```bash
git add docs/index.html docs/stock.html tests/ui/migrated.json
git commit -m "feat(ui): migrate index and stock pages"
```

---

### Task 8: Migrate strategy batch A — `gap`, `volume-candle`, `xiaoge-strategy`, `punish`

**Files:**
- Modify: `docs/gap.html`, `docs/volume-candle.html`, `docs/xiaoge-strategy.html`, `docs/punish.html`, `tests/ui/migrated.json`

- [ ] **Step 1: Failing check**

Append the four filenames to `tests/ui/migrated.json`.
Run: `cd tests/ui && npx playwright test smoke.spec.js -g "gap.html|volume-candle.html|xiaoge-strategy.html|punish.html"`
Expected: FAIL on shell assertions.

- [ ] **Step 2: Migrate each page**

For each of the four pages apply Migration Recipe **R1–R6**. Page-specific values:

| Page | R2 title / subtitle | Notes |
|---|---|---|
| `gap.html` | `跳空漲跌` / `開盤跳空強弱勢個股` | 168-line page `<style>` and 8 inputs: convert the filter inputs to `.filter-pill` / `.toolbar`; keep input IDs. |
| `volume-candle.html` | `爆量長紅黑K` / `爆量長紅／長黑 K 線個股` | 8 inputs, red/black tab switcher: use `.tabs` / `.tab`. |
| `xiaoge-strategy.html` | `小哥策略` / `小哥當沖策略選股` | No inputs, no `<canvas>`: table only. |
| `punish.html` | `處置股票` / `最新處置股票名單` | Smallest page (279 lines); `tag-danger` markers keep working through `ui.css`. |

Loader markup `<div class="loader">載入中...</div>`: where the page's script sets an error message in `catch`, replace the `console.error`-only path with `UIData.renderState(el, "error", { message: "資料載入失敗", onRetry: <the page's existing load function> })`; where a table renders zero rows, call `UIData.renderState(el, "empty", { title: "沒有符合的資料", hint: "請調整日期或篩選條件" })`.

Date lists: the manifest arrays are newest-first; do not re-sort.

- [ ] **Step 3: Run and verify**

Run: `cd tests/ui && npx playwright test smoke.spec.js -g "gap.html|volume-candle.html|xiaoge-strategy.html|punish.html"`
Expected: PASS. Manual: on each page change the date, apply a filter that matches nothing (empty state shows), and in DevTools set the network to Offline then reload data (error banner with working Retry).

- [ ] **Step 4: Commit**

```bash
git add docs/gap.html docs/volume-candle.html docs/xiaoge-strategy.html docs/punish.html tests/ui/migrated.json
git commit -m "feat(ui): migrate gap, volume-candle, xiaoge and punish pages"
```

---

### Task 9: Migrate strategy batch B — `vcp`, `volatility`, `screener`, `wantgoo`

**Files:**
- Modify: `docs/vcp.html`, `docs/volatility.html`, `docs/screener.html`, `docs/wantgoo.html`, `tests/ui/migrated.json`

- [ ] **Step 1: Failing check**

Append the four filenames to `tests/ui/migrated.json`; run the `-g` smoke command for them. Expected: FAIL.

- [ ] **Step 2: Migrate each page (R1–R6)**

| Page | R2 title / subtitle | Notes |
|---|---|---|
| `vcp.html` | `VCP 選股` / `Minervini 收縮型態（VCP）篩選` | 330-line page `<style>`, 10 inputs; use `.toolbar` + `.filter-pill`. |
| `volatility.html` | `區間波動率` / `區間日／年化波動率與期間漲跌` | 287-line page `<style>`; purely client-side from daily snapshots. |
| `screener.html` | `股票篩選` / `區間漲跌幅、成交量與連續上漲天數排行` | 308-line page `<style>`; uses `<a href="stock.html?id=…" class="stock-link">`. |
| `wantgoo.html` | `基本面` / `Wantgoo 基本面數據排行` | **4 tables, 20 inputs, 3 selects**: treat each table as its own `.card` with `.table-container`; the tab/section switcher becomes `.tabs`. It builds a `URLSearchParams` request (line ~868): do not change that logic. |

Where a page re-implements sort/filter/paginate that is byte-for-byte the same as `UITable.sortRows` / `filterRows` / `paginate`, replace the local copy with the `UITable` call and add `<script src="assets/ui-table.js"></script>` before `shell.js`. Where the local logic differs in any way (different null ordering, different tie-break), **leave it alone** and do not force the helper in.

Apply the same `UIData.renderState` empty/error handling as Task 8, Step 2.

- [ ] **Step 3: Run and verify**

Run the `-g` smoke command for the four pages. Expected: PASS. Manual: each page's primary action (compute volatility for a date range, run the screener over a range, run VCP, switch every `wantgoo` tab) produces the same results as on `main` (open `main` in a second checkout or the live site for comparison and compare the top 5 rows).

- [ ] **Step 4: Commit**

```bash
git add docs/vcp.html docs/volatility.html docs/screener.html docs/wantgoo.html tests/ui/migrated.json
git commit -m "feat(ui): migrate vcp, volatility, screener and wantgoo pages"
```

---

### Task 10: Migrate warrants — `warrant-filter`, `premium-warrant`

**Files:**
- Modify: `docs/warrant-filter.html`, `docs/premium-warrant.html`, `tests/ui/migrated.json`

- [ ] **Step 1: Failing check** — append both filenames to `tests/ui/migrated.json`; run the `-g` smoke command; expected FAIL.

- [ ] **Step 2: Migrate (R1–R6)**

| Page | R2 title / subtitle | Notes |
|---|---|---|
| `warrant-filter.html` | `權證篩選` / `依條件篩選權證` | 13 inputs: group into a `.toolbar` of `.filter-pill`s; large result table needs `.table-container.sticky`. |
| `premium-warrant.html` | `精選權證` / `精選權證清單` | Reads `data/warrant/<date>.json`; also reachable via `twse.html?market=warrant` redirect (Task 6) — keep the filename. |

Apply `UIData.renderState` empty/error handling as in Task 8, Step 2.

- [ ] **Step 3: Run, verify, commit**

Run the `-g` smoke command for both pages; expected PASS. Manual: set filters to an impossible range → empty state; table headers stay visible while scrolling vertically.
```bash
git add docs/warrant-filter.html docs/premium-warrant.html tests/ui/migrated.json
git commit -m "feat(ui): migrate warrant pages"
```

---

### Task 11: Migrate tools — `day-trade-calculator`, `portfolio`

**Files:**
- Modify: `docs/day-trade-calculator.html`, `docs/portfolio.html`, `tests/ui/migrated.json`

- [ ] **Step 1: Failing check** — append both filenames to `tests/ui/migrated.json`; run the `-g` smoke command; expected FAIL.

- [ ] **Step 2: Migrate (R1–R6)**

| Page | R2 title / subtitle | Notes |
|---|---|---|
| `day-trade-calculator.html` | `當沖計算機` / `當沖損益與成本試算` | 358-line page `<style>`. Layout: `.grid` with inputs in the left `.card`, results in the right `.card` (stacks below 1024px). Both pages fetch `data/stock_info.json` — it is an **object keyed by code**; leave that code alone. |
| `portfolio.html` | `持股試算` / `持股損益試算` | 265-line page `<style>`. Persisted holdings (if the page uses `localStorage`) must keep the same keys so existing user data survives. Run `grep -n "localStorage" docs/portfolio.html` before editing and do not rename any key. |

No `date-picker` on these pages: omit `.page-actions` (R2).

- [ ] **Step 3: Run, verify, commit**

Run the `-g` smoke command; expected PASS. Manual: enter a sample trade in the calculator and compare the numbers with `main`; in `portfolio.html` add a holding, reload, confirm it persists and a holding saved on `main` still loads.
```bash
git add docs/day-trade-calculator.html docs/portfolio.html tests/ui/migrated.json
git commit -m "feat(ui): migrate day-trade-calculator and portfolio pages"
```

---

### Task 12: Migrate collections — `bookmark`, `watchlist`

**Files:**
- Modify: `docs/bookmark.html`, `docs/watchlist.html`, `tests/ui/migrated.json`

- [ ] **Step 1: Inspect before editing (required)**

Run: `grep -c "" docs/watchlist.html && awk '/<style>/{s=1} s{n++} /<\/style>/{s=0} END{print n" style lines"}' docs/watchlist.html && grep -n "const .* = \[\|const .* = {" docs/watchlist.html | head -20`
Decide and record in the commit message: (a) does `watchlist.html` embed a large literal data structure inside the HTML? If **yes** and it is more than ~300 lines, move that literal to `docs/data/…`-style static file **outside** `docs/data/` (e.g. `docs/assets/watchlist-data.js` assigning `window.WATCHLIST_DATA = …`) so the view and data are separate. If **no**, do a re-skin only. Do not change any data values.

- [ ] **Step 2: Failing check** — append both filenames to `tests/ui/migrated.json`; run the `-g` smoke command; expected FAIL.

- [ ] **Step 3: Migrate (R1–R6)**

| Page | R2 title / subtitle | Notes |
|---|---|---|
| `bookmark.html` | `常用連結` / `常用外部連結` | Calls an external API (`API_BASE` + `/api/mktobs/bookmark`); that is not a same-origin request, so smoke ignores it. Keep the call; render failure with `UIData.renderState(el, "error", …)`. |
| `watchlist.html` | `精選類股` / `依類股瀏覽精選股票` | 748-line page `<style>`; sidebar of sections becomes a `.card` list with `.list-item`; items become cards in `.grid`. Fetches `data/concept/stock_concepts.json` and `data/stock_info.json`. |

- [ ] **Step 4: Run, verify, commit**

Run the `-g` smoke command; expected PASS. Manual: every category in `watchlist.html` lists the same stocks as on `main`; at 390px the sidebar stacks above the grid.
```bash
git add docs/bookmark.html docs/watchlist.html tests/ui/migrated.json
git add docs/assets/watchlist-data.js 2>/dev/null || true
git commit -m "feat(ui): migrate bookmark and watchlist pages"
```

---

### Task 13: Remove the old theme and finish

**Files:**
- Delete: `docs/assets/nerd-grid.css`, `docs/assets/nerd-grid.js`
- Modify: `docs/assets/ui.css` (remove legacy aliases), `docs/assets/shell.js` (remove `NerdGrid` shim), `README.md`, `tests/ui/baseline-overflow.json`, `tests/ui/pages.json` (unchanged), `.gitignore` (if needed)

- [ ] **Step 1: Prove nothing still depends on the old theme**

Run:
```bash
git grep -n "nerd-grid\|NerdGrid" -- docs ':!docs/assets/shell.js'
git grep -n -- "--hud-" -- docs ':!docs/assets/ui.css'
```
Expected: both print nothing. If anything prints, finish migrating that file first (it is a missed R4/R5 item).

- [ ] **Step 2: Confirm every page is in `migrated.json`**

Run: `node -e "const p=require('./tests/ui/pages.json'),m=new Set(require('./tests/ui/migrated.json'));const miss=p.filter(f=>!m.has(f));console.log(miss.length?'MISSING '+miss:'all migrated');"`
Expected: `all migrated`.

- [ ] **Step 3: Delete the old files and the compat code**

```bash
git rm docs/assets/nerd-grid.css docs/assets/nerd-grid.js
```
In `docs/assets/ui.css` delete the whole `/* Legacy aliases … */` block (every `--hud-*` line inside `:root`).
In `docs/assets/shell.js` delete the `if (!global.NerdGrid) { … }` block.
Set `tests/ui/baseline-overflow.json` back to `{}` (all pages are migrated and strictly checked).

- [ ] **Step 4: Full verification**

Run: `cd tests/ui && npm run test:unit && npx playwright test`
Expected: all unit tests PASS; every smoke test PASS on desktop and mobile; gallery and shell specs PASS.
Then run `git grep -n "console.error" docs/*.html | head` only to eyeball that no new error-swallowing was introduced; and open `ui-gallery.html` once for a final visual pass.

- [ ] **Step 5: Update the README**

In `README.md`:
- In **專案特色**, replace the first bullet's UI description with: `現代化金融風格介面（Inter／Noto Sans TC），共用頂部導覽、全站搜尋（⌘K / Ctrl+K）與「資料截至」提示；支援手機版。`
- In **專案結構**, under `docs/assets/`, list: `ui.css`（設計系統）、`shell.js`（導覽／搜尋／頁尾）、`data.js`、`chart-theme.js`、`ui-table.js`、`market-page.js`，and add `ui-gallery.html`（元件展示，不在導覽中）and `tests/ui/`（Playwright 與單元測試）.
- Add a **UI 測試** section: `cd tests/ui && npm install && npx playwright install chromium && npm run test:unit && npm test`.

- [ ] **Step 6: Commit and open the PR**

```bash
git add -A docs README.md tests/ui
git commit -m "chore(ui): remove nerd-grid theme and legacy aliases; update README"
```
Then summarize for the owner: pages migrated, screenshots from `tests/ui/test-results/shots/`, and the unchanged-scope statement (no pipeline or data changes). Do not merge without the owner's review.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| §2 tokens, type, shape, components | Task 2 (`ui.css`, gallery, contrast test) |
| §3 shell: NAV, mega-menu, search, footer, stale banner, mobile, a11y | Task 4 |
| §3 skip link, `aria-expanded`, focus rings, contrast | Tasks 2, 4 |
| §4 templates and page mapping | Tasks 6–12 (market dashboard = 6–7; screener family = 8–10; detail = 7; tool = 11; collection = 12) |
| §4 `data.js`, `ui-table.js`, `chart-theme.js`, Chart.js pin | Tasks 3, 5, 6–7 |
| §5 loading / empty / error / stale states | Tasks 3, 4, applied in 8–12 |
| §6 gallery, Playwright smoke, manual checks | Tasks 1, 2, 4 and each migration task |
| §7 rollout order, rollback (old theme kept to the end) | Task order; Task 13 |
| §8 risks: unpinned Chart.js, twse/tpex drift, watchlist inspection | Task 6 Step 2 (diff proves equivalence), Task 7 (pin), Task 12 Step 1 (inspection) |

**Deviations from the spec, deliberate:**
- `ui-table.js` provides pure helpers and is adopted only where a page's local code is identical (Task 9). The spec's wording "replacing the hand-rolled copies" is narrowed so strategy-specific sort/filter behavior is never silently changed.
- The footer already existed (injected by `nerd-grid.js`); it is restyled and gains the "資料截至" line rather than being new.
- `--text-subtle` is restricted to placeholders/disabled text (Task 2 Step 9 amends the spec) because it measures 3.09:1.

**Placeholder scan:** no TBD/TODO. Per-page migration steps cite exact replacement markup, scripts and verification commands; page-specific inline `<style>` conversions are described by rule (R5), since they depend on each file's current contents.

**Type/name consistency:** `UIData.loadJSON/renderState`, `Shell.{NAV,searchPages,searchStocks,latestDate,isStale,mount}`, `ChartTheme.colors`, `UITable.{sortRows,filterRows,paginate,fmtNum,fmtPct,changeClass}` are defined once (Tasks 3–5) and referenced with the same names in Tasks 6–13. `tests/ui/migrated.json` is the single gate list.
