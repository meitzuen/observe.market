const { test, expect } = require("@playwright/test");

test.describe("index.html and stock.html behaviour", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  test("index: table rows, chart created, MA chips toggle", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/index.html", { waitUntil: "networkidle" });
    await expect(page.locator("#stock-list tr").first()).toBeVisible();
    expect(await page.locator("#stock-list tr").count()).toBeGreaterThan(0);
    await expect
      .poll(() => page.evaluate(() => !!Chart.getChart("indexChart")))
      .toBe(true);

    const chip = page.locator("#ma-toggle-row .chip").first();
    expect(await page.locator("#ma-toggle-row .chip").count()).toBe(3);
    await expect(chip).not.toHaveClass(/active/);
    await chip.click();
    await expect(chip).toHaveClass(/active/);
    await chip.click();
    await expect(chip).not.toHaveClass(/active/);
    expect(errors).toEqual([]);
  });

  test("stock: ?id=2330 renders title, chart and table rows", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/stock.html?id=2330", { waitUntil: "networkidle" });
    await expect(page.locator(".page-title")).toContainText("2330");
    const box = await page.locator("#priceChart").boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    await expect(page.locator("#priceChart canvas").first()).toBeAttached();
    expect(await page.locator("table tbody tr").count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("stock: letter-suffixed ETF code renders without page errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/stock.html?id=00835B", { waitUntil: "networkidle" });
    await expect(page.locator("#content-area")).not.toContainText("載入中");
    expect(errors).toEqual([]);
  });
});
