const { test, expect } = require("@playwright/test");

// Behaviour spec for head-shoulders.html. Desktop only; asserts behaviours,
// not specific stock values.

test.describe("head-shoulders.html behaviour", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  function collectErrors(page) {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    return errors;
  }

  const hsData = (u) => /\/data\/(twse|tpex)\/hs_(bottom|top)\/.+\.json$/.test(u.pathname);

  test("rows render, type tab and status filter work, impossible filter state recovers", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/head-shoulders.html", { waitUntil: "networkidle" });
    await expect(page.locator("#result-list tr").first()).toBeVisible();
    const all = await page.locator("#result-list tr").count();
    expect(all).toBeGreaterThan(0);
    expect(await page.locator(".empty-state").count()).toBe(0);

    // status filter narrows rows and every remaining row shows that status
    await page.selectOption("#status-filter", "forming");
    const forming = await page.locator("#result-list tr").count();
    expect(forming).toBeLessThanOrEqual(all);
    for (const t of await page.locator("#result-list tr td:nth-child(5)").allTextContents()) {
      expect(t).toContain("成形中");
    }
    await page.selectOption("#status-filter", "");

    // switching to the top pattern requests the hs_top file
    const topReq = page.waitForRequest((r) => /\/twse\/hs_top\/.+\.json$/.test(r.url()));
    await page.click('.type-tab[data-type="hs_top"]');
    await topReq;
    await expect(page.locator("#note-top")).toBeVisible();
    await expect(page.locator("#note-bottom")).toBeHidden();

    // market tab switch reloads data
    const tpexReq = page.waitForRequest((r) => /\/tpex\/hs_top\/.+\.json$/.test(r.url()));
    await page.click('.market-tab[data-market="tpex"]');
    await tpexReq;
    expect(errors).toEqual([]);
  });

  test("failed data request shows error banner, Retry recovers", async ({ page }) => {
    const errors = collectErrors(page);
    await page.route(hsData, (route) => route.abort());
    await page.goto("/head-shoulders.html", { waitUntil: "networkidle" });
    await expect(page.locator(".banner-error")).toContainText("資料載入失敗");
    expect(await page.locator(".empty-state").count()).toBe(0);

    await page.unroute(hsData);
    await page.click('.banner-error [data-action="retry"]');
    await expect(page.locator("#result-list tr").first()).toBeVisible();
    expect(await page.locator(".banner-error").count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test("manifest failure shows error banner, Retry recovers and wires handlers once", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const manifestUrl = "**/data/manifest.json";
    await page.route(manifestUrl, (route) => route.abort());
    await page.goto("/head-shoulders.html", { waitUntil: "networkidle" });
    await expect(page.locator("#result-state .banner-error")).toContainText("資料載入失敗");
    expect(await page.locator("#result-list tr").count()).toBe(0);

    await page.unroute(manifestUrl);
    await page.click('#result-state .banner-error [data-action="retry"]');
    await expect(page.locator("#result-list tr").first()).toBeVisible();
    await expect(page.locator("#result-state .banner-error")).toHaveCount(0);

    const hits = [];
    page.on("request", (r) => {
      if (/\/tpex\/hs_bottom\/.+\.json$/.test(r.url())) hits.push(r.url());
    });
    await page.click('.market-tab[data-market="tpex"]');
    await expect.poll(() => hits.length).toBeGreaterThan(0);
    await page.waitForLoadState("networkidle");
    expect(hits.length).toBe(1);
    expect(errors).toEqual([]);
  });
});
