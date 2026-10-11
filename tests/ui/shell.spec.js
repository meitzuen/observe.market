const { test, expect } = require("@playwright/test");

const STALE_MANIFEST = {
  twse: { daily_price: ["2020-01-01"] },
  tpex: { daily_price: ["2020-01-01"] },
};

test.describe("desktop shell", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  test("renders six groups and opens/closes a mega-menu", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    const buttons = page.locator("#site-header .nav-group-btn");
    await expect(buttons).toHaveCount(6);
    const strategy = buttons.nth(1);
    await strategy.click();
    await expect(strategy).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#mega-1 .mega-item")).toHaveCount(6);
    await page.keyboard.press("Escape");
    await expect(strategy).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#mega-1")).toBeHidden();
    await expect(strategy).toBeFocused();
  });

  test("Ctrl+K search finds a stock and Enter navigates to stock.html?id=", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await expect(page.locator(".search-overlay")).toBeVisible();
    await page.locator("#search-input").fill("2330");
    await expect(page.locator(".search-item").first()).toContainText("2330");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/stock\.html\?id=2330$/);
  });

  test("search finds pages by name", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.locator("[data-open-search]").click();
    await page.locator("#search-input").fill("跳空");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/gap\.html$/);
  });

  test("lowercase letter-suffixed code is found", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.locator("#search-input").fill("00835b");
    await expect(page.locator(".search-item").first()).toContainText("00835B");
  });

  test("hostile search text injects nothing and shows no-result", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.locator("#search-input").fill("<img src=x onerror=window.__pwned=1>");
    await expect(page.locator(".search-hint")).toContainText("找不到");
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    for (const q of [".*", "(", "\\", "[a-"]) {
      await page.locator("#search-input").fill(q);
      await expect(page.locator("#search-results")).toBeVisible();
    }
  });

  test("stock_info failure still allows page search with a notice", async ({ page }) => {
    await page.route("**/data/stock_info.json", (r) => r.fulfill({ status: 500, body: "x" }));
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await page.locator("#search-input").fill("vcp");
    await expect(page.locator(".search-item").first()).toContainText("VCP");
    await expect(page.locator("#search-results")).toContainText("股票清單載入失敗");
  });

  test("manifest failure keeps the header and shows an unavailable date", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/data/manifest.json", (r) => r.fulfill({ status: 404, body: "no" }));
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await expect(page.locator("#site-header .nav-group-btn")).toHaveCount(6);
    await expect(page.locator(".footer-asof")).toHaveText("資料日期暫時無法取得");
    expect(errors).toEqual([]);
  });

  test("invalid manifest JSON is handled", async ({ page }) => {
    await page.route("**/data/manifest.json", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "{not json" }),
    );
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await expect(page.locator(".footer-asof")).toHaveText("資料日期暫時無法取得");
  });

  test("stale banner appears, dismisses, and survives blocked sessionStorage", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", {
        get() { throw new Error("blocked"); },
      });
    });
    await page.route("**/data/manifest.json", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STALE_MANIFEST) }),
    );
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    const banner = page.locator("#site-header + .banner-warn");
    await expect(banner).toContainText("2020-01-01");
    await expect(page.locator(".footer-asof")).toHaveText("資料截至 2020-01-01");
    await banner.locator("button").click();
    await expect(banner).toHaveCount(0);
  });

  test("/ does not open global search on pages that own #stock-search", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.evaluate(() => {
      const i = document.createElement("input");
      i.id = "stock-search";
      i.style.display = "none";
      document.body.appendChild(i);
    });
    await page.keyboard.press("/");
    await expect(page.locator(".search-overlay")).toHaveCount(0);
  });
});

test.describe("mobile shell", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile");
  });

  test("hamburger opens the drawer and nav buttons are hidden", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await expect(page.locator("#site-header .site-nav")).toBeHidden();
    await page.locator(".nav-toggle").click();
    await expect(page.locator("#site-drawer")).toBeVisible();
    await expect(page.locator("#site-drawer a").first()).toBeVisible();
  });

  test("drawer closes when the viewport widens to desktop", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.locator(".nav-toggle").click();
    await expect(page.locator("#site-drawer")).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator("#site-drawer")).toBeHidden();
    await expect(page.locator(".nav-toggle")).toHaveAttribute("aria-expanded", "false");
  });

  test("320px width does not overflow horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("search opens full-screen on mobile", async ({ page }) => {
    await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
    await page.locator("[data-open-search]").click();
    const box = await page.locator(".search-dialog").boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(388);
  });
});
