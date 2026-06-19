# UX / 設計審計報告 — Stock AI Connect

**對象**：https://stock-analyze-ai-connect.vercel.app/ （登入後全頁）
**方法**：Chrome (agent-browser) 逐頁截圖，桌機 1440×900 + 行動 390×844；DOM eval 量測 a11y / 對比。
**日期**：2026-06-19

審計面向：資訊層級、對比與可讀性、間距一致性、RWD 斷點、互動回饋、無障礙。

截圖位於 `audit-shots/`（`*.png` 桌機、`m-*.png` 行動）。

---

## 總評

整體成熟度高。終端機風格一致、互動回饋（hover/active/loading/empty state）齊全、**無障礙基礎扎實**：
逐頁 DOM 量測 4 個主要頁面（dashboard/market/portfolio/autotrading）→ **0 張圖缺 alt、0 個純圖示按鈕缺可存取名稱**。
最嚴重問題集中在**行動斷點的少數溢出**與**桌機部分版面留白/裁切**。

---

## 發現（按嚴重度）

### 🔴 Critical
無。

### 🟠 High
無。

### 🟡 Medium

**M1 — 行動版自動交易模式列：CJK 標籤被壓成直書字元（已修）**
`m-autotrading.png` 頂部「即時監控 / 策略配置 / 回測模擬 / 實驗沙盒 / PERFORMANCE」在窄寬度被擠成每字一行的直書，且 PERFORMANCE 被截斷。
- 位置：[AutoTrading.tsx:163-184](src/terminal/pages/AutoTrading.tsx#L163)
- 因：`<nav className="flex gap-3">` 無 `nowrap`／無水平捲動，按鈕寬度塌縮 → CJK 逐字換行。
- **已修**：左容器加 `min-w-0`、`nav` 加 `min-w-0 overflow-x-auto`、按鈕加 `whitespace-nowrap shrink-0`（沿用專案既有的行動表格水平捲動模式）。需部署/本地啟動才能視覺複驗。

### 🟢 Low / Suggestion（設計取捨；S2、S5 後續已完成低風險修正）

**S1 — 桌機回測頁標題與「回測設定」之間大片留白**
`backtest.png`：hero（回測引擎 V4.2）與下方設定區之間有大段空白；行動版 `m-backtest.png` 無此問題（控制項堆疊）。
- 位置：[BacktestPage.tsx](src/components/BacktestPage.tsx) hero 區
- 屬「hero 呼吸感」設計取捨。建議：桌機收斂 hero 高度或在留白處前置「最近一次回測摘要 / 快速說明」。

**S2 — 桌機持倉「資產分配」甜甜圈圖被卡片底部裁切**
`portfolio.png` 右側 donut 下緣被卡片邊界切掉，「資產」標籤露半截。
- 位置：[Portfolio.tsx](src/terminal/pages/Portfolio.tsx) 資產分配卡片
- **已修**：圖表改為響應式 96px／桌機 80px，配置內容於桌機橫排並收斂垂直 padding。以 1440×900、1264×569、390×844 實測，圓餅均完整位於卡片內；結果見 `portfolio-after.png`、`portfolio-compact-after.png`、`m-portfolio-after.png`。
- 同時修正配置卡誤用原始 `positions` 造成 `NaN%`，改傳入已計算 `marketValueTWD` 的 `enrichedPositions`，零總值回退為現金 100%。

**S3 — 持倉淨值曲線被末端暴漲主導**
`portfolio.png` / `m-portfolio.png`：近期 +72% 跳升讓前段歷史被壓平。非渲染 bug，是線性尺度下的資料尺度問題。
- 建議：提供對數尺度或「報酬率正規化」切換，讓早期走勢可讀。

**S4 — 卡片區段標題對比偏低（muted 小字）**
各頁卡片小標（如設定頁「個人帳戶 / 訂閱狀態 / AI 模型與整合」9–13px muted 灰）在深色底偏弱。
- 注意：本次以 DOM 量測對比時，oklch/oklab 色值未能可靠換算成 WCAG 比值（量測不可信），**故不自動調整全域色票**（屬設計取捨且影響全站）。
- 建議：對 `--color-term-muted` 等 token 做一次正式 WCAG AA 量測，必要時於小字情境提升一階亮度。

**S5 — 行動版持倉表水平溢出**
`m-portfolio.png`：市值欄被切（現價後「1…」）。已有水平捲動，屬可接受；可加首屏可見的捲動提示或凍結「代號」欄。
- **已修**：保留水平捲動，在手機右緣加入漸層與箭頭提示；桌機不顯示。

---

## 已套用的修正（安全、明確、低風險）

| 項 | 檔案 | 變更 |
|----|------|------|
| M1 行動模式列直書溢出 | [AutoTrading.tsx:163-184](src/terminal/pages/AutoTrading.tsx#L163) | 加 `whitespace-nowrap shrink-0` + `overflow-x-auto min-w-0`，阻止 CJK 直書、改水平捲動 |
| S2 配置圖裁切與 `NaN%` | [Portfolio.tsx](src/terminal/pages/Portfolio.tsx) | 圖表響應式縮放、緊縮垂直間距、改用 `enrichedPositions` 並處理零總值 |
| S5 手機持倉表提示 | [Portfolio.tsx](src/terminal/pages/Portfolio.tsx) | 手機右緣加入漸層箭頭，提示表格可水平捲動 |

> typo：未發現使用者面字串錯字（`STOCK_SCREENER.EXE` / `QUANTUM_CORE_V1` 等為刻意終端風格）。
> alt / aria：量測為 0 缺漏，**無需修正**。
> 對比 / hero 留白 / 曲線尺度：仍屬全域色票或版面取捨，依指示僅建議、不動手。

---

## 建置驗證

`npx vitest run src/terminal/pages/__tests__/uxContracts.test.ts` → **15/15 通過**。

`npm run build` → **✓ built in 7.71s**，所有 chunk + PWA 產生，無錯誤。修正未破壞建置。

`npm run lint`（`tsc --noEmit`）仍被既有的 6 個型別錯誤阻擋：`smartMoneyConfig.ts` 2 個、`CongressTradesPanel.tsx` 4 個；皆不在本次修改檔案。

---

## 各頁速覽

| 頁面 | 桌機 | 行動 | 備註 |
|------|------|------|------|
| Dashboard | `01-dashboard.png` | `m-dashboard.png` | 良好；行動底部 5 鍵導覽清楚 |
| Market | `market.png` | `m-market.png` | 良好；SPDR 卡片漲跌色清楚 |
| Crypto | `crypto.png` | — | 良好 |
| Portfolio | `portfolio.png` → `portfolio-after.png` | `m-portfolio.png` → `m-portfolio-after.png` | **S2、S5 已修**；S3 曲線尺度僅建議 |
| Research | `research.png` | — | 良好 |
| Backtest | `backtest.png` | `m-backtest.png` | S1 桌機留白 |
| News | `news.png` | — | AI 摘要 skeleton 載入態正常 |
| Alerts | `alerts.png` | — | 良好；empty state 清楚 |
| Screener | `screener.png` | — | 良好；empty state + 篩選 chip 清楚 |
| AutoTrading | `autotrading.png` | `m-autotrading.png` | **M1 已修** |
| Settings | `settings.png` | `m-settings.png` | 良好；S4 小標對比 |
