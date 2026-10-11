const { test, expect } = require("@playwright/test");

// Behaviour spec for strategy batch B: vcp, volatility, screener, wantgoo.
// Desktop only; asserts behaviours, not specific stock values.

test.describe("strategy batch B behaviour", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  function collectErrors(page) {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    return errors;
  }

  async function manifestDates(page, market, key) {
    const res = await page.request.get("/data/manifest.json");
    const m = await res.json();
    return [...m[market][key]].sort();
  }

  // ---------------------------------------------------------------- vcp
  const vcpData = (u) => /\/data\/(twse|tpex)\/vcp\/.+\.json$/.test(u.pathname);

  test("vcp.html: rows render, date change reloads, impossible filter shows empty state", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/vcp.html", { waitUntil: "networkidle" });
    await expect(page.locator("#result-list tr").first()).toBeVisible();
    expect(await page.locator("#result-list tr").count()).toBeGreaterThan(0);
    expect(await page.locator(".empty-state").count()).toBe(0);

    const options = await page.locator("#date-picker option").count();
    expect(options, "date picker needs at least 2 dates").toBeGreaterThan(1);
    const current = await page.locator("#date-picker").inputValue();
    const other = await page.locator("#date-picker option").nth(1).getAttribute("value");
    expect(other).not.toBe(current);
    const req = page.waitForRequest((r) => r.url().endsWith(`/vcp/${other}.json`));
    await page.selectOption("#date-picker", other);
    await req;
    await expect(page.locator("#result-list tr").first()).toBeVisible();

    await page.fill("#close-min", "99999999");
    await page.click("#btn-apply");
    await expect(page.locator(".empty-state")).toBeVisible();
    expect(await page.locator("#result-list tr").count()).toBe(0);

    await page.click("#btn-clear");
    await expect(page.locator("#result-list tr").first()).toBeVisible();
    expect(await page.locator(".empty-state").count()).toBe(0);

    // market tab switch reloads the date list and data
    const tpexReq = page.waitForRequest((r) => /\/tpex\/vcp\/.+\.json$/.test(r.url()));
    await page.click('.market-tab[data-market="tpex"]');
    await tpexReq;
    expect(errors).toEqual([]);
  });

  test("vcp.html: failed data request shows error banner, Retry recovers", async ({ page }) => {
    const errors = collectErrors(page);
    await page.route(vcpData, (route) => route.abort());
    await page.goto("/vcp.html", { waitUntil: "networkidle" });
    await expect(page.locator(".banner-error")).toContainText("資料載入失敗");
    expect(await page.locator(".empty-state").count()).toBe(0);

    await page.unroute(vcpData);
    await page.click('.banner-error [data-action="retry"]');
    await expect(page.locator("#result-list tr").first()).toBeVisible();
    expect(await page.locator(".banner-error").count()).toBe(0);
    expect(errors).toEqual([]);
  });

  // ------------------------------------------------- volatility / screener
  const dailyPrice = (u) => /\/data\/(twse|tpex)\/daily_price\/.+\.json$/.test(u.pathname);

  async function setRange(page, from, to) {
    await page.fill("#date-from", from);
    await page.fill("#date-to", to);
  }

  test("volatility.html: rows render, range change re-queries, empty range shows empty state", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/volatility.html", { waitUntil: "networkidle" });
    await expect(page.locator("#result-list tr").first()).toBeVisible();
    expect(await page.locator("#result-list tr").count()).toBeGreaterThan(0);
    expect(await page.locator(".empty-state").count()).toBe(0);

    const dates = await manifestDates(page, "twse", "daily_price");
    expect(dates.length).toBeGreaterThan(3);
    const from = dates[dates.length - 3];
    const to = dates[dates.length - 1];
    const seen = [];
    page.on("request", (r) => {
      if (/\/twse\/daily_price\//.test(r.url())) seen.push(r.url());
    });
    await setRange(page, from, to);
    await page.click("#btn-calc");
    await expect(page.locator("#result-summary")).toContainText("共 3 個交易日");
    expect(seen.length).toBeGreaterThan(0);
    await expect(page.locator("#result-list tr").first()).toBeVisible();

    // all-markets mode exposes the market column
    await page.click('.market-tab[data-market="all"]');
    await expect(page.locator("#th-market")).toBeVisible();

    // a range with no trading days matches nothing
    await setRange(page, "2000-01-01", "2000-01-02");
    await page.click("#btn-calc");
    await expect(page.locator(".empty-state")).toBeVisible();
    expect(await page.locator("#result-list tr").count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test("screener.html: rows render, rank tab switches, range change re-queries, empty range shows empty state", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/screener.html", { waitUntil: "networkidle" });
    await expect(page.locator("#result-list tr").first()).toBeVisible();
    expect(await page.locator("#result-list tr").count()).toBeGreaterThan(0);
    expect(await page.locator(".empty-state").count()).toBe(0);

    const loss = page.locator('.market-tab[data-rank="loss"]');
    await loss.click();
    await expect(loss).toHaveClass(/active/);
    await expect(page.locator("#result-title")).toContainText("跌幅排行");
    await expect(page.locator("#result-list tr").first()).toBeVisible();

    const dates = await manifestDates(page, "twse", "daily_price");
    const from = dates[dates.length - 3];
    const to = dates[dates.length - 1];
    await setRange(page, from, to);
    await page.click("#btn-calc");
    await expect(page.locator("#result-summary")).toContainText("共 3 個交易日");
    await expect(page.locator("#result-list tr").first()).toBeVisible();

    await setRange(page, "2000-01-01", "2000-01-02");
    await page.click("#btn-calc");
    await expect(page.locator(".empty-state")).toBeVisible();
    expect(await page.locator("#result-list tr").count()).toBe(0);
    expect(errors).toEqual([]);
  });

  for (const file of ["volatility.html", "screener.html"]) {
    test(`${file}: failed data requests show error banner, Retry recovers`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.route(dailyPrice, (route) => route.abort());
      await page.goto("/" + file, { waitUntil: "networkidle" });
      await expect(page.locator(".banner-error")).toBeVisible();
      await expect(page.locator(".banner-error")).toContainText("資料載入失敗");
      expect(await page.locator(".empty-state").count()).toBe(0);

      await page.unroute(dailyPrice);
      await page.click('.banner-error [data-action="retry"]');
      await expect(page.locator("#result-list tr").first()).toBeVisible();
      expect(await page.locator(".banner-error").count()).toBe(0);
      expect(errors).toEqual([]);
    });
  }

  // ------------------------------------------------------------ wantgoo
  // The production API sends no CORS headers for localhost, so every
  // endpoint is served from a fixture. A floor >= 9999 matches nothing.
  const API = "**/api/wantgoo/stock/ranking/**";
  const FIXTURES = {
    "mom-revenue-growth": [
      { stockNo: "2330", date: "2026-09-10T00:00:00", preMonthRevenueDiff: 12.5, preYearMonthRevenueDiff: 30.1, preTotalRevenueDiff: 25.2 },
      { stockNo: "2317", date: "2026-09-10T00:00:00", preMonthRevenueDiff: -3.2, preYearMonthRevenueDiff: 8.4, preTotalRevenueDiff: 6.0 },
    ],
    "roe-roa": [
      { stockNo: "2330", currentYear: 2026, currentSeason: 2, top4SumRoe: 25.1, top4SumRoa: 15.2 },
      { stockNo: "2454", currentYear: 2026, currentSeason: 2, top4SumRoe: 18.3, top4SumRoa: 11.0 },
      { stockNo: "2317", currentYear: 2026, currentSeason: 2, top4SumRoe: 10.0, top4SumRoa: 4.1 },
    ],
    "profit-margin": [
      { stockNo: "2330", year: 2026, season: 2, grossProfitMargin: 55.1, operatingProfitMargin: 45.0, netProfitMargin: 40.2, grossMarginTrend: 1.2, operatingMarginTrend: -0.4, netMarginTrend: null },
    ],
    "qoq-eps-growth": [
      { stockNo: "2330", currentYear: 2026, currentSeason: 2, prevYear: 2026, prevSeason: 1, currentEps: 10.5, prevEps: 9.2, top4SumEps: 38.0, growthRatio: 14.1 },
      { stockNo: "2454", currentYear: 2026, currentSeason: 2, prevYear: 2026, prevSeason: 1, currentEps: 20.0, prevEps: 25.0, top4SumEps: 80.0, growthRatio: -20.0 },
    ],
  };

  async function mockWantgoo(page, requests) {
    await page.route(API, (route) => {
      const u = new URL(route.request().url());
      if (requests) requests.push(u);
      const key = u.pathname.split("/").pop();
      const none = [...u.searchParams.entries()].some(
        ([k, v]) => k.endsWith("_floor") && Number(v) >= 9999,
      );
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(none ? [] : FIXTURES[key] || []),
      });
    });
  }

  const PANELS = [
    { tab: "mom-revenue", p: "mom", btn: "fetchMomRevenue", floor: "mom-month-floor", n: 2 },
    { tab: "roe-roa", p: "roeroa", btn: "fetchRoeRoa", floor: "roeroa-roe-floor", n: 3 },
    { tab: "profit-margin", p: "pm", btn: "fetchProfitMargin", floor: null, n: 1 },
    { tab: "eps-growth", p: "eps", btn: "fetchEpsGrowth", floor: "eps-growth-floor", n: 2 },
  ];

  test("wantgoo.html: every tab queries its endpoint and renders rows; no-match shows empty state", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const requests = [];
    await mockWantgoo(page, requests);
    await page.goto("/wantgoo.html", { waitUntil: "networkidle" });

    // before any query, the placeholder shows and no table is visible
    await expect(page.locator("#mom-empty .empty-state")).toBeVisible();
    await expect(page.locator("#mom-table-wrap")).toBeHidden();

    for (const t of PANELS) {
      await page.click(`.tab-btn[data-tab="${t.tab}"]`);
      await expect(page.locator(`#${t.tab}`)).toHaveClass(/active/);
      const panel = page.locator(`#${t.tab}`);
      const before = requests.length;
      await panel.locator("button.btn-primary").click();
      await expect(page.locator(`#${t.p}-tbody tr`)).toHaveCount(t.n);
      await expect(page.locator(`#${t.p}-table-wrap`)).toBeVisible();
      expect(requests.length).toBe(before + 1);
      expect(requests[requests.length - 1].searchParams.get("top_n")).toBe("200");

      if (t.floor) {
        await page.fill("#" + t.floor, "99999");
        await panel.locator("button.btn-primary").click();
        await expect(page.locator(`#${t.p}-empty .empty-state`)).toBeVisible();
        await expect(page.locator(`#${t.p}-table-wrap`)).toBeHidden();
      }
    }

    // main control (sort select) is forwarded in the request
    await page.click('.tab-btn[data-tab="roe-roa"]');
    await page.fill("#roeroa-roe-floor", "");
    await page.selectOption("#roeroa-sort-by", "roa");
    const req = page.waitForRequest((r) => r.url().includes("sort_by=roa"));
    await page.locator("#roe-roa button.btn-primary").click();
    await req;
    await expect(page.locator("#roeroa-tbody tr")).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test("wantgoo.html: failed request shows error banner and Retry recovers", async ({ page }) => {
    const errors = collectErrors(page);
    await page.route(API, (route) => route.abort());
    await page.goto("/wantgoo.html", { waitUntil: "networkidle" });
    await page.locator("#mom-revenue button.btn-primary").click();
    await expect(page.locator("#mom-empty .banner-error")).toContainText("資料載入失敗");
    expect(await page.locator("#mom-empty .empty-state").count()).toBe(0);

    await page.unroute(API);
    await mockWantgoo(page);
    await page.click('#mom-empty .banner-error [data-action="retry"]');
    await expect(page.locator("#mom-tbody tr")).toHaveCount(2);
    await expect(page.locator("#mom-table-wrap")).toBeVisible();
    expect(await page.locator(".banner-error").count()).toBe(0);
    expect(errors).toEqual([]);
  });
});
