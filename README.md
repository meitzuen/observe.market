# Market Observer | 市場觀測站

一個自動化抓取台灣股市大盤與個股資料，並透過 GitHub Pages 進行視覺化展示的現代化市場監控工具。

## 專案特色

- **現代化 UI 設計**：採用簡潔美觀的儀表板介面，支援 **jf-openhuninn (粉圓體)** 字體，統一導覽列跨頁共用。
- **上市／上櫃雙市場**：分別追蹤 TWSE 上市與 TPEx 上櫃個股，資料結構一致。
- **數據視覺化**：整合 Chart.js 展示大盤趨勢，提供即時漲跌狀態與成交資訊。
- **進階篩選功能**：支援搜尋、價格區間過濾及成交量篩選，快速鎖定目標個股。
- **處置股追蹤**：自動同步最新的處置股票資訊，掌握市場風險。
- **跳空策略分析**：內建 Gap Jump／Gap Drop 策略，自動篩選當日強弱勢個股。
- **基本面排行**：整合 Wantgoo 基本面數據排行。
- **精選類股**：依類股分類瀏覽精選股票。
- **權證功能**：精選權證與權證篩選器，協助掌握衍生性商品機會。
- **個股歷史走勢**：點擊任一股票代號即可查看該股歷史股價走勢圖與近期成交明細。
- **自動化流程**：利用 GitHub Actions 每天自動更新數據，無須人工干預。

## 專案結構

```
observe.market/
├── src/                        # 核心 Python 腳本
│   ├── config.py               # 共用設定（路徑、來源網址等）
│   ├── fetch_and_save.py       # 抓取大盤、個股、處置股與跳空數據
│   ├── fetch_stock_info.py     # 抓取個股基本資料
│   ├── gap_strategy.py         # Gap Jump / Gap Drop 策略分析
│   ├── generate_manifest.py   # 生成前端讀取所需的資料索引
│   └── generate_stock_history.py # 彙整 daily_price 為個股歷史資料
├── docs/                       # GitHub Pages 部署根目錄
│   ├── index.html              # 上市＋上櫃整合大盤（首頁）
│   ├── twse.html               # 上市大盤（TWSE）
│   ├── tpex.html               # 上櫃大盤（TPEx）
│   ├── gap.html                # 跳空策略觀測站
│   ├── punish.html             # 處置股票觀測站
│   ├── wantgoo.html            # 基本面排行
│   ├── watchlist.html          # 精選類股
│   ├── premium-warrant.html    # 精選權證
│   ├── warrant-filter.html     # 權證篩選器
│   ├── stock.html               # 個股歷史走勢頁面
│   ├── assets/                 # Logo、Favicon 與樣式資源
│   └── data/
│       ├── manifest.json       # 資料索引清單
│       ├── stock_info.json     # 個股基本資料
│       ├── twse/               # 上市數據（daily_index, daily_price, daily_punish, gap_jump, gap_drop, stock_history）
│       ├── tpex/               # 上櫃數據（同上結構）
│       └── warrant/            # 權證數據
└── .github/workflows/          # 定時自動化任務配置
```

## 核心組件

1. **數據抓取 (`src/fetch_and_save.py`)**：抓取大盤指數、個股行情、處置股名單與跳空數據，分別儲存至 `twse/` 與 `tpex/`。
2. **個股資料 (`src/fetch_stock_info.py`)**：抓取上市／上櫃個股基本資訊，輸出至 `stock_info.json`。
3. **跳空策略 (`src/gap_strategy.py`)**：根據當日開盤跳空幅度，篩選強勢 (gap_jump) 與弱勢 (gap_drop) 個股。
4. **清單生成 (`src/generate_manifest.py`)**：掃描 `data/` 目錄並輸出 `manifest.json`，供前端動態載入歷史資料。
5. **個股歷史彙整 (`src/generate_stock_history.py`)**：將每日 `daily_price` 資料依股票代號重新彙整，輸出至 `stock_history/{id}.json`，供 `stock.html` 繪製個股走勢圖。
6. **視覺化介面 (`docs/*.html`)**：多頁式靜態應用程式，共用同一導覽列，部署於 GitHub Pages。

## 本地開發

### 1. 安裝環境
```bash
pip install -r requirements.txt
```

### 2. 數據操作 (範例)
```bash
# 抓取指定日期數據（上市 + 上櫃）
python src/fetch_and_save.py --date_str 2026-04-20

# 抓取個股基本資料
python src/fetch_stock_info.py

# 執行跳空策略分析
python src/gap_strategy.py --date_str 2026-04-20

# 彙整個股歷史資料
python src/generate_stock_history.py

# 更新數據清單
python src/generate_manifest.py
```

### 3. 預覽網頁
切換至 `docs` 目錄並啟動本地伺服器：
```bash
cd docs
python3 -m http.server 8000
```
造訪 `http://localhost:8000` 即可預覽。

## 部署至 GitHub Pages

1. 進入 GitHub 儲存庫 **Settings** > **Pages**。
2. 在 **Build and deployment** 下，將 **Branch** 設定為 `main`。
3. **關鍵步驟**：將資料夾路徑設定為 **`/docs`** 而非 root。
4. 點擊 **Save** 並等待部署完成。

## 授權
本專案採用 [LICENSE](LICENSE) 授權。
