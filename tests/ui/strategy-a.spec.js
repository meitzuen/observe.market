const { test, expect } = require("@playwright/test");

// Behaviour spec for the strategy batch A pages: gap, volume-candle,
// xiaoge-strategy, punish. Desktop only; asserts behaviours, not stock values.

test.describe("strategy batch A behaviour", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  function collectErrors(page) {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    return errors;
  }

  // The production API does not send CORS headers for localhost, so the
  // punishment endpoint is served from a fixture. Ranges starting before 2010
  // return an empty list.
  const PUNISH_ROWS = [
    {
      publish_date: "2026-09-30",
      measure: "第一次處置",
      id: "3016",
      name: "嘉晶",
      accumulated: 1,
      condition: "連續三次及當日沖銷標準",
      from: "2026-10-01",
      to: "2026-10-12",
    },
    {
      publish_date: "2026-09-02",
      measure: "第二次處置",
      id: "3450",
      name: "聯鈞",
      accumulated: 2,
      condition: "連續五次及當日沖銷標準",
      from: "2026-09-03",
      to: "2026-09-11",
    },
  ];

  async function mockPunish(page) {
    await page.route("**/daily/punishment**", (route) => {
      const u = new URL(route.request().url());
      const old = (u.searchParams.get("start_date") || "") < "2010";
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(old ? [] : PUNISH_ROWS),
      });
    });
  }

  async function changeDate(page, listSel) {
    const options = await page.locator("#date-picker option").count();
    expect(options, "date picker needs at least 2 dates").toBeGreaterThan(1);
    const current = await page.locator("#date-picker").inputValue();
    const other = await page.locator("#date-picker option").nth(1).getAttribute("value");
    expect(other).not.toBe(current);
    const req = page.waitForRequest(
      (r) => r.url().includes("/data/") && r.url().endsWith(other + ".json"),
    );
    await page.selectOption("#date-picker", other);
    await req;
    await expect(page.locator(listSel).first()).toBeVisible();
    expect(await page.locator("#date-picker").inputValue()).toBe(other);
  }

  for (const [file, ranges] of [
    ["gap.html", ["close-min"]],
    ["volume-candle.html", ["close-min"]],
  ]) {
    test(`${file}: rows render, date change reloads, impossible filter shows empty state`, async ({
      page,
    }) => {
      const errors = collectErrors(page);
      await page.goto("/" + file, { waitUntil: "networkidle" });
      await expect(page.locator("#result-list tr").first()).toBeVisible();
      expect(await page.locator("#result-list tr").count()).toBeGreaterThan(0);
      expect(await page.locator(".empty-state").count()).toBe(0);

      await changeDate(page, "#result-list tr");

      await page.fill("#" + ranges[0], "99999999");
      await page.click("#btn-apply");
      await expect(page.locator(".empty-state")).toBeVisible();
      expect(await page.locator("#result-list tr").count()).toBe(0);

      await page.click("#btn-clear");
      await expect(page.locator("#result-list tr").first()).toBeVisible();
      expect(await page.locator(".empty-state").count()).toBe(0);
      expect(errors).toEqual([]);
    });
  }

  test("gap/volume-candle: type tab switch loads other dataset", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/volume-candle.html", { waitUntil: "networkidle" });
    const second = page.locator("#tab-black");
    await expect(second).not.toHaveClass(/active/);
    await second.click();
    await expect(second).toHaveClass(/active/);
    await expect(page.locator("#tab-red")).not.toHaveClass(/active/);
    await expect(page.locator("#result-title")).toContainText("長黑");
    expect(errors).toEqual([]);
  });

  test("xiaoge-strategy.html: rows render, date change reloads, short tab loads", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/xiaoge-strategy.html", { waitUntil: "networkidle" });
    await expect(page.locator("#result-list tr").first()).toBeVisible();
    expect(await page.locator("#result-list tr").count()).toBeGreaterThan(0);

    await changeDate(page, "#result-list tr");

    const tab = page.locator("#tab-short");
    await tab.click();
    await expect(tab).toHaveClass(/active/);
    await expect(page.locator("#table-head-short")).toBeVisible();
    await expect(page.locator("#table-head-long")).toBeHidden();
    // either rows or the empty state, never a blank list
    await expect
      .poll(
        async () =>
          (await page.locator("#result-list tr").count()) +
          (await page.locator(".empty-state").count()),
      )
      .toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("punish.html: rows render, new range re-queries, empty range shows empty state", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await mockPunish(page);
    await page.goto("/punish.html", { waitUntil: "networkidle" });
    await expect(page.locator("#punish-list tr").first()).toBeVisible();
    expect(await page.locator("#punish-list tr").count()).toBe(PUNISH_ROWS.length);
    expect(await page.locator(".empty-state").count()).toBe(0);

    // switching market triggers a new request and re-renders
    const req = page.waitForRequest(
      (r) => r.url().includes("/tpex/daily/punishment"),
    );
    await page.selectOption("#market-select", "tpex");
    await page.click("#fetch-btn");
    await req;
    await expect
      .poll(
        async () =>
          (await page.locator("#punish-list tr").count()) +
          (await page.locator(".empty-state").count()),
      )
      .toBeGreaterThan(0);

    // a range in the distant past matches nothing
    await page.fill("#start-date", "2000-01-01");
    await page.fill("#end-date", "2000-01-02");
    await page.click("#fetch-btn");
    await expect(page.locator(".empty-state")).toBeVisible();
    expect(await page.locator("#punish-list tr").count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test("punish.html: failed request shows error banner and Retry recovers", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.route("**/daily/punishment**", (route) => route.abort());
    await page.goto("/punish.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".banner-error")).toContainText("資料載入失敗");
    expect(await page.locator(".empty-state").count()).toBe(0);

    await page.unroute("**/daily/punishment**");
    await mockPunish(page);
    await page.click('.banner-error [data-action="retry"]');
    await expect(page.locator("#punish-list tr").first()).toBeVisible();
    expect(await page.locator(".banner-error").count()).toBe(0);
    expect(errors).toEqual([]);
  });
  for (const file of ["gap.html", "volume-candle.html", "xiaoge-strategy.html"]) {
    test(`${file}: failed data request shows error banner, Retry recovers`, async ({
      page,
    }) => {
      const errors = collectErrors(page);
      const isDataFile = (u) => /\/data\/(twse|tpex)\/.+\.json$/.test(u.pathname);
      await page.route(isDataFile, (route) => route.abort());
      await page.goto("/" + file, { waitUntil: "networkidle" });
      await expect(page.locator(".banner-error")).toBeVisible();
      await expect(page.locator(".banner-error")).toContainText("資料載入失敗");
      expect(await page.locator(".empty-state").count()).toBe(0);

      await page.unroute(isDataFile);
      await page.click('.banner-error [data-action="retry"]');
      await expect(page.locator("#result-list tr").first()).toBeVisible();
      expect(await page.locator("#result-list tr").count()).toBeGreaterThan(0);
      expect(await page.locator(".banner-error").count()).toBe(0);
      expect(errors).toEqual([]);
    });
  }
});
