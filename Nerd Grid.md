# Nerd Grid (Wireframe HUD) Dark — 設計上下文

## 專案背景

這是一個台股市場觀測站（Market Observer），原本從 `observe.smallplum.xyz` 重新設計。現在要將主頁面的視覺風格改為 **Nerd Grid Dark（Wireframe HUD）** 風格。

## 設計風格定義

### 核心配色
- **背景**：純黑 `#000000`
- **線框/邊框**：`rgba(0, 180, 255, 0.15)` — 纖細的青藍色
- **主要文字/數據**：`rgba(0, 180, 255, 0.7)` — 藍色
- **次要文字/標籤**：`rgba(0, 180, 255, 0.5)` — 較淡的藍色
- **第三級文字/輔助**：`rgba(0, 180, 255, 0.4)` — 更淡的藍色
- **網格線（水平）**：`rgba(0, 180, 255, 0.08)`
- **網格線（垂直）**：`rgba(0, 180, 255, 0.05)`
- **上漲（綠）**：`rgba(0, 220, 180, 0.7)` — 青綠色
- **下跌（紅）**：`rgba(255, 80, 80, 0.7)` — 珊瑚紅
- **卡片無填充色**，只有線框邊界

### 字體
- **全部使用等寬字體**：`font-mono`（JetBrains Mono / Fira Code）
- **標題/標籤**：`text-[9px] font-mono tracking-widest` 搭配大寫和 `//` 分隔符
- **數據數字**：`text-[10px] font-mono`
- **重點數字（市場摘要）**：`text-xl font-mono font-light`

### 設計原則
1. **只有線框，沒有填充色** — 所有卡片/面板只有一層纖細的邊框線，背景完全透明（透出純黑底）
2. **纖細的網格線** — 圖表區域有橫向和縱向的極細網格線，像 HUD 瞄準器
3. **追蹤寬字距** — 所有標籤使用 `tracking-widest` 或 `tracking-[0.3em]`
4. **等寬字體貫穿全文** — 連一般文字都是 monospace
5. **// 分隔符** — 標題中使用 `//` 作為分隔（如 `INDEX TREND // ANALYSIS`）
6. **極簡** — 無圓角、無陰影、無漸層、無玻璃效果、無掃描線動畫
7. **邊框顏色統一** — 所有邊框都是同一種青藍色的不同透明度

### 佈局結構
- **頂部導航欄**：極簡，只有品牌名 + 幾個文字連結，底部一層細線分隔
- **主區域**：左側寬區（圖表 + 股票表格），右側窄區（市場摘要 + 跳空股票 + 處置股票）
- **所有面板**：統一使用 `border: 1px solid rgba(0,180,255,0.12~0.15)`，無背景色

### 需要移除的元素（相對於目前的 Stealth Monitor 風格）
- glass-card 玻璃效果（模糊、半透明背景、漸層邊框）
- 掃描線動畫
- glow-blue 文字發光
- 圓角（改為直角或極小圓角）
- 陰影效果
- 漸層背景
- hover 時的邊框顏色變化（可保留但改用同一色系）

---

## 現有專案架構

### 技術棧
- React 19 + TypeScript
- Tailwind CSS 4
- Wouter（路由）
- Chart.js + react-chartjs-2（圖表）
- shadcn/ui 元件庫

### 檔案結構
```
client/src/
├── App.tsx              # 路由：/ = Home, /styles = StyleComparison
├── index.css            # 全域樣式（需重寫為 Nerd Grid 風格）
├── pages/
│   └── Home.tsx         # 主頁面（組合所有元件）
├── components/
│   ├── Header.tsx       # 頂部導航
│   ├── IndexChart.tsx   # 大盤指數趨勢圖表
│   ├── MarketSummary.tsx # 市場摘要卡片
│   ├── StockTable.tsx   # 個股行情表（含搜尋/篩選/排序/分頁）
│   ├── GapList.tsx      # 跳空股票列表
│   └── PunishList.tsx   # 處置股票列表
└── hooks/
    └── useMarketData.ts # API 資料 hook
```

### API 資料來源
- Base URL: `https://observe.smallplum.xyz/data`
- Manifest: `/manifest.json`
- 指數: `/twse/daily_index/{date}.json`、`/tpex/daily_index/{date}.json`
- 股價: `/twse/daily_price/{date}.json`、`/tpex/daily_price/{date}.json`
- 跳空: `/twse/gap_jump/{date}.json`、`/twse/gap_drop/{date}.json`（同上櫃）
- 處置: `/twse/daily_punish/{date}.json`、`/tpex/daily_punish/{date}.json`

