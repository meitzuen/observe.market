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

test("renderState wires retry and empty-state actions", async ({ page }) => {
  await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
  await page.locator("#state-error [data-action=retry]").click();
  await expect(page.locator("body")).toHaveAttribute("data-retried", "1");
  await page.locator("#state-empty [data-action=empty]").click();
  await expect(page.locator("body")).toHaveAttribute("data-reset", "1");
  await expect(page.locator("#state-skeleton .skeleton")).toHaveCount(4);
});

test("renderState escapes message text", async ({ page }) => {
  await page.goto("/ui-gallery.html", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    UIData.renderState(document.getElementById("state-error"), "error", {
      message: "<img src=x onerror=window.__pwned=1>",
    });
  });
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(page.locator("#state-error span")).toContainText("<img");
});
