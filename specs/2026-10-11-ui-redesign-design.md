# UI Redesign — Design Spec

Date: 2026-10-11
Status: Draft for review
Scope: front end only (`docs/*.html`, `docs/assets/*`). The Python pipeline, `docs/data/` formats and strategy logic are out of scope.

## 1. Goal and decisions

The current "Nerd Grid" wireframe HUD look (monospace, uppercase letter-spaced titles, 2px corners, blue hairlines) does not match what the owner expects of a production site. The owner chose:

| Decision | Choice |
|---|---|
| Visual direction | **Modern fintech**: sans-serif, soft rounded cards, one accent colour, pill badges |
| Depth | **Full redesign**: design system, layout and navigation, page templates |
| Navigation | **Slim top bar + global search + mega-menu** |
| Technology | **Stay vanilla**: static HTML/CSS/JS, Chart.js via CDN, no build step, deployed from `docs/` |
| Rollout | **Foundation first, then page-by-page** on a branch, one commit per group |
| Theme | **Light only**, tokens structured so dark mode can be added later |

Success criteria:
- All 18 pages use one design system and one shell; no page carries its own header/nav markup.
- Every data-driven page shows consistent loading, empty, error and stale states.
- Pages work at 390px width with no horizontal page scroll.
- Existing URLs, data paths and strategy results are unchanged.

## 2. Design system (`docs/assets/ui.css`)

**Colour tokens** (CSS custom properties on `:root`):

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f6f7fb` | page background |
| `--surface` | `#ffffff` | cards, tables, header |
| `--border` | `#e3e6ee` | hairlines |
| `--text` | `#1c2333` | primary text |
| `--text-muted` | `#5b6478` | secondary text |
| `--text-subtle` | `#8a93a6` | captions, placeholders (large/auxiliary text only) |
| `--accent` / `--accent-soft` | `#3b5bdb` / `#edf2ff` | primary actions, active states |
| `--up` / `--up-soft` | `#c0262d` / `#fde8e8` | price up (TW convention: red = up) |
| `--down` / `--down-soft` | `#16794a` / `#e3f5ec` | price down (green = down) |
| `--warn` / `--warn-soft` | `#92600a` / `#fff7e0` | disposition tags, stale banner |

Price direction is always also conveyed with ▲/▼ or +/−, never colour alone.

**Typography:** Inter + Noto Sans TC (replaces JetBrains Mono). `font-variant-numeric: tabular-nums` on all numeric cells. Scale: 12 / 14 / 16 / 20 / 28 px, body line-height 1.6.

**Shape and spacing:** radius 8px (inputs, buttons), 12px (cards); card shadow `0 1px 3px rgba(20,30,60,.08)`; 4px spacing scale (4, 8, 12, 16, 24, 32).

**Components, each defined once:** button (primary/secondary), chip (default/active), ▲/▼ change pill, tag, search input, select, stat tile, data table (sticky header, sortable, numeric alignment), page header (title, subtitle, actions), filter toolbar, tabs, tooltip, empty state, loading skeleton, error banner, stale-data banner, footer.

## 3. Shell (`docs/assets/shell.js`)

Every page reduces to:

```html
<link rel="stylesheet" href="assets/ui.css">
<script src="assets/shell.js" defer></script>
<body data-page="gap.html">
  <header id="site-header"></header>
  <main class="page"> … </main>
  <footer id="site-footer"></footer>
```

Header and footer have reserved heights so content does not shift when the shell renders.

- **Single nav source:** a `NAV` array (group → pages, each with a label and one-line description) lives only in `shell.js`. It drives the mega-menu, the mobile drawer, the search page results, and active-page highlighting. Groups: 市場, 策略, 權證, 選股, 個人, 當沖 (17 pages today).
- **Header:** logo + title, six group buttons, search box (⌘K / `/`). A group opens a panel of page cards (name + description); Esc or outside click closes it. The date picker and "last updated" stay in each page's own header because they depend on page data.
- **Global search:** dialog with **Pages** (fuzzy match on label and description) and **Stocks** (code or name from `data/stock_info.json`, lazy-loaded on first open and cached). Enter on a stock goes to `stock.html?id=<code>`, the link format already used by every page. Arrow keys navigate, Esc closes, focus is trapped while open.
- **Footer:** information-only / not-investment-advice disclaimer, data source, "data as of <latest date>" from `data/manifest.json`, repo link.
- **Stale-data banner:** if the newest date in `manifest.json` is more than 3 calendar days old, show a dismissible amber banner (covers a silently failing daily Action).
- **Mobile (< 768px):** group buttons collapse into a hamburger that opens an accordion drawer; search becomes an icon that opens a full-screen overlay; data tables scroll horizontally with a sticky first column.
- **Accessibility:** skip-to-content link, `aria-expanded` on menu buttons, visible focus rings, text contrast ≥ 4.5:1.