### 資料型別

```typescript
interface IndexData {
  date: string;          // ISO 格式 "2026-08-06"
  volume: number;        // 成交量
  turnover: number;      // 成交金額
  transactions: number;  // 成交筆數
  index: number;         // 指數值
  changes: string;       // 漲跌值（字串）
}

interface StockData {
  id: string;            // 股票代號
  name: string;          // 股票名稱
  open: number;          // 開盤價
  high: number;          // 最高價
  low: number;           // 最低價
  close: number;         // 收盤價
  volume: number;        // 成交量（張）
  change: number;        // 漲跌
  change_percent: number; // 漲跌幅
  market: string;        // "twse" 或 "tpex"
}

interface GapData {
  id: string;
  name: string;
  today_close: number;
  prev_high: number;
  diff: number;
  ratio: number;
  gap_diff: number;
  gap_ratio: number;
  volume: number;
  market: string;
}

interface PunishData {
  publish_date: string;
  measure: string;
  id: string;
  name: string;
  accumulated: number;
  condition: string;
  from: string;
  to: string;
}
```

---

## Wireframe HUD 預覽組件（已實作的示範）

以下是目前已實作的 Nerd Grid Dark 預覽組件，可作為實作的參考：

```tsx
function WireframeHUDPreview() {
  return (
    <div className="h-full flex flex-col" style={{ background: "#000000" }}>
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(0,180,255,0.2)" }}>
        <span className="text-xs font-mono tracking-[0.3em]" style={{ color: "rgba(0,180,255,0.6)" }}>MARKET OBSERVER</span>
        <div className="flex gap-4">{["市場", "策略", "權證"].map((t) => <span key={t} className="text-[10px] font-mono" style={{ color: "rgba(0,180,255,0.4)" }}>{t}</span>)}</div>
      </div>
      <div className="flex-1 p-4 grid grid-cols-[1fr_280px] gap-4">
        <div className="flex flex-col gap-4">
          <div className="p-4" style={{ border: "1px solid rgba(0,180,255,0.15)" }}>
            <div className="text-[9px] font-mono tracking-widest mb-3" style={{ color: "rgba(0,180,255,0.5)" }}>INDEX TREND // ANALYSIS</div>
            <div className="h-44">
              <svg className="w-full h-full" viewBox="0 0 400 176">
                {[0, 35, 70, 105, 140, 176].map((y) => <line key={`h${y}`} x1="0" y1={y} x2="400" y2={y} stroke="rgba(0,180,255,0.08)" strokeWidth="0.5" />)}
                {[0, 50, 100, 150, 200, 250, 300, 350, 400].map((x) => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="176" stroke="rgba(0,180,255,0.05)" strokeWidth="0.5" />)}
                <path d="M0,140 Q30,120 60,90 T120,100 T180,70 T240,85 T300,55 T360,70 T400,45" fill="none" stroke="rgba(0,180,255,0.7)" strokeWidth="1.5" />
                <path d="M0,160 Q30,150 60,140 T120,145 T180,130 T240,135 T300,120 T360,125 T400,110" fill="none" stroke="rgba(0,220,180,0.5)" strokeWidth="1" />
              </svg>
            </div>
          </div>
          <div className="p-3" style={{ border: "1px solid rgba(0,180,255,0.12)" }}>
            <div className="text-[9px] font-mono tracking-widest mb-2" style={{ color: "rgba(0,180,255,0.5)" }}>STOCK DATA // SCAN</div>
            <table className="w-full">
              <thead><tr style={{ borderBottom: "1px solid rgba(0,180,255,0.1)" }}>
                {["ID", "NAME", "PRICE", "Δ"].map((h) => <th key={h} className="text-[9px] font-mono py-1 px-2 text-left tracking-wider" style={{ color: "rgba(0,180,255,0.4)" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {[{ id: "0050", name: "元大台灣50", price: "103.30", chg: "-0.50" }, { id: "1303", name: "南亞", price: "178.50", chg: "+1.50" }].map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid rgba(0,180,255,0.05)" }}>
                    <td className="text-[10px] font-mono py-1.5 px-2" style={{ color: "rgba(0,180,255,0.7)" }}>{s.id}</td>
                    <td className="text-[10px] font-mono py-1.5 px-2" style={{ color: "rgba(0,180,255,0.5)" }}>{s.name}</td>
                    <td className="text-[10px] font-mono py-1.5 px-2" style={{ color: "rgba(0,220,180,0.7)" }}>{s.price}</td>
                    <td className="text-[10px] font-mono py-1.5 px-2" style={{ color: s.chg.startsWith("+") ? "rgba(0,220,180,0.7)" : "rgba(255,80,80,0.7)" }}>{s.chg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="p-4" style={{ border: "1px solid rgba(0,180,255,0.15)" }}>
            <div className="text-[9px] font-mono tracking-widest mb-1" style={{ color: "rgba(0,180,255,0.5)" }}>MARKET STATUS</div>
            <div className="text-xl font-mono font-light" style={{ color: "rgba(0,180,255,0.8)" }}>44,397</div>
            <div className="text-[10px] font-mono" style={{ color: "rgba(255,80,80,0.7)" }}>-214.90</div>
          </div>
          <div className="p-4 flex-1" style={{ border: "1px solid rgba(0,180,255,0.12)" }}>
            <div className="text-[9px] font-mono tracking-widest mb-2" style={{ color: "rgba(0,180,255,0.5)" }}>GAP SCAN // 446</div>
            {["川湖", "信驊", "聯亞", "奇鋐"].map((n, i) => (
              <div key={n} className="flex justify-between text-[9px] font-mono py-0.5">
                <span style={{ color: "rgba(0,180,255,0.5)" }}>{n}</span>
                <span style={{ color: "rgba(0,220,180,0.6)" }}>+{(i + 1) * 2}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## index.html 設定

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>Market Observer | 市場觀測站</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Noto+Sans+TC:wght@300;400;500;700&display=swap" rel="stylesheet" />
    <link rel="icon" type="image/png" href="https://observe.smallplum.xyz/favicon.ico" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
    <script defer src="%VITE_ANALYTICS_ENDPOINT%/umami" data-website-id="%VITE_ANALYTICS_WEBSITE_ID%"></script>
  </body>
</html>
```

