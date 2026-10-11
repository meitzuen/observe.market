const { test, expect } = require("@playwright/test");

// Primary data-load failure (not the manifest): a failed daily_price fetch must
// surface the error banner with Retry, clear the sidebars' "載入中" placeholder,
// and Retry must recover using the CURRENT date-picker value. Desktop only.

const DAILY = /\/data\/(twse|tpex)\/daily_price\//;
const reqCounter = (page, re) => {
  const hits = [];
  page.on("request", (r) => {
    if (re.test(new URL(r.url()).pathname)) hits.push(r.url());
  });
  return hits;
};

test.describe("primary data-load failure", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  for (const file of ["twse.html", "tpex.html", "index.html"]) {
    test(`${file}: daily_price failure shows banner, sidebars settle, Retry recovers`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));

      await page.route(DAILY, (r) => r.abort());
      await page.goto("/" + file, { waitUntil: "networkidle" });

      const banner = page.locator("#result-state .banner-error");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText("資料載入失敗");
      await expect(page.locator(".banner-error")).toHaveCount(1);
      await expect(page.locator("#gap-list")).not.toContainText("載入中");
      await expect(page.locator("#punish-list")).not.toContainText("載入中");
      expect(await page.locator("#stock-list tr").count()).toBe(0);
      expect(await page.locator(".loader:visible").count()).toBe(0);

      await page.unroute(DAILY);
      await banner.locator('[data-action="retry"]').click();
      await expect(page.locator("#stock-list tr").first()).toBeVisible();
      await expect(page.locator(".banner-error")).toHaveCount(0);
      await expect(page.locator("#gap-list")).not.toContainText("載入中");

      // date picker still wired exactly once
      const opts = page.locator("#date-picker option");
      expect(await opts.count()).toBeGreaterThan(1);
      const cur = await page.locator("#date-picker").inputValue();
      let other = null;
      for (let i = 0; i < (await opts.count()); i++) {
        const v = await opts.nth(i).getAttribute("value");
        if (v !== cur) { other = v; break; }
      }
      const hits = reqCounter(page, DAILY);
      await page.selectOption("#date-picker", other);
      await expect.poll(() => hits.length).toBeGreaterThan(0);
      await page.waitForLoadState("networkidle");
      // index fetches both markets (when the date exists in each), others one
      expect(hits.length).toBeLessThanOrEqual(file === "index.html" ? 2 : 1);
      expect(new Set(hits).size).toBe(hits.length);
      expect(errors).toEqual([]);
    });
  }

  test("twse.html: Retry uses the CURRENT date-picker value", async ({ page }) => {
    await page.goto("/twse.html", { waitUntil: "networkidle" });
    const opts = page.locator("#date-picker option");
    const cur = await page.locator("#date-picker").inputValue();
    let other = null;
    for (let i = 0; i < (await opts.count()); i++) {
      const v = await opts.nth(i).getAttribute("value");
      if (v !== cur) { other = v; break; }
    }
    await page.route(DAILY, (r) => r.abort());
    await page.selectOption("#date-picker", other);
    const banner = page.locator("#result-state .banner-error");
    await expect(banner).toBeVisible();
    await page.unroute(DAILY);
    const hits = reqCounter(page, DAILY);
    await banner.locator('[data-action="retry"]').click();
    await expect.poll(() => hits.length).toBeGreaterThan(0);
    expect(hits[0]).toContain(`/daily_price/${other}.json`);
    await expect(page.locator("#stock-list tr").first()).toBeVisible();
  });

  test("stock.html: stock_info.json failure shows error banner, Retry recovers", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const INFO = "**/data/stock_info.json";
    await page.route(INFO, (r) => r.abort());
    await page.goto("/stock.html?id=2330", { waitUntil: "networkidle" });
    const banner = page.locator("#content-area .banner-error");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("資料載入失敗");
    await expect(page.locator("#content-area")).not.toContainText("查無此股票");

    await page.unroute(INFO);
    await banner.locator('[data-action="retry"]').click();
    await expect(page.locator(".banner-error")).toHaveCount(0);
    await expect(page.locator("#stock-title")).toContainText("2330");
    await expect(page.locator("#content-area")).not.toContainText("查無此股票");
    expect(errors).toEqual([]);
  });

  test("stock.html: successful stock_info.json without the id shows not-found, no error banner", async ({ page }) => {
    await page.route("**/data/stock_info.json", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/stock.html?id=2330", { waitUntil: "networkidle" });
    await expect(page.locator("#content-area")).toContainText("查無此股票");
    await expect(page.locator(".banner-error")).toHaveCount(0);
  });

  test("stock.html: stock_history 500 is an error, 404 stays the empty state", async ({ page }) => {
    const HIST = /\/stock_history\/2330\.json$/;
    await page.route(HIST, (r) => r.fulfill({ status: 500, body: "boom" }));
    await page.goto("/stock.html?id=2330", { waitUntil: "networkidle" });
    await expect(page.locator("#content-area .banner-error")).toBeVisible();
    await page.unroute(HIST);
    await page.route(HIST, (r) => r.fulfill({ status: 404, body: "nope" }));
    await page.goto("/stock.html?id=2330", { waitUntil: "networkidle" });
    await expect(page.locator(".banner-error")).toHaveCount(0);
    await expect(page.locator("#content-area")).toContainText("尚無歷史資料");
  });
});
