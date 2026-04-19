# Market Observer | 市場觀測站

一個自動化抓取台灣股市大盤與個股資料，並透過 GitHub Pages 進行視覺化展示的專案。

## 專案特色

- **自動化數據更新**：利用 GitHub Actions 每天定時抓取最新的大盤指數與個股行情。
- **靜態網頁展示**：使用 Vanilla JS 與 Chart.js 打造輕量級的市場觀測儀表板。
- **多功能篩選**：支援按代號/名稱搜尋，以及價格區間、成交量篩選。
- **歷史數據追蹤**：自動保存每日數據，並可透過日期選擇器回顧歷史行情。

## 系統架構

1.  **數據抓取 (`fetch_data.py`)**：從 API 抓取每日行情並儲存為 JSON 檔案。
2.  **清單生成 (`generate_manifest.py`)**：掃描數據資料夾，生成前端所需的 `manifest.json` 索引。
3.  **網頁介面 (`index.html`)**：讀取 JSON 數據並呈現互動式圖表與表格。
4.  **自動化流程 (`.github/workflows/update_data.yml`)**：每天 16:30 (UTC+8) 自動執行更新任務。

## 本地開發

如果你想在本地運行此專案：

### 1. 安裝依賴
```bash
pip install requests
```

### 2. 抓取數據
```bash
python fetch_data.py --date_str 2026-04-17
```

### 3. 生成清單
```bash
python generate_manifest.py
```

### 4. 啟動網頁
使用任何靜態伺服器啟動（例如 Python 自帶的）：
```bash
python3 -m http.server 8000
```
然後訪問 `http://localhost:8000` 即可看到儀表板。

## 部署至 GitHub Pages

1.  進入 GitHub 儲存庫設定 (**Settings**)。
2.  點擊左側導覽列的 **Pages**。
3.  在 **Build and deployment** 下，將 **Branch** 設定為 `main` (或是你存放程式碼的分支)，路徑設定為 `/ (root)`。
4.  點擊 **Save**。
5.  等待幾分鐘後，你就可以在生成的網址上看到你的市場觀測站！

## 授權
本專案採用 [LICENSE](LICENSE) 授權。
