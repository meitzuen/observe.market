const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const pages = require("./pages.json");
const migrated = new Set(require("./migrated.json"));
const baselineOverflow = new Set(require("./baseline-overflow.json"));
const known404 = require("./known-404.json").map((s) => new RegExp(s));
const ORIGIN = "http://127.0.0.1:4173";

for (const file of pages) {
  test(`${file} loads cleanly`, async ({ page }, testInfo) => {
    const problems = [];
    page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.origin !== ORIGIN || r.status() < 400) return;
      if (u.pathname.endsWith("favicon.ico")) return;
      if (known404.some((re) => re.test(u.pathname))) return;
      problems.push(`${r.status()} ${u.pathname}`);
    });

    await page.goto("/" + file, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    const shotDir = path.join("test-results", "shots", testInfo.project.name);
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({
      path: path.join(shotDir, file.replace(".html", ".png")),
      fullPage: true,
    });

    expect(problems, problems.join("\n")).toEqual([]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (migrated.has(file) || !baselineOverflow.has(file)) {
      expect(overflow, "horizontal page overflow (px)").toBeLessThanOrEqual(1);
    }

    if (migrated.has(file)) {
      await expect(page.locator("#site-header .brand")).toBeVisible();
      await expect(page.locator("#site-header .site-nav")).toHaveCount(1);
      await expect(page.locator("#site-footer")).toHaveCount(1);
      await expect(page.locator('link[href$="assets/ui.css"]')).toHaveCount(1);
      await expect(
        page.locator('link[href*="nerd-grid"], script[src*="nerd-grid"]'),
      ).toHaveCount(0);
    }
  });
}