---

## App.tsx

```tsx
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import StyleComparison from "./pages/StyleComparison";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/styles"} component={StyleComparison} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
```

---

## 需要修改的重點檔案

### 1. `client/src/index.css`
需要完全重寫：
- 背景改為 `#000000`（純黑）
- 移除 glass-card、scan-line、glow-blue 等效果
- 移除漸層背景
- 新增 HUD 風格的工具類別（如 `.hud-border`、`.hud-text`、`.hud-label`）
- 字體改為全部 JetBrains Mono

### 2. `client/src/pages/Home.tsx`
- 移除 scan-line 動畫
- 調整佈局保持相同（左主區 + 右側邊欄）
- 卡片改為 HUD 線框樣式

### 3. `client/src/components/Header.tsx`
- 移除毛玻璃背景、漸層 logo
- 改為純黑背景 + 底部細線
- 文字改為 monospace + tracking-widest

### 4. `client/src/components/IndexChart.tsx`
- Chart.js 配置改為 HUD 風格：
  - 網格線使用青藍色極淡色
  - 折線使用 `rgba(0,180,255,0.7)` 和 `rgba(0,220,180,0.5)`
  - 移除漸層填充
  - 標籤文字改為 monospace

### 5. `client/src/components/StockTable.tsx`
- 表格邊框改為纖細青藍色
- 表頭改為 HUD 標籤風格
- 搜尋框改為 HUD 輸入框風格
- 移除 glass-card 樣式

### 6. `client/src/components/MarketSummary.tsx`
- 改為 HUD 面板風格
- 數字使用 monospace + 大號字體

### 7. `client/src/components/GapList.tsx` 和 `PunishList.tsx`
- 改為 HUD 面板風格
- 列表項目改為 monospace

---

## 現有 Demo 網址

- 開發預覽：`https://3000-i9y7lcia0tmngmtlsgjmc-efa1fd04.sg1.manus.computer/styles`
- 已發布：`https://marketobsvr-ijhpyjmu.manus.space/styles`
- 在 `/styles` 頁面中，點擊「Wireframe HUD」卡片可查看 Dark 版預覽

## Nerd Grid Dark 特色說明

| 項目 | 說明 |
|------|------|
| 背景 | 純黑 `#000000` |
| 線框 | 纖細的青藍色 `rgba(0,180,255,0.15)` |
| 字體 | 全部等寬 `font-mono`（JetBrains Mono） |
| 填充 | 無填充色，只有邊框線 |
| 圓角 | 無圓角或極小圓角 |
| 陰影 | 無陰影 |
| 漸層 | 無漸層 |
| 網格 | 圖表區域有纖細的橫縱網格線 |
| 漲跌 | 青綠色 `rgba(0,220,180)` / 珊瑚紅 `rgba(255,80,80)` |
| 氛圍 | 鋼鐵人 HUD、硬核科技、極客感 |
