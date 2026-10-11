const { test, expect } = require("@playwright/test");

const COMPONENTS = [
  "button", "chip", "pill", "tag", "badge", "search-input", "select",
  "stat-tile", "data-table", "page-header", "toolbar", "tabs", "tooltip",
  "empty-state", "skeleton", "error-banner", "stale-banner",
];

test("gallery renders every component with design tokens applied", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
  for (const name of COMPONENTS) {
    await expect(
      page.locator(`[data-component="${name}"]`).first(),
      `component ${name}`,
    ).toBeVisible();
  }
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(246, 247, 251)");
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font).toContain("Inter");
  expect(errors).toEqual([]);
});
