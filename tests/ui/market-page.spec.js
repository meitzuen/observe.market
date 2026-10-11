const { test, expect } = require("@playwright/test");

for (const market of ["twse", "tpex"]) {
  test.describe(`${market}.html market page`, () => {
    test.beforeEach(async ({}, testInfo) => {
      test.skip(testInfo.project.name !== "desktop");
    });

    test("renders stock rows and the index chart canvas", async ({ page }) => {
      await page.goto(`/${market}.html`, { waitUntil: "networkidle" });
      await expect(page.locator("#stock-list tr").first()).toBeVisible();
      expect(await page.locator("#stock-list tr").count()).toBeGreaterThan(0);
      await expect(page.locator("canvas#indexChart")).toHaveCount(1);
    });

    test("changing the date picker loads that day's daily_price and re-renders", async ({ page }) => {
      await page.goto(`/${market}.html`, { waitUntil: "networkidle" });
      const options = await page.locator("#date-picker option").evaluateAll((os) => os.map((o) => o.value));
      expect(options.length).toBeGreaterThan(1);
      const current = await page.locator("#date-picker").inputValue();
      const target = options.find((v) => v !== current);
      const reqPromise = page.waitForRequest(
        (r) => r.url().includes(`data/${market}/daily_price/`) && r.url().includes(target)
      );
      await page.locator("#date-picker").selectOption(target);
      await reqPromise;
      await expect(page.locator("#date-picker")).toHaveValue(target);
      await expect(page.locator("#stock-list tr").first()).toBeVisible();
    });

    test("typing a code in #stock-search filters rows", async ({ page }) => {
      await page.goto(`/${market}.html`, { waitUntil: "networkidle" });
      await expect(page.locator("#stock-list tr").first()).toBeVisible();
      const code = (await page.locator("#stock-list tr").first().locator("td").first().innerText()).trim();
      expect(code.length).toBeGreaterThan(0);
      await page.locator("#stock-search").fill(code);
      const rows = page.locator("#stock-list tr");
      await expect(async () => {
        const texts = await rows.allInnerTexts();
        expect(texts.length).toBeGreaterThan(0);
        for (const t of texts) expect(t).toContain(code);
      }).toPass();
      // And it actually narrows (an unmatched query yields no stock rows containing it).
      await page.locator("#stock-search").fill("ZZZZ-NO-MATCH");
      await expect(async () => {
        const texts = await rows.allInnerTexts();
        for (const t of texts) expect(t).not.toContain(code);
      }).toPass();
    });

    test("'/' focuses #stock-search and does not open global search", async ({ page }) => {
      await page.goto(`/${market}.html`, { waitUntil: "networkidle" });
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("/");
      await expect(page.locator("#stock-search")).toBeFocused();
      await expect(page.locator(".search-overlay")).toBeHidden();
    });
  });
}

test.describe("market redirects", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  test("cross-market and warrant params redirect", async ({ page }) => {
    await page.goto("/twse.html?market=tpex");
    await page.waitForURL(/\/tpex\.html/);
    await page.goto("/tpex.html?market=twse");
    await page.waitForURL(/\/twse\.html/);
    await page.goto("/twse.html?market=warrant");
    await page.waitForURL(/\/premium-warrant\.html/);
  });

  test("same-market param does not redirect", async ({ page }) => {
    await page.goto("/twse.html?market=twse", { waitUntil: "networkidle" });
    expect(page.url()).toMatch(/\/twse\.html\?market=twse$/);
    await expect(page.locator("#stock-list tr").first()).toBeVisible();
  });
});
