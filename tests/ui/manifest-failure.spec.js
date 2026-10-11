const { test, expect } = require("@playwright/test");

// Cross-page spec: a failed/blocked data/manifest.json load must surface an
// error banner with Retry on every page whose OWN script fetches it, and Retry
// must recover and wire the page's controls exactly once. Desktop only.
//
// PAGE LIST DERIVATION: `grep -rn "manifest.json" docs/*.html docs/assets/*.js`,
// excluding docs/assets/shell.js (footer date; degrades gracefully, ignored
// here). Hits: gap, volume-candle, xiaoge-strategy, index, premium-warrant,
// vcp, volatility, screener, watchlist (own fetch) and docs/assets/market-page.js
// (shared by twse.html / tpex.html). volatility/screener/vcp also mention the
// file in prose only. stock/punish/warrant-filter/bookmark/etc. do not fetch it.

const MANIFEST = "**/data/manifest.json";

const reqCounter = (page, re) => {
  const hits = [];
  page.on("request", (r) => {
    if (re.test(new URL(r.url()).pathname)) hits.push(r.url());
  });
  return hits;
};

async function secondDate(page) {
  const opts = page.locator("#date-picker option");
  expect(await opts.count(), "date picker needs >= 2 dates").toBeGreaterThan(1);
  const cur = await page.locator("#date-picker").inputValue();
  for (let i = 0; i < (await opts.count()); i++) {
    const v = await opts.nth(i).getAttribute("value");
    if (v !== cur) return v;
  }
  throw new Error("no other date");
}

// date-picker change must issue exactly one data request
function datePickerOnce(re) {
  return async (page) => {
    const other = await secondDate(page);
    const hits = reqCounter(page, re);
    await page.selectOption("#date-picker", other);
    await expect.poll(() => hits.length).toBeGreaterThan(0);
    await page.waitForLoadState("networkidle");
    expect(hits.length).toBe(1);
  };
}

// primary rows-selector + control for each page
const PAGES = [
  { file: "gap.html", rows: "#result-list tr", control: datePickerOnce(/\/data\/twse\/gap_jump\/.+\.json$/) },
  { file: "volume-candle.html", rows: "#result-list tr", control: datePickerOnce(/\/data\/twse\/vol_candle_red\/.+\.json$/) },
  { file: "xiaoge-strategy.html", rows: "#result-list tr", control: datePickerOnce(/\/data\/twse\/xiaoge_long\/.+\.json$/) },
  { file: "premium-warrant.html", rows: "#warrant-list tr", control: datePickerOnce(/\/data\/warrant\/.+\.json$/) },
  {
    file: "vcp.html",
    rows: "#result-list tr",
    control: async (page) => {
      const hits = reqCounter(page, /\/tpex\/vcp\/.+\.json$/);
      await page.click('.market-tab[data-market="tpex"]');
      await expect.poll(() => hits.length).toBeGreaterThan(0);
      await page.waitForLoadState("networkidle");
      expect(hits.length).toBe(1);
    },
  },
  ...["volatility.html", "screener.html"].map((file) => ({
    file,
    rows: "#result-list tr",
    control: async (page) => {
      const m = await (await page.request.get("/data/manifest.json")).json();
      const dates = [...m.twse.daily_price].sort();
      await page.fill("#date-from", dates[dates.length - 3]);
      await page.fill("#date-to", dates[dates.length - 1]);
      const hits = reqCounter(page, /\/twse\/daily_price\/.+\.json$/);
      await page.click("#btn-calc");
      await expect(page.locator("#result-summary")).toContainText("共 3 個交易日");
      await page.waitForLoadState("networkidle");
      expect(hits.length).toBe(3);
    },
  })),
  // market pages: pagination listener double-wired would jump two pages
  ...["index.html", "twse.html", "tpex.html"].map((file) => ({
    file,
    rows: "#stock-list tr",
    control: async (page) => {
      await page.click("#next-page");
      await expect(page.locator("#page-info")).toContainText("第 2 /");
      await page.waitForTimeout(150);
      await expect(page.locator("#page-info")).toContainText("第 2 /");
      if (file === "index.html") {
        const chip = page.locator("#ma-toggle-row .chip").first();
        await chip.click();
        await expect(chip).toHaveClass(/active/);
      }
    },
  })),
];

