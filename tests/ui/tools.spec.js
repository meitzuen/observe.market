const { test, expect } = require("@playwright/test");

// Behaviour spec for the tool pages: day-trade-calculator and portfolio.
// Desktop only. The stock list and price history are served from fixtures so
// the numbers are deterministic; expected figures are computed in the test.

test.describe("tool pages behaviour", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  function collectErrors(page) {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    return errors;
  }

  const STOCK_INFO = { 2330: { name: "測試股", type: "twse" } };
  const json = (body) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

  async function mockStockData(page) {
    await page.route("**/data/stock_info.json", (r) => r.fulfill(json(STOCK_INFO)));
    await page.route("**/data/twse/stock_history/2330.json", (r) =>
      r.fulfill(
        json([
          { date: "2024-01-02", close: 500 },
          { date: "2024-01-03", close: 600 },
        ]),
      ),
    );
  }

  // ---- independent re-implementation of the calculator maths --------------
  const FEE_RATE = 0.001425;
  const TAX = { stock: 0.003, daytrade: 0.0015, etf: 0.001 };
  function tick(p) {
    if (p < 10) return 0.01;
    if (p < 50) return 0.05;
    if (p < 100) return 0.1;
    if (p < 500) return 0.5;
    if (p < 1000) return 1;
    return 5;
  }
  function expectedRow({ entry, sell, shares, discount, minFee, type, dir }) {
    const fee = (amt) => Math.max(Math.floor(amt * FEE_RATE * (discount / 10)), minFee);
    const buyAmt = entry * shares;
    const sellAmt = sell * shares;
    const totalFee = fee(buyAmt) + fee(sellAmt);
    const tax = Math.floor(sellAmt * TAX[type]);
    const raw = dir === "long" ? sellAmt - buyAmt : buyAmt - sellAmt;
    const profit = raw - totalFee - tax;
    return { tax, totalFee, profit, pct: (profit / buyAmt) * 100 };
  }
  const num = (s) => parseFloat(s.replace(/[,+%\s]/g, ""));

  async function readRows(page) {
    return page.$$eval("#results-tbody tr", (trs) =>
      trs.map((tr) => ({
        current: tr.classList.contains("row-current"),
        cells: [...tr.children].map((td) => td.textContent.trim()),
      })),
    );
  }

  async function setForm(page, { price, qty, discount, minFee }) {
    await page.fill("#dt-price", String(price));
    await page.fill("#dt-qty", String(qty));
    await page.fill("#dt-fee-discount", String(discount));
    await page.fill("#dt-min-fee", String(minFee));
  }

  test("day-trade-calculator: worked example (hand computed)", async ({ page }) => {
    const errors = collectErrors(page);
    await mockStockData(page);
    await page.goto("/day-trade-calculator.html");
    await page.click('.tab-btn[data-type="daytrade"]');
    await page.click('.tab-btn[data-dir="long"]');
    await setForm(page, { price: 100, qty: 1, discount: 2.8, minFee: 20 });
    await page.click("#dt-calc-btn");

    // 100 x 1000 sh: fee floor(100000*.001425*.28)=39 each side -> 78;
    // day-trade tax floor(100000*.0015)=150; flat sell => -78-150 = -228.
    // Sell 100.5: sell fee floor(100500*.001425*.28)=40 -> 79, tax 150,
    // gross +500 => +271.
    const rows = await readRows(page);
    const entry = rows.find((r) => r.current);
    expect(entry.cells[1]).toBe("100.00");
    expect(entry.cells[2]).toBe("150");
    expect(entry.cells[3]).toBe("78");
    expect(entry.cells[4]).toBe("-228");
    expect(entry.cells[5]).toBe("-0.23%");
    const up = rows.find((r) => r.cells[1] === "100.50");
    expect(up.cells[3]).toBe("79");
    expect(up.cells[4]).toBe("+271");
    expect(up.cells[5]).toBe("+0.27%");
    expect(errors).toEqual([]);
  });

  for (const scenario of [
    { type: "etf", dir: "short", price: 48.5, qty: 3, lot: false, shares: 3, discount: 6, minFee: 1 },
    { type: "stock", dir: "long", price: 250, qty: 2, lot: true, shares: 2000, discount: 2.8, minFee: 20 },
  ]) {
    test(`day-trade-calculator: results match independent calc (${scenario.type}/${scenario.dir})`, async ({ page }) => {
      const errors = collectErrors(page);
      await mockStockData(page);
      await page.goto("/day-trade-calculator.html");

      const before = await readRows(page);
      await page.click(`.tab-btn[data-type="${scenario.type}"]`);
      await page.click(`.tab-btn[data-dir="${scenario.dir}"]`);
      if (!scenario.lot) {
        await page.click(".switch-slider");
        await expect(page.locator("#dt-unit-toggle")).not.toBeChecked();
      }
      await expect(page.locator("#dt-qty-suffix")).toHaveText(scenario.lot ? "張" : "股");
      await setForm(page, scenario);
      await page.click("#dt-calc-btn");

      const rows = await readRows(page);
      expect(JSON.stringify(rows)).not.toBe(JSON.stringify(before));
      expect(rows.length).toBeGreaterThanOrEqual(3);
      expect(rows.filter((r) => r.current)).toHaveLength(1);

      const sells = rows.map((r) => num(r.cells[1]));
      for (let i = 1; i < sells.length; i++) expect(sells[i]).toBeLessThan(sells[i - 1]);

      for (const r of rows) {
        const sell = num(r.cells[1]);
        const exp = expectedRow({
          entry: scenario.price,
          sell,
          shares: scenario.shares,
          discount: scenario.discount,
          minFee: scenario.minFee,
          type: scenario.type,
          dir: scenario.dir,
        });
        expect(num(r.cells[0])).toBe(scenario.price);
        expect(num(r.cells[2])).toBe(exp.tax);
        expect(num(r.cells[3])).toBe(exp.totalFee);
        // the page displays whole dollars (half rounds away from zero)
        expect(num(r.cells[4])).toBe(Math.sign(exp.profit) * Math.round(Math.abs(exp.profit)));
        expect(Math.abs(num(r.cells[5]) - exp.pct)).toBeLessThan(0.006);
      }

      // The row just above the entry price is exactly one tick higher.
      const ei = rows.findIndex((r) => r.current);
      if (ei > 0) {
        expect(sells[ei - 1]).toBeCloseTo(scenario.price + tick(scenario.price), 2);
      }
      expect(errors).toEqual([]);
    });
  }

  test("day-trade-calculator: empty inputs show the empty hint", async ({ page }) => {
    await mockStockData(page);
    await page.goto("/day-trade-calculator.html");
    await page.fill("#dt-price", "");
    await page.click("#dt-calc-btn");
    await expect(page.locator("#results-tbody .results-empty")).toBeVisible();
  });

  test("day-trade-calculator: usable and warns when stock_info.json fails", async ({ page }) => {
    const errors = collectErrors(page);
    await page.route("**/data/stock_info.json", (r) => r.abort());
    await page.goto("/day-trade-calculator.html");

    await expect(page.locator("#stock-info-status .banner-warn")).toBeVisible();

    await page.click('.tab-btn[data-type="daytrade"]');
    await page.click('.tab-btn[data-dir="long"]');
    await setForm(page, { price: 100, qty: 1, discount: 2.8, minFee: 20 });
    await page.click("#dt-calc-btn");
    const rows = await readRows(page);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.find((r) => r.current).cells[4]).toBe("-228");
    expect(errors).toEqual([]);
  });

  test("day-trade-calculator: no warning when stock_info.json loads", async ({ page }) => {
    await mockStockData(page);
    await page.goto("/day-trade-calculator.html");
    await expect(page.locator("#results-tbody tr").first()).toBeVisible();
    await expect(page.locator("#stock-info-status .banner")).toHaveCount(0);
  });

  // ---- margin-calculator ---------------------------------------------------
  test("margin-calculator: 融資 worked example (hand computed)", async ({ page }) => {
    const errors = collectErrors(page);
    await mockStockData(page);
    await page.goto("/margin-calculator.html");
    await page.click('[data-mode="long"]');
    await page.click('[data-ratio="0.6"]');
    await page.fill("#mg-price", "100");
    await page.fill("#mg-qty", "1");
    await page.fill("#mg-current", "70");
    await page.fill("#mg-days", "30");
    await page.fill("#mg-rate", "6.5");

    // loan = 100,000 x 0.6 = 60,000; call = 60,000 x 1.3 / 1,000 = 78.
    await expect(page.locator("#out-funded")).toHaveText("60,000");
    await expect(page.locator("#out-own")).toHaveText("40,000");
    await expect(page.locator("#out-call")).toHaveText("78.00");
    // ratio = 70,000 / 60,000 = 116.67%.
    await expect(page.locator("#out-ratio")).toHaveText("116.67%");
    // cash = 60,000 x 1.66 - 70,000; repay = ceil(60,000 - 70,000 / 1.66).
    await expect(page.locator("#out-cash")).toHaveText("29,600 元");
    await expect(page.locator("#out-repay")).toHaveText("17,832 元");
    // interest = floor(60,000 x 6.5% x 30 / 365) = 320.
    await expect(page.locator("#out-pnl")).toHaveText("-30,320");
    await expect(page.locator("#scenario-tbody tr.row-call")).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("margin-calculator: 150% and below is marked 警戒區", async ({ page }) => {
    await mockStockData(page);
    await page.goto("/margin-calculator.html");
    await page.click('[data-mode="long"]');
    await page.click('[data-ratio="0.6"]');
    await page.fill("#mg-price", "100");
    await page.fill("#mg-qty", "1");

    // 90,000 / 60,000 = exactly 150% -> 警戒區.
    await page.fill("#mg-current", "90");
    await expect(page.locator("#out-ratio")).toHaveText("150.00%");
    await expect(page.locator("#out-status")).toHaveClass(/status-warn/);
    await expect(page.locator("#out-status")).toContainText("警戒區");

    // 91,000 / 60,000 = 151.67% -> safe.
    await page.fill("#mg-current", "91");
    await expect(page.locator("#out-status")).toHaveClass(/status-ok/);
    await expect(page.locator("#out-status")).not.toContainText("警戒區");
  });

  test("margin-calculator: 融券 worked example and autofill", async ({ page }) => {
    const errors = collectErrors(page);
    await mockStockData(page);
    await page.goto("/margin-calculator.html");
    await page.click('[data-mode="short"]');
    await expect(page.locator("#interest-block")).toBeHidden();
    await page.click('[data-ratio="0.9"]');
    await page.fill("#mg-price", "100");
    await page.fill("#mg-qty", "1");
    await page.fill("#mg-current", "150");

    // margin 90,000; collateral 190,000; ratio = 190,000 / 150,000.
    await expect(page.locator("#out-funded")).toHaveText("90,000");
    await expect(page.locator("#out-ratio")).toHaveText("126.67%");
    await expect(page.locator("#out-call")).toHaveText("146.15");
    // cash = 150,000 x 1.66 - 190,000 = 59,000.
    await expect(page.locator("#out-cash")).toHaveText("59,000 元");

    await page.fill("#mg-stock-id", "2330");
    await page.click("#mg-autofill-btn");
    await expect(page.locator("#mg-current")).toHaveValue("600");
    expect(errors).toEqual([]);
  });

  // ---- screenshot-ocr ------------------------------------------------------
  // The real Tesseract.js comes from a CDN and downloads a 15 MB model, so the
  // test swaps in a fake that "reads" a fixed text.
  const OCR_STOCKS = {
    2330: { name: "台積電", type: "twse" },
    2317: { name: "鴻海", type: "twse" },
    6488: { name: "環球晶", type: "tpex" },
    2454: { name: "聯發科", type: "twse" },
  };
  const OCR_TEXT = "2330 台積電 1,050.00 +1.45%\n環 球 晶 512\n聯發料 1200\n總量 2317";
  const PNG_1PX = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  // Windows turns \n into \r\n on the way through the system clipboard.
  const readClipboard = async (page) =>
    (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");

  async function mockOcr(page, text) {
    await page.route("**/data/stock_info.json", (r) => r.fulfill(json(OCR_STOCKS)));
    await page.route("**/tesseract.js@*/**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `window.Tesseract = { createWorker: async (langs, oem, opts) => ({
          recognize: async () => { opts.logger({ status: "recognizing text", progress: 1 });
            return { data: { text: ${JSON.stringify(text)} } }; },
        }) };`,
      }),
    );
  }

  test("screenshot-ocr: finds codes and names, copies the confident ones", async ({ page, context }) => {
    const errors = collectErrors(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await mockOcr(page, OCR_TEXT);
    await page.goto("/screenshot-ocr.html");
    await page.setInputFiles("#file-input", { name: "shot.png", mimeType: "image/png", buffer: PNG_1PX });

    const rows = page.locator("#result-tbody tr");
    await expect(rows).toHaveCount(4);
    await expect(rows.locator(".code")).toHaveText(["2330", "6488", "2454", "2317"]);
    await expect(rows.locator(".name")).toHaveText(["台積電", "環球晶", "聯發科", "鴻海"]);
    await expect(page.locator("#result-summary")).toHaveText("共找到 4 檔，已選 2 檔");
    await expect(page.locator(".shot.done")).toHaveText("找到 4 檔");

    await page.click("#copy-codes-btn");
    expect(await readClipboard(page)).toBe("2330\n6488");

    // Opt in to the code-only match.
    await rows.nth(3).locator("input").check();
    await expect(page.locator("#result-summary")).toHaveText("共找到 4 檔，已選 3 檔");
    await page.click("#copy-both-btn");
    expect(await readClipboard(page)).toBe("2330 台積電\n6488 環球晶\n2317 鴻海");

    await page.click("#clear-btn");
    await expect(page.locator("#results")).toContainText("尚未辨識任何截圖");
    expect(errors).toEqual([]);
  });

  test("screenshot-ocr: switch between table and list views", async ({ page }) => {
    const errors = collectErrors(page);
    await mockOcr(page, OCR_TEXT);
    await page.goto("/screenshot-ocr.html");
    await page.setInputFiles("#file-input", { name: "shot.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(page.locator("#result-tbody tr")).toHaveCount(4);
    await expect(page.locator('[data-view="table"]')).toHaveAttribute("aria-pressed", "true");

    // The list shows only the checked stocks, one "code name" per line.
    await page.click('[data-view="list"]');
    await expect(page.locator("#result-tbody")).toHaveCount(0);
    await expect(page.locator("#result-list")).toHaveValue("2330 台積電\n6488 環球晶");

    // Back to the table, opt in to 2317, and the list follows.
    await page.click('[data-view="table"]');
    await page.locator('#result-tbody tr[data-code="2317"] input').check();
    await page.click('[data-view="list"]');
    await expect(page.locator("#result-list")).toHaveValue("2330 台積電\n6488 環球晶\n2317 鴻海");

    // The choice survives a reload.
    await page.reload();
    await page.setInputFiles("#file-input", { name: "shot.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(page.locator("#result-list")).toHaveValue("2330 台積電\n6488 環球晶");
    expect(errors).toEqual([]);
  });

  test("screenshot-ocr: no stocks found and non-image files", async ({ page }) => {
    await mockOcr(page, "今天天氣很好 123");
    await page.goto("/screenshot-ocr.html");
    await page.setInputFiles("#file-input", { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
    await expect(page.locator("#ocr-error")).toHaveText("請選擇圖片檔（PNG、JPG 等）");

    await page.setInputFiles("#file-input", { name: "shot.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(page.locator("#results-none")).toBeVisible();
    await expect(page.locator("#ocr-error")).toBeHidden();
    await expect(page.locator("#raw-text-pre")).toContainText("今天天氣很好");
  });

  // ---- portfolio -----------------------------------------------------------
  const STORAGE_KEY = "portfolio_holdings";

  test("portfolio: added holding persists across reload", async ({ page }) => {
    const errors = collectErrors(page);
    await mockStockData(page);
    await page.goto("/portfolio.html");
    await expect(page.locator("#empty-state")).toBeVisible();

    await page.click("#toggle-form-btn");
    await page.fill("#h-stock-id", "2330");
    await page.fill("#h-buy-date", "2024-01-02");
    await page.fill("#h-qty", "2");
    await page.selectOption("#h-unit", "lot");
    await page.fill("#h-cost", "400");
    await page.click("#form-submit-btn");

    // cost 2000 sh x 400 = 800,000; latest close in fixture 600 => 1,200,000.
    const row = page.locator("#holdings-tbody tr");
    await expect(row).toHaveCount(1);
    await expect(row.first()).toContainText("2330");
    await expect(row.first()).toContainText("800,000");
    await expect(row.first()).toContainText("1,200,000");
    await expect(row.first()).toContainText("+400,000");

    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORAGE_KEY);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ stockId: "2330", unit: "lot", shares: 2000, costPrice: 400 });

    await page.reload();
    await expect(page.locator("#holdings-tbody tr")).toHaveCount(1);
    await expect(page.locator("#holdings-tbody tr").first()).toContainText("800,000");
    expect(errors).toEqual([]);
  });

  test("portfolio: holding pre-seeded under the existing key still loads", async ({ page }) => {
    const errors = collectErrors(page);
    await mockStockData(page);
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [
        STORAGE_KEY,
        JSON.stringify([
          { id: "h_seed_1", stockId: "2330", buyDate: "2024-01-02", unit: "share", shares: 500, costPrice: 300 },
        ]),
      ],
    );
    await page.goto("/portfolio.html");

    const row = page.locator("#holdings-tbody tr");
    await expect(row).toHaveCount(1);
    await expect(row.first()).toContainText("2330");
    await expect(row.first()).toContainText("500 股");
    await expect(row.first()).toContainText("150,000"); // cost 500 x 300
    await expect(row.first()).toContainText("300,000"); // value 500 x 600
    await expect(page.locator("#sum-pl")).toHaveText("+150,000");
    expect(errors).toEqual([]);
  });

  test("portfolio: warns when stock_info.json fails and still renders seeded holdings", async ({ page }) => {
    const errors = collectErrors(page);
    await page.route("**/data/stock_info.json", (r) => r.abort());
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [
        STORAGE_KEY,
        JSON.stringify([
          { id: "h_seed_2", stockId: "2330", buyDate: "2024-01-02", unit: "lot", shares: 1000, costPrice: 500 },
        ]),
      ],
    );
    await page.goto("/portfolio.html");
    await expect(page.locator("#stock-info-status .banner-warn")).toBeVisible();
    await expect(page.locator("#holdings-tbody tr")).toHaveCount(1);
    await expect(page.locator("#holdings-tbody tr").first()).toContainText("500,000");
    expect(errors).toEqual([]);
  });
});
