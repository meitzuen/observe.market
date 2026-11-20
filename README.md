# Market Observer | 市場觀測站

每天自動抓取台灣股市（上市 TWSE／上櫃 TPEx）的大盤與個股資料，跑完各種選股策略後，用純靜態網頁（GitHub Pages）呈現的市場觀測工具。

## 目錄

- [功能一覽](#功能一覽)
- [運作方式](#運作方式)
- [快速開始](#快速開始)
- [資料管線與 R2](#資料管線與-r2)
- [專案結構](#專案結構)
- [測試](#測試)
- [CI／CD](#cicd)
- [授權](#授權)

## 功能一覽

網站導覽列依用途分成六類（頁面檔名皆在 `docs/` 下）。

| 分類 | 頁面 | 說明 |
|---|---|---|
| 市場 | `index`、`twse`、`tpex` | 上市＋上櫃整合大盤、單一市場大盤與個股行情；Chart.js 趨勢圖、搜尋、價格與成交量篩選 |
| 市場 | `stock` | 個股歷史走勢與近期成交明細（從任一股票代號進入） |
| 策略 | `gap` | 跳空缺口：Gap Jump／Gap Drop 強弱勢個股 |
| 策略 | `vcp` | 依 Mark Minervini 的 VCP（Volatility Contraction Pattern）篩選收縮型態 |
| 策略 | `head-shoulders` | 頭肩底／頭肩頂型態選股 |
| 策略 | `volume-candle` | 爆量長紅 K／長黑 K |
| 策略 | `surge` | 飆股分析：起漲日後漲到各門檻所需交易日 |
| 策略 | `punish` | 最新處置股票名單 |
| 策略 | `wantgoo` | Wantgoo 基本面排行 |
| 策略 | `volatility` | 區間日／年化波動率與期間漲跌 |
| 策略 | `backtest` | 各策略訊號的事後報酬與回撤 |
| 權證 | `warrant-filter`、`premium-warrant` | 權證篩選器、精選權證 |
| 選股 | `screener` | 任意日期區間的漲幅／跌幅／成交量／連續上漲天數排行 |
| 選股 | `watchlist` | 依類股分類的精選股票 |
| 個人 | `bookmark`、`portfolio` | 常用連結、持股損益試算 |
| 管理 | `dashboard` | Google 登入（白名單）後才能使用新增／編輯／刪除等管理功能 |
| 個人 | `margin-calculator` | 融資融券維持率與追繳價試算 |
| 個人 | `screenshot-ocr` | 從截圖辨識台股代號與名稱 |
| 當沖 | `day-trade-calculator`、`xiaoge-strategy` | 當沖損益與成本試算、小哥策略當沖選股（多方／空方） |

另外：全站搜尋（⌘K / Ctrl+K）、「資料截至」提示、手機版版面，以及不在導覽中的元件展示頁 `ui-gallery`。

## 運作方式

```
 TWSE / TPEx / Wantgoo / MoneyDJ …
              │  (GitHub Actions 每個交易日)
              ▼
   src/*.py  抓取 + 策略計算 ──► docs/data/*.json
                                    │
                                    ▼
                       Cloudflare R2 (公開讀取)
                                    │  fetch (UIData.dataUrl)
                                    ▼
          docs/*.html  靜態頁面 ──► GitHub Pages
```

- **資料與程式分離**：`docs/data/` 不進 git（在 `.gitignore`），由 R2 儲存並提供給前端。
- **前端是純靜態多頁應用**：沒有建置步驟，共用 `docs/assets/` 裡的設計系統與工具。`volatility`、`screener` 等頁面直接讀每日快照在瀏覽器計算，不需要額外的資料管線。

## 快速開始

需求：Python 3.11+、Node.js 22+（只有跑 UI 測試才需要）。

### 1. 安裝 Python 環境

```bash
pip install -r requirements.txt
```

### 2. 預覽網頁

```bash
python3 scripts/serve.py 8000
```

開啟 <http://localhost:8000>。請不要用 `python -m http.server`，因為需要 `/stock` 對應到 `stock.html` 的路由。

`/data/*` 會先讀本機的 `docs/data`，沒有就由 server 代理到 R2，所以**不用先下載資料**。

### 3. 手動執行資料腳本（選用）

腳本需要本機有 `docs/data`（先 `scripts/sync-data-r2.sh pull`，見下節）。以下為 CI 的執行順序：

```bash
D=2026-04-20
python src/fetch_and_save.py --date_str $D          # 大盤、個股、處置股、權證
python src/generate_stock_history.py                # daily_price → 個股歷史
python src/gap_strategy.py --date_str $D            # 跳空
python src/vcp_strategy.py --date_str $D            # VCP
python src/head_shoulders.py --date_str $D          # 頭肩（--backfill 回補歷史訊號）
python src/volume_candle_strategy.py --date_str $D  # 爆量長紅／長黑 K
python src/xiaoge_strategy.py --date_str $D         # 小哥策略
python src/generate_manifest.py                     # 更新資料索引
python src/fetch_stock_info.py                      # 個股基本資料
```

其他命令列工具：`src/backtest.py`（`--json` 輸出 `backtest.json`、`--by` 做敏感度分析）、`src/gain_timing.py`（起漲後漲幅與所需時間）、`src/strategy_scan.py`（候選策略的樣本內／外勝率）、`src/moneydj_concept.py`、`src/add_concepts_to_watchlist.py`（概念股分類寫入 watchlist API）。

### 4. 格式化

```bash
scripts/format-python.sh    # poetry run ruff format src/
scripts/format-html.sh
```

Python 依賴以 `pyproject.toml`／`poetry.lock` 為準；`requirements.txt` 只給 CI 快速安裝，內容需與 `[project].dependencies` 保持一致。

## 資料管線與 R2

`docs/data` 的 JSON 由 Cloudflare R2 bucket 提供，**不在 git 內**。全新 clone 沒有資料，需要的話：

```bash
export R2_ACCOUNT_ID=… R2_BUCKET=… AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=…
scripts/sync-data-r2.sh pull    # bucket → docs/data
scripts/sync-data-r2.sh push    # docs/data → bucket（不會刪除遠端檔案）
```

- **前端**：所有資料網址都經過 `UIData.dataUrl()`（`docs/assets/data.js`）。`DATA_BASE` 指向 R2 自訂網域 `https://observer.smallplum.xyz/`；改回 `"data/"` 即可改讀同源。
- **自動更新**：`update_data.yml` 先從 R2 拉下現有資料，執行上節的腳本，通過檢查後推回 R2。需要 repo secrets：`R2_ACCOUNT_ID`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`。
- **Bucket 設定**：綁定自訂網域，並在 R2 dashboard → bucket → Settings → CORS policy 套用 `scripts/r2-cors.json`。
- **資料格式**：`twse/`、`tpex/` 下依類型分資料夾（`daily_index`、`daily_price`、`daily_punish`、`gap_jump`、`gap_drop`、`vcp`、`hs_bottom`、`hs_top`、`stock_history` …），另有 `warrant/`、`manifest.json`（資料索引）、`stock_info.json`。`scripts/compact_data.py` 可把舊的縮排 JSON 轉成精簡格式。

> ⚠️ 這個 repo 與 R2 資料都是公開的，不要放入個人持股、損益等私人資料。

## 管理功能與登入

新增／編輯／刪除（`bookmark`、`watchlist`、`surge`、個股頁的加入自選股）只有登入的管理員能用，不再依賴網址的 `?admin=True`。

- 到 `/dashboard` 用 Google 登入；登入、白名單與 session cookie 全由後端 API（FastAPI on Cloud Run）處理，前端不碰 token。
- 各頁用 `UIAuth.isAdmin()`（`GET /api/mktobs/auth/me`）決定是否顯示管理按鈕；寫入請求一律經 `UIAuth.apiFetch`（帶 cookie 與 `X-Requested-With: mktobs`）。
- 後端契約與環境變數見 [`docs/superpowers/specs/2026-11-20-admin-auth-openapi.yaml`](docs/superpowers/specs/2026-11-20-admin-auth-openapi.yaml)。
- 本機（`localhost`）收不到 `.smallplum.xyz` 的 cookie，要用真實後端測試時需另行設定（見 OpenAPI 的 `COOKIE_DOMAIN`、`FRONTEND_ORIGINS`）。

## 專案結構

```
observe.market/
├── src/                  # Python：抓取、策略、回測
│   ├── config.py         # 共用設定（路徑、來源網址）
│   ├── fetch_and_save.py, fetch_stock_info.py
│   ├── gap_strategy.py, vcp_strategy.py, head_shoulders.py,
│   │   volume_candle_strategy.py, xiaoge_strategy.py
│   ├── backtest.py, gain_timing.py, strategy_scan.py
│   ├── generate_manifest.py, generate_stock_history.py
│   └── moneydj_concept.py, add_concepts_to_watchlist.py
├── docs/                 # GitHub Pages 根目錄（純靜態）
│   ├── *.html            # 各功能頁面（見「功能一覽」）
│   ├── assets/
│   │   ├── ui.css        # 設計系統
│   │   ├── shell.js      # 導覽／搜尋／頁尾
│   │   ├── data.js       # 資料載入（含逾時與重試）
│   │   ├── auth.js       # 管理登入狀態與帶 cookie 的寫入請求
│   │   ├── fmt.js        # 共用格式化與跳脫函式
│   │   ├── ui-table.js   # 表格元件
│   │   ├── chart-theme.js, market-page.js, surge.js, stock-ocr.js
│   └── data/             # 不進 git，由 R2 提供
├── scripts/              # serve.py、sync-data-r2.sh、format-*.sh、compact_data.py
├── tests/
│   ├── test_*.py         # Python 單元測試（pytest）
│   └── ui/               # Playwright 與前端單元測試、fixtures
└── .github/workflows/    # CI／CD
```

## 測試

```bash
# Python
pip install pytest && python -m pytest tests -q

# 前端（單元 + Playwright）
cd tests/ui
npm ci && npx playwright install chromium
npm run test:unit
npm test
```

UI 測試不需要真實資料：`tests/ui/serve.js` 會從 `tests/ui/fixtures/data` 提供 `/data/*`。

## CI／CD

| Workflow | 觸發 | 內容 |
|---|---|---|
| `update_data.yml` | 平日排程、外部 cron（`repository_dispatch`）、手動 | 抓資料、跑策略、檢查後推到 R2 |
| `deploy-pages.yml` | push 到 `main`（`docs/`、`tests/ui/`） | 先跑 UI 測試，通過後部署到 GitHub Pages |
| `ui-smoke.yml` | PR（`docs/`、`tests/ui/`） | UI 測試 |
| `python-tests.yml` | PR／push `main`（`src/`、`tests/*.py`） | pytest（Python 3.11 與 3.14） |
| `ui-tests.yml` | 被上面兩個 workflow 呼叫 | 共用的 UI 測試流程（含 Playwright 快取） |

### 部署到 GitHub Pages

在儲存庫 **Settings → Pages → Build and deployment** 將 **Source** 設為 **GitHub Actions**。之後推到 `main` 會由 `deploy-pages.yml` 自動部署 `docs/`。

## 授權

本專案採用 [LICENSE](LICENSE) 授權。
