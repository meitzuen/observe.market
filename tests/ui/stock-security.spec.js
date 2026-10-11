const { test, expect } = require("@playwright/test");

// stock.html echoes the ?id= parameter in its not-found message before the id
// has been validated; it must be rendered as literal text. Desktop only.

test.describe("stock.html ?id= is never interpreted as HTML", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  const cases = [
    ["img onerror", "<img src=x onerror=window.__pwned=1>"],
    ["script breakout", '"><script>window.__pwned=1</script>'],
  ];
  for (const [name, payload] of cases) {
    test(`${name}: payload shows as literal text, nothing injected`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto("/stock.html?id=" + encodeURIComponent(payload), { waitUntil: "networkidle" });

      await expect(page.locator("#content-area")).toContainText("查無此股票");
      expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
      expect(await page.locator("#content-area img").count()).toBe(0);
      expect(await page.locator("#content-area script").count()).toBe(0);
      const msg = (await page.locator("#content-area .empty-state p").textContent()) || "";
      expect(msg).toContain(payload);
      expect(errors).toEqual([]);
    });
  }
});
