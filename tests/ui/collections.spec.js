const { test, expect } = require("@playwright/test");

// Behaviour spec for the collection pages: bookmark and watchlist. Desktop
// only. Both pages talk to a cross-origin API that is blocked locally, so the
// API and the price files are served from route fixtures; expected values are
// computed in the test from those fixtures.

const API = "https://market.smallplum.xyz";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "*",
};
const json = (body, status = 200) => ({
  status,
  contentType: "application/json",
  headers: CORS,
  body: JSON.stringify(body),
});

function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("collection pages behaviour", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
  });

  // ---- bookmark ----------------------------------------------------------
  const BOOKMARKS = () => [
    { _id: { $oid: "a1" }, name: "Alpha Site", url: "https://alpha.example.com/x", note: "first note" },
    { _id: { $oid: "b2" }, name: "Beta Site", url: "https://beta.example.org/y", note: "" },
  ];

  async function mockBookmarks(page, opts = {}) {
    const state = { items: opts.items || BOOKMARKS(), fail: !!opts.fail, calls: [] };
    await page.route(/\/api\/mktobs\/bookmark/, async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      state.calls.push({ method: req.method(), url: req.url(), body });
      if (req.method() === "GET") {
        if (state.fail) return route.abort();
        return route.fulfill(json(state.items));
      }
      if (req.method() === "POST") return route.fulfill(json({ _id: "c3", ...body }));
      if (req.method() === "PUT") return route.fulfill(json({ ok: true }));
      return route.fulfill(json({ ok: true }));
    });
    return state;
  }

  test("bookmark: fixture items render as cards linking out", async ({ page }) => {
    const errors = collectErrors(page);
    const api = await mockBookmarks(page);
    await page.goto("/bookmark.html");
    const cards = page.locator("#bookmark-grid .bookmark-card");
    await expect(cards).toHaveCount(api.items.length);
    const links = page.locator("#bookmark-grid a.bookmark-name");
    for (let i = 0; i < api.items.length; i++) {
      await expect(links.nth(i)).toHaveAttribute("href", api.items[i].url);
      await expect(links.nth(i)).toHaveText(api.items[i].name);
      await expect(links.nth(i)).toHaveAttribute("target", "_blank");
    }
    await expect(cards.nth(0).locator(".bookmark-note")).toHaveText(api.items[0].note);
    await expect(cards.nth(1).locator(".bookmark-note")).toHaveCount(0);
    // not admin: no add button, no edit/delete
    await expect(page.locator("#toggle-form-btn")).toBeHidden();
    await expect(page.locator(".bookmark-actions")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("bookmark: admin add, edit and delete use the API", async ({ page }) => {
    const errors = collectErrors(page);
    const api = await mockBookmarks(page);
    await page.goto("/bookmark.html?admin=True");
    const cards = page.locator("#bookmark-grid .bookmark-card");
    await expect(cards).toHaveCount(2);

    // add
    await page.locator("#toggle-form-btn").click();
    await page.locator("#bm-name").fill("Gamma");
    await page.locator("#bm-url").fill("https://gamma.example.net/z");
    await page.locator("#bm-note").fill("g note");
    await page.locator("#form-submit-btn").click();
    await expect(cards).toHaveCount(3);
    const post = api.calls.find((c) => c.method === "POST");
    expect(post.body).toEqual({ name: "Gamma", url: "https://gamma.example.net/z", note: "g note" });
    await expect(cards.nth(2).locator("a.bookmark-name")).toHaveText("Gamma");

    // edit the first card
    await cards.nth(0).locator('.btn-icon[title="編輯"]').click();
    await expect(page.locator("#bm-name")).toHaveValue("Alpha Site");
    await page.locator("#bm-name").fill("Alpha Renamed");
    await page.locator("#form-submit-btn").click();
    await expect(cards.nth(0).locator("a.bookmark-name")).toHaveText("Alpha Renamed");
    const put = api.calls.find((c) => c.method === "PUT");
    expect(put.url).toContain("/bookmark/a1");
    expect(put.body.name).toBe("Alpha Renamed");

    // delete the second card
    page.once("dialog", (d) => d.accept());
    await cards.nth(1).locator('.btn-icon[title="刪除"]').click();
    await expect(cards).toHaveCount(2);
    const del = api.calls.find((c) => c.method === "DELETE");
    expect(del.url).toContain("/bookmark/b2");
    await expect(page.locator("#bookmark-grid")).not.toContainText("Beta Site");
    expect(errors).toEqual([]);
  });

  test("bookmark: empty collection shows the empty state", async ({ page }) => {
    await mockBookmarks(page, { items: [] });
    await page.goto("/bookmark.html");
    await expect(page.locator("#empty-state .empty-state")).toBeVisible();
    await expect(page.locator("#bookmark-grid")).toBeHidden();
    await expect(page.locator(".banner-error")).toHaveCount(0);
  });

  test("bookmark: failed API shows error state and Retry recovers", async ({ page }) => {
    const errors = collectErrors(page);
    const api = await mockBookmarks(page, { fail: true });
    await page.goto("/bookmark.html");
    const banner = page.locator("#bookmark-state .banner-error");
    await expect(banner).toBeVisible();
    // an error is not also reported as an empty collection
    await expect(page.locator("#empty-state")).toBeHidden();
    await expect(page.locator("#bookmark-grid .bookmark-card")).toHaveCount(0);

    api.fail = false;
    await banner.locator('[data-action="retry"]').click();
    await expect(page.locator("#bookmark-grid .bookmark-card")).toHaveCount(2);
    await expect(page.locator(".banner-error")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  // ---- watchlist ---------------------------------------------------------
  const MANIFEST = { twse: { daily_price: ["2024-01-03"] }, tpex: { daily_price: ["2024-01-03"] } };
  const TWSE = [
    { id: "2330", name: "台積電", open: 100, high: 110, low: 99, close: 105, volume: 50000000, change: 5, change_percent: 5.0 },
    { id: "2317", name: "鴻海", open: 50, high: 51, low: 48, close: 49, volume: 20000000, change: -1, change_percent: -2.0 },
    { id: "2454", name: "聯發科", open: 900, high: 920, low: 890, close: 910, volume: 3000000, change: 0, change_percent: 0 },
  ];
  const TPEX = [
    { id: "6488", name: "環球晶", open: 400, high: 410, low: 395, close: 405, volume: 1000000, change: 2, change_percent: 0.5 },
  ];
  const LISTS = () => [
    {
      _id: { $oid: "L1" },
      name: "AI 伺服器",
      order: 1,
      items: [
        { stock_id: "2330", note: "晶圓代工", is_top: true },
        { stock_id: "2317", note: "組裝", is_top: false },
        { stock_id: "2454", note: "IC設計", is_top: false },
      ],
    },
    { _id: { $oid: "L2" }, name: "櫃買精選", order: 2, items: [{ stock_id: "6488", note: "矽晶圓", is_top: false }] },
    { _id: { $oid: "L3" }, name: "空列表", order: 3, items: [] },
  ];

  async function mockWatchlist(page, opts = {}) {
    const state = { lists: opts.lists || LISTS(), fail: !!opts.fail, calls: [], manifestFail: !!opts.manifestFail };
    await page.route("**/data/manifest.json", (r) =>
      state.manifestFail ? r.abort() : r.fulfill(json(MANIFEST)),
    );
    await page.route("**/data/twse/daily_price/2024-01-03.json", (r) => r.fulfill(json(TWSE)));
    await page.route("**/data/tpex/daily_price/2024-01-03.json", (r) => r.fulfill(json(TPEX)));
    await page.route(/\/api\/mktobs\/watchlist/, async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      state.calls.push({ method: req.method(), url: req.url(), body });
      if (req.method() === "GET") {
        if (state.fail) return route.abort();
        return route.fulfill(json(state.lists));
      }
      return route.fulfill(json({ ok: true }));
    });
    return state;
  }

  const rowIds = (page) => page.locator("#watchlist-tbody tr td:first-child a");
  const allPrices = [...TWSE, ...TPEX];

  async function pickList(page, name) {
    await page.locator("#wl-selector-trigger").click();
    await page.locator(`.wl-dropdown-item[data-name="${name}"]`).click();
  }

  test("watchlist: each list shows exactly its own stocks with fixture prices", async ({ page }) => {
    const errors = collectErrors(page);
    const api = await mockWatchlist(page);
    await page.goto("/watchlist.html");
    await expect(page.locator("#wl-selector-label")).toHaveText(api.lists[0].name);

    const lists = api.lists.filter((l) => l.items.length > 0);
    expect(lists.length).toBeGreaterThanOrEqual(2);
    for (const [i, list] of lists.entries()) {
      if (i > 0) await pickList(page, list.name);
      await expect(page.locator("#active-list-name")).toHaveText(list.name);
      await expect(rowIds(page)).toHaveCount(list.items.length);
      const ids = await rowIds(page).allTextContents();
      expect(ids).toEqual(list.items.map((it) => it.stock_id));
      // links go to the stock page
      for (const id of ids) {
        await expect(page.locator(`#watchlist-tbody a[href="stock.html?id=${id}"]`)).toHaveCount(1);
      }
      // close price comes from the price fixture
      const firstClose = (await page.locator("#watchlist-tbody tr").first().locator("td").nth(2).textContent()).trim();
      const expected = allPrices.find((p) => p.id === list.items[0].stock_id).close.toFixed(2);
      expect(firstClose).toBe(expected);
    }

    // every list is selectable from the dropdown
    await page.locator("#wl-selector-trigger").click();
    await expect(page.locator(".wl-dropdown-item")).toHaveCount(api.lists.length);
    expect(errors).toEqual([]);
  });

  test("watchlist: sort by close and top-leader tag", async ({ page }) => {
    await mockWatchlist(page);
    await page.goto("/watchlist.html");
    await expect(rowIds(page)).toHaveCount(3);
    await page.locator('th[data-col="close"]').click();
    const asc = TWSE.map((s) => s).sort((a, b) => a.close - b.close).map((s) => s.id);
    expect(await rowIds(page).allTextContents()).toEqual(asc);
    await page.locator('th[data-col="close"]').click();
    expect(await rowIds(page).allTextContents()).toEqual([...asc].reverse());
    // 2330 is flagged as sector leader
    await expect(page.locator("#watchlist-tbody tr", { hasText: "2330" }).locator(".top-tag")).toHaveCount(1);
    await expect(page.locator(".top-tag")).toHaveCount(1);
  });

  test("watchlist: admin add and remove call the API and update rows", async ({ page }) => {
    const errors = collectErrors(page);
    const api = await mockWatchlist(page);
    await page.goto("/watchlist.html?admin=True");
    await expect(rowIds(page)).toHaveCount(3);
    await page.locator("#toggle-add-btn").click();
    await page.locator("#stock-id").fill("6488");
    await page.locator("#stock-note").fill("新標籤");
    await page.locator("#add-btn").click();
    await expect(rowIds(page)).toHaveCount(4);
    const patch = api.calls.find((c) => c.method === "PATCH");
    expect(patch.url).toContain("/watchlist/");
    expect(patch.body).toEqual({ stock_id: "6488", note: "新標籤", is_top: false });

    await page.locator("#watchlist-tbody tr", { hasText: "2317" }).getByRole("button", { name: "移除" }).click();
    await expect(rowIds(page)).toHaveCount(3);
    const del = api.calls.find((c) => c.method === "DELETE");
    expect(del.url).toContain("/items/2317");
    expect(await rowIds(page).allTextContents()).not.toContain("2317");
    expect(errors).toEqual([]);
  });

  test("watchlist: empty list and no lists use the empty state", async ({ page }) => {
    await mockWatchlist(page);
    await page.goto("/watchlist.html");
    await pickList(page, "空列表");
    await expect(page.locator("#empty-state .empty-state")).toBeVisible();
    await expect(page.locator("#watchlist-table")).toBeHidden();

    const page2 = await page.context().newPage();
    await mockWatchlist(page2, { lists: [] });
    await page2.goto("/watchlist.html?admin=True");
    await expect(page2.locator("#no-list-state .empty-state")).toBeVisible();
    await expect(page2.locator(".banner-error")).toHaveCount(0);
  });

  test("watchlist: failed list API shows error (not empty) and Retry recovers", async ({ page }) => {
    const errors = collectErrors(page);
    const api = await mockWatchlist(page, { fail: true });
    await page.goto("/watchlist.html");
    const banner = page.locator("#wl-state .banner-error");
    await expect(banner).toBeVisible();
    await expect(page.locator("#no-list-state")).toBeHidden();
    await expect(page.locator("#watchlist-section")).toBeHidden();

    api.fail = false;
    await banner.locator('[data-action="retry"]').click();
    await expect(rowIds(page)).toHaveCount(3);
    await expect(page.locator(".banner-error")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("watchlist: failed price manifest shows error, lists stay usable, Retry recovers", async ({ page }) => {
    const errors = collectErrors(page);
    const api = await mockWatchlist(page, { manifestFail: true });
    await page.goto("/watchlist.html");
    const banner = page.locator("#wl-state .banner-error");
    await expect(banner).toBeVisible();
    // watchlist itself still renders, prices fall back to the placeholder
    await expect(rowIds(page)).toHaveCount(3);
    const close = (await page.locator("#watchlist-tbody tr").first().locator("td").nth(2).textContent()).trim();
    expect(close).toBe("—");

    api.manifestFail = false;
    await banner.locator('[data-action="retry"]').click();
    await expect(page.locator(".banner-error")).toHaveCount(0);
    await expect
      .poll(async () =>
        (await page.locator("#watchlist-tbody tr").first().locator("td").nth(2).textContent()).trim(),
      )
      .toBe("105.00");
    expect(errors).toEqual([]);
  });
});