## 4. Page templates and mapping

| Template | Pages | Shape |
|---|---|---|
| Market dashboard | `index`, `twse`, `tpex` | Stat tiles, index chart with MA toggles, searchable stock table. One `market-page.js` takes `data-market="all\|twse\|tpex"`; the three HTML files remain as thin stubs so URLs keep working. |
| Screener / table | `gap`, `volume-candle`, `xiaoge-strategy`, `punish`, `vcp`, `wantgoo`, `volatility`, `screener`, `warrant-filter`, `premium-warrant` | Page header → filter toolbar → sortable results table with sticky header and empty state. |
| Stock detail | `stock` | Name, price + change pill, price chart with range tabs, recent-trades table. |
| Tool | `day-trade-calculator`, `portfolio` | Two columns: inputs left, results right; stacked on mobile. |
| Collection | `bookmark`, `watchlist` | Sidebar of sections + card grid. `watchlist.html` (2,075 lines, 748 lines of CSS) is inspected before deciding between re-skin and splitting data from view. |

**Shared modules** (framework-free):
- `data.js` — `loadJSON(path)` with timeout, one retry, and consistent loading / error / empty handling, replacing per-page try/catch and loader markup.
- `ui-table.js` — sort, text filter and render for the screener template, replacing the hand-rolled copies.
- `chart-theme.js` — Chart.js colours read from the CSS tokens (replaces the palette in `nerd-grid.js`). Chart.js is pinned to an exact version instead of the current unpinned CDN URL.

## 5. Page states

Every data-driven page supports four states via `data.js` and the shell:
- **Loading:** skeleton rows and tiles.
- **Empty:** states why (no filter match, or no data for the date, e.g. a holiday) and offers a reset action.
- **Error:** banner with Retry on fetch failure or timeout.
- **Stale:** the shell's amber banner.

## 6. Verification

The repo has no tests; add a dev-only layer that is not part of the deployed site:
1. **Component gallery** `docs/ui-gallery.html` (not in the nav): every component and state on one page.
2. **Playwright smoke test** run on PRs: serve `docs/` locally, visit all pages at desktop and 390px widths; assert header/footer render, no console errors, tables have rows, no horizontal overflow; save screenshots as CI artifacts.
3. **Manual per batch:** ⌘K search, mega-menu keyboard use, one phone-width pass.

## 7. Rollout and rollback

Work on a branch, one commit per group:
1. Foundation: `ui.css`, `shell.js`, `data.js`, `chart-theme.js`, `ui-gallery.html`.
2. Market dashboards: `index`, `twse`, `tpex`, `stock`.
3. Screener family, in two batches.
4. Tools, then collections.
5. Remove `nerd-grid.css` / `nerd-grid.js`, update the README.

`nerd-grid.*` stays until step 5, so any batch can be reverted independently. The daily data workflow stages only `docs/data/`, so UI commits do not conflict with it.

## 8. Risks

- Unpinned Chart.js CDN could break charts without a commit → pin the version.
- `twse.html` and `tpex.html` (995 lines each) may have drifted → diff before collapsing so page-specific behaviour is not lost.
- `watchlist.html` may embed data or logic → read before choosing re-skin vs split.
- Google Fonts remains an external dependency (self-hosting is a possible later step).
- Surface area is about 17,000 lines of HTML → strategy math, data formats and the Python pipeline are explicitly out of scope.

## 9. Out of scope (noted for later)

Dark mode (tokens ready), data-pipeline hardening and repo-size reduction (see `mongo_schema.md`), and any build tooling.