// Pages that deliberately do NOT replace the page with an error banner.
const GRACEFUL = {
  // The watchlist itself comes from the API and stays fully usable; only the
  // optional price columns depend on the manifest, so it shows a banner AND
  // keeps the rows with "—" prices (see collections.spec.js for full coverage).
  "watchlist.html": true,
};

test.describe("manifest load failure on every data-driven page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  for (const p of PAGES) {
    test(`${p.file}: manifest failure shows banner, Retry recovers, controls fire once`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));

      await page.route(MANIFEST, (r) => r.abort());
      await page.goto("/" + p.file, { waitUntil: "networkidle" });

      const banner = page.locator("#result-state .banner-error");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText("資料載入失敗");
      // exactly one error banner, and it is page content, not the shell's
      await expect(page.locator(".banner-error")).toHaveCount(1);
      expect(await banner.evaluate((el) => !!el.closest("[data-stale-banner]"))).toBe(false);
      // no stuck loader / skeleton, no rows
      expect(await page.locator(".loader:visible").count()).toBe(0);
      expect(await page.locator(".skeleton-block").count()).toBe(0);
      expect(await page.locator(p.rows).count()).toBe(0);

      await page.unroute(MANIFEST);
      await banner.locator('[data-action="retry"]').click();
      await expect(page.locator(p.rows).first()).toBeVisible();
      await expect(page.locator(".banner-error")).toHaveCount(0);

      await p.control(page);
      expect(errors).toEqual([]);
    });
  }

  test("watchlist.html (GRACEFUL): rows stay usable with placeholder prices, Retry recovers", async ({ page }) => {
    expect(GRACEFUL["watchlist.html"]).toBe(true);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    const json = (b) => ({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(b) });
    await page.route(/\/api\/mktobs\/watchlist/, (r) =>
      r.request().method() === "OPTIONS"
        ? r.fulfill({ status: 204, headers: CORS })
        : r.fulfill(json([{ _id: { $oid: "L1" }, name: "T", order: 1, items: [{ stock_id: "2330", note: "", is_top: false }] }])),
    );
    await page.route("**/data/twse/daily_price/2024-01-03.json", (r) =>
      r.fulfill(json([{ id: "2330", name: "台積電", open: 1, high: 1, low: 1, close: 105, volume: 1000, change: 5, change_percent: 5 }])),
    );
    await page.route("**/data/tpex/daily_price/2024-01-03.json", (r) => r.fulfill(json([])));
    const ok = () =>
      page.route(MANIFEST, (r) =>
        r.fulfill(json({ twse: { daily_price: ["2024-01-03"] }, tpex: { daily_price: ["2024-01-03"] } })),
      );

    await page.route(MANIFEST, (r) => r.abort());
    await page.goto("/watchlist.html", { waitUntil: "networkidle" });
    const banner = page.locator("#wl-state .banner-error");
    await expect(banner).toBeVisible();
    await expect(page.locator("#watchlist-tbody tr")).toHaveCount(1);
    const cell = page.locator("#watchlist-tbody tr").first().locator("td").nth(2);
    expect((await cell.textContent()).trim()).toBe("—");
    expect(await page.locator(".loader:visible").count()).toBe(0);

    await page.unroute(MANIFEST);
    await ok();
    await banner.locator('[data-action="retry"]').click();
    await expect(page.locator(".banner-error")).toHaveCount(0);
    await expect.poll(async () => (await cell.textContent()).trim()).toBe("105.00");
    expect(errors).toEqual([]);
  });
});
