# Market Observer | 市場觀測站

一個自動化抓取台灣股市大盤與個股資料，並透過 GitHub Pages 進行視覺化展示的現代化市場監控工具。

## 專案特色

- **🎨 現代化 UI 設計**：採用簡潔美觀的儀表板介面，支援 **jf-openhuninn (粉圓體)** 字體。
- **📊 數據視覺化**：整合 Chart.js 展示大盤趨勢，提供即時漲跌狀態與成交資訊。
- **🔍 進階篩選功能**：支援搜尋、價格區間過濾及成交量篩選，快速鎖定目標個股。
- **⚖️ 處置股追蹤 (New)**：自動同步最新的處置股票資訊，掌握市場風險。
- **📈 跳空策略分析**：內建 Gap Jump 策略，自動篩選當日表現強勢個股。
- **🤖 自動化流程**：利用 GitHub Actions 每天自動更新數據，無須人工干預。

## 專案結構

- `src/`: 核心 Python 腳本，負責數據抓取與處理。
- `docs/`: 前端網頁與資料存放區（GitHub Pages 部署路徑）。
  - `assets/`: 存放 Logo、Favicon 與樣式資源。
  - `data/`: 存放每日抓取的 JSON 數據與索引清單。
- `.github/workflows/`: 定時任務配置。

## 核心組件

1.  **數據抓取 (`src/fetch_and_save.py`)**：抓取大盤、個股與處置股數據。
2.  **跳空策略 (`src/gap_strategy.py`)**：執行強勢股篩選策略。
3.  **清單生成 (`src/generate_manifest.py`)**：生成前端讀取所需的數據索引。
4.  **視覺化介面 (`docs/index.html`)**：現代化單頁式應用程式 (SPA) 介面。

## 本地開發

### 1. 安裝環境
```bash
pip install -r requirements.txt
```

### 2. 數據操作 (範例)
```bash
# 抓取指定日期數據
python src/fetch_and_save.py --date_str 2026-04-20

# 執行策略分析
python src/gap_strategy.py --date_str 2026-04-20

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

1.  進入 GitHub 儲存庫 **Settings** > **Pages**。
2.  在 **Build and deployment** 下，將 **Branch** 設定為 `main`。
3.  **關鍵步驟**：將資料夾路徑設定為 **`/docs`** 而非 root。
4.  點擊 **Save** 並等待部署完成。

## 授權
本專案採用 [LICENSE](LICENSE) 授權。
