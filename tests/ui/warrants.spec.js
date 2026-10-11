const { test, expect } = require("@playwright/test");

// Behaviour spec for the warrant pages: warrant-filter and premium-warrant.
// Desktop only; asserts behaviours, not specific values.

test.describe("warrant pages behaviour", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  function collectErrors(page) {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    return errors;
  }

  const CORS = { "access-control-allow-origin": "*" };

  // The production filter API sends no CORS headers for localhost, so it is
  // served from a fixture. A volume lower bound >= 1e6 matches nothing.
  const ROWS = ["A", "B", "C"].map((x, i) => ({
    權證代碼: "0300" + i,
    權證名稱: "測試權證" + x,
    標的名稱: "測試",
    標的代碼: "2330",
    "認購/認售": "認購",
    權證成交價: 1 + i,
    權證成交量: 1000 * (i + 1),
    流通在外比例: 40,
    買賣價差比率: 0.5,
    最新履約價: 100,
    剩餘天數: 120,
    價內外程度: 1.5,
    實質槓桿: 5,
  }));

  async function mockFilterApi(page, counter) {
    await page.route("**/api/mktobs/warrant/filter", (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({
          status: 204,
          headers: {
            ...CORS,
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "POST, OPTIONS",
          },
        });
      }
      if (counter) counter.n++;
      const body = route.request().postDataJSON() || {};
      const min = parseFloat(body.volume && body.volume.left);
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS,
        body: JSON.stringify(min >= 1e6 ? [] : ROWS),
      });
    });
  }

  test("warrant-filter.html: rows render, impossible filter shows empty state, clearing restores", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await mockFilterApi(page);
    await page.goto("/warrant-filter.html", { waitUntil: "networkidle" });
    await expect(page.locator("#warrant-list tr").first()).toBeVisible();
    expect(await page.locator("#warrant-list tr").count()).toBeGreaterThan(0);
    expect(await page.locator(".empty-state").count()).toBe(0);

    await page.fill("#volume_left", "99999999");
    await page.click("#search-btn");
    await expect(page.locator(".empty-state")).toBeVisible();
    expect(await page.locator("#warrant-list tr").count()).toBe(0);

    await page.fill("#volume_left", "");
    await page.click("#search-btn");
    await expect(page.locator("#warrant-list tr").first()).toBeVisible();
    expect(await page.locator(".empty-state").count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test("warrant-filter.html: API failure shows error banner, Retry recovers with one request", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.route("**/api/mktobs/warrant/filter", (r) => r.abort());
    await page.goto("/warrant-filter.html", { waitUntil: "networkidle" });
    await expect(page.locator(".banner-error")).toBeVisible();
    expect(await page.locator("#warrant-list tr").count()).toBe(0);
    expect(await page.locator(".empty-state").count()).toBe(0);

    await page.unroute("**/api/mktobs/warrant/filter");
    const counter = { n: 0 };
    await mockFilterApi(page, counter);
    await page.locator(".banner-error button").click();
    await expect(page.locator("#warrant-list tr").first()).toBeVisible();
    expect(await page.locator(".banner-error").count()).toBe(0);
    expect(counter.n).toBe(1);
    expect(errors.filter((e) => !/fetch|Failed/i.test(e))).toEqual([]);
  });

  async function changeDate(page) {
    const options = await page.locator("#date-picker option").count();
    expect(options, "date picker needs at least 2 dates").toBeGreaterThan(1);
    const current = await page.locator("#date-picker").inputValue();
    const other = await page.locator("#date-picker option").nth(1).getAttribute("value");
    expect(other).not.toBe(current);
    let hits = 0;
    const onReq = (r) => {
      if (r.url().endsWith(`/data/warrant/${other}.json`)) hits++;
    };
    page.on("request", onReq);
    await page.selectOption("#date-picker", other);
    await expect(page.locator("#last-update")).toContainText(other);
    await expect(page.locator("#warrant-list tr").first()).toBeVisible();
    page.off("request", onReq);
    return hits;
  }

  test("premium-warrant.html: rows render, date change reloads once, search + type filters", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/premium-warrant.html", { waitUntil: "networkidle" });
    await expect(page.locator("#warrant-list tr").first()).toBeVisible();
    expect(await page.locator("#warrant-list tr").count()).toBeGreaterThan(0);
    expect(await page.locator(".empty-state").count()).toBe(0);

    expect(await changeDate(page)).toBe(1);

    await page.fill("#warrant-search", "zzzz_no_such_warrant_zzzz");
    await expect(page.locator(".empty-state")).toBeVisible();
    expect(await page.locator("#warrant-list tr").count()).toBe(0);
    await page.fill("#warrant-search", "");
    await expect(page.locator("#warrant-list tr").first()).toBeVisible();
    expect(await page.locator(".empty-state").count()).toBe(0);

    const put = page.locator('.type-btn[data-type="認售"]');
    await put.click();
    await expect(put).toHaveClass(/active/);
    expect(errors).toEqual([]);
  });

  test("premium-warrant.html: manifest failure shows banner, Retry recovers without double wiring", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.route("**/data/manifest.json", (r) => r.abort());
    await page.goto("/premium-warrant.html", { waitUntil: "networkidle" });
    await expect(page.locator(".banner-error")).toBeVisible();
    expect(await page.locator("#warrant-list tr").count()).toBe(0);

    await page.unroute("**/data/manifest.json");
    await page.locator(".banner-error button").click();
    await expect(page.locator("#warrant-list tr").first()).toBeVisible();
    expect(await page.locator(".banner-error").count()).toBe(0);

    expect(await changeDate(page)).toBe(1);
    expect(errors).toEqual([]);
  });

  test("premium-warrant.html: per-date failure shows banner (not empty state), Retry recovers", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.route("**/data/warrant/*.json", (r) => r.abort());
    await page.goto("/premium-warrant.html", { waitUntil: "networkidle" });
    await expect(page.locator(".banner-error")).toBeVisible();
    expect(await page.locator(".empty-state").count()).toBe(0);
    expect(await page.locator("#warrant-list tr").count()).toBe(0);

    await page.unroute("**/data/warrant/*.json");
    await page.locator(".banner-error button").click();
    await expect(page.locator("#warrant-list tr").first()).toBeVisible();
    expect(await page.locator(".banner-error").count()).toBe(0);
    expect(errors).toEqual([]);
  });
});
