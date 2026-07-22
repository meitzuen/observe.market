# MongoDB Schema 設計（取代 docs/data 靜態 JSON）

## 背景

目前每日透過 `src/fetch_and_save.py` / `src/gap_strategy.py` 把大盤、個股、處置股、跳空、權證資料寫成靜態 JSON，存放於 `docs/data/`，並由 GitHub Pages 直接提供給前端讀取。隨著每日新增檔案，repo size 會持續成長。

其中最大的浪費：同一份股價資料被存了兩次——`{market}/daily_price/{date}.json`（依日期切）與 `{market}/stock_history/{id}.json`（依股票代號重組，且 `generate_stock_history.py` 每天全量重寫 894~1093 個檔案）。搬進 MongoDB 後這兩者可合併成一個 collection，靠索引同時支援兩種查詢方向，徹底消除重複儲存與每日全量重建。

## Collections

### 1. `stocks` — 個股基本資料
取代 `stock_info.json`。

```js
_id: "2330",                          // 股票代號
name: "台積電",
market: "twse" | "tpex" | "emerging", // 來源資料實際有三種值，不只 twse/tpex
updated_at: ISODate
```

### 2. `daily_prices` — 個股日線 OHLCV
取代 `daily_price/*.json` **和** `stock_history/*.json`。

```js
_id: "twse_2330_2026-07-22",          // market_stockid_date，天然去重、可直接 upsert
market: "twse" | "tpex",
stock_id: "2330",
name: "台積電",                        // 存快照名稱，股名偶爾會變
date: ISODate("2026-07-22"),
open: Number, high: Number, low: Number, close: Number,
volume: Number, change: Number, change_percent: Number
```

索引：
- unique `{ market:1, stock_id:1, date:1 }`
- `{ market:1, date:1 }` → 取代「某天全市場快照」查詢
- `{ stock_id:1, date:-1 }` → 取代「單一股票歷史走勢」查詢；`generate_stock_history.py` 可直接刪除

### 3. `market_index` — 大盤指數
取代 `daily_index/*.json` + `index_history.json`。

```js
_id: "twse_2026-07-22",
market, date: ISODate,
volume: Number, turnover: Number, transactions: Number,
index: Number, changes: Number
```

索引：unique `{ market:1, date:1 }`。`fetch_and_save.py` 裡的 `rebuild_index_history()`（合併所有檔案的邏輯）可移除，改用 `find({market}).sort({date:1})`。

### 4. `punishments` — 處置股
取代 `daily_punish/*.json` + `punish_history.json`。

```js
_id: "twse_3675_2026-05-22",          // market_stockid_publishdate
market, stock_id, name,
publish_date: ISODate,
measure: "第一次處置", accumulated: Number, condition: String,
from: ISODate, to: ISODate
```

索引：unique `{ market:1, stock_id:1, publish_date:1 }`，另加 `{ market:1, publish_date:1 }`，支援 `punish.html` 目前直接打上游 API 用的 `start_date/end_date` 區間查詢。

### 5. `gap_events` — 跳空強弱勢股
取代 `gap_jump/*.json` + `gap_drop/*.json`。

```js
_id: "twse_jump_1264_2026-06-04",
market, direction: "jump" | "drop",
stock_id, name, date: ISODate,
today_close: Number, reference_price: Number,   // jump 用 prev_high，drop 用 prev_low
diff: Number, ratio: Number, gap_diff: Number, gap_ratio: Number, volume: Number
```

索引：unique `{ market:1, direction:1, stock_id:1, date:1 }`，`{ market:1, direction:1, date:1 }` 供每日清單查詢。

備註：此資料完全可從 `daily_prices` 用聚合（比較今天 close 跟昨天 high/low）即時算出，不一定要落地存。先照現有 pipeline 存成 collection 較好移植，未來要省一個 collection 可改成 on-the-fly aggregation。

### 6. `warrants` — 權證日快照
取代 `warrant/*.json`。

來源欄位是中文 key（約 40 個），建議**保留原中文欄位**直接存，只額外正規化幾個關鍵欄位方便建索引：

```js
_id: "065423_2026-07-22",             // warrant_id_date
date: ISODate,
warrant_id: "065423",                 // 從「權證代碼」抽出來
underlying_id: "00981A",              // 從「標的代碼」抽出來
// ...其餘原始中文欄位原樣 spread 進來...
```

索引：unique `{ warrant_id:1, date:1 }`，`{ date:1 }`。降低搬遷時手動翻譯 40 個欄位造成的出錯風險，未來要重構成英文 key 再慢慢做。

## 不需要搬進 Mongo 的東西

- **`manifest.json`**：只是「有哪些日期」的索引，Mongo 用 `distinct("date", {market})`（配合上面索引）即時查即可，不用維護額外檔案。
- **`stock_history/*.json`**：被 `daily_prices` 的 `{stock_id, date}` 索引取代，`generate_stock_history.py` 整支可刪除。
- **`latest.json` / `punish_history.json`**：確認過前端沒有任何頁面在讀這兩個檔案（死程式碼），Mongo 版直接用查詢取代（sort date desc limit 1 / find sorted），不用另外落地。

## Retention

現行 180 天保留機制是為了控制 git repo 大小；Mongo 沒有這個壓力（`stock_history` 本來就無限保留）。建議先不做 TTL，全部資料留著方便畫長期走勢圖。若之後 `gap_events`（價值較低、可重算）容量變大，再對它的 `date` 欄位加 TTL index 即可。

## API 對應

| 現有前端讀取路徑 | 新 API |
|---|---|
| `data/manifest.json` | `GET /api/:market/dates?category=` |
| `data/{market}/daily_price/{date}.json` | `GET /api/:market/daily-prices?date=` |
| `data/{market}/stock_history/{id}.json` | `GET /api/:market/stocks/:id/history?from=&to=` |
| `data/{market}/index_history.json` / `daily_index/{date}.json` | `GET /api/:market/index?from=&to=` |
| `data/{market}/daily_punish/{date}.json` | `GET /api/:market/punishments?start_date=&end_date=` |
| `data/{market}/gap_jump\|gap_drop/{date}.json` | `GET /api/:market/gap?direction=&date=` |
| `data/warrant/{date}.json` | `GET /api/warrants?date=` |
| `data/stock_info.json` | `GET /api/stocks?market=&q=` |

寫入端（`fetch_and_save.py` / `gap_strategy.py`）不用經過 HTTP，直接把 `save_to_file()` 換成對應 collection 的 `bulkWrite(upsert)`，用上面設計的確定性 `_id` 即可保證重跑不會重複。
