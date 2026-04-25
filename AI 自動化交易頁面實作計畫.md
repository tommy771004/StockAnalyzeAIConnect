# AI 自動化交易頁面實作計畫

## 背景與目標

在現有的系統中已有 `PaperTradingDashboard`、`LiveTradingConsole`、`autonomousAgent.ts` 等相關基礎元件，但彼此分散且未整合成完整的 AI 自動交易控制台。

本次目標是新增一個獨立的 **`AutoTrading`** 頁面，整合台股（個股/選擇權/期貨）、美股、AI 策略引擎、券商接口、風險控制等全套功能，以台灣現行法規與現況為準。

---

## 🚨 Open Questions（請確認）

> [!IMPORTANT]
> **Q1：真實下單是否要在本次版本實作？**
> 台灣券商（永豐 Shioaji、群益 SKCOM、元大）的真實 API 需要：用戶先自行申請帳號與憑證、安裝 SDK、簽署風險書。無法在前端或 Vercel Serverless 上直接呼叫（COM 元件必須跑在 Windows 本地服務）。  
> 建議方案：本次先實作完整的 **UI + 模擬交易後端 + 券商串接架構（含填寫 API Key/憑證路徑的設定頁）**，真實下單部分留一個「已設定後即可啟用」的開關。  
> **請問這樣可以嗎？**

> [!IMPORTANT]
> **Q2：選擇權/期貨的 AI 決策複雜度**
> 選擇權需要 Greeks（Delta, Gamma, Vega, Theta），期貨需要保證金計算。這部分要完整實作（增加開發量約 50%），還是本版本先聚焦在**個股**，並在 UI 留好插槽給選擇權/期貨後續擴充？

---

## 關鍵技術限制（台灣現況）

| 項目 | 限制 | 解法 |
|------|------|------|
| 永豐 Shioaji | Python SDK，無法在 Node.js 直接呼叫 | 用 Python 橋接 microservice（`server/python/`已存在） |
| 群益 SKCOM | Windows COM 元件，必須本地服務 | 預留本地 broker-agent 連線架構 |
| 元大 API | 同群益，Windows COM | 同上 |
| TAIFEX 期貨報價 | 官方免費 API 有限制，需付費 | 本版先用 Yahoo Finance 補充 |
| 選擇權 Greeks | 需 Black-Scholes 計算 | Python microservice 計算 |

---

## Proposed Changes

### 1. 路由 / 類型系統

#### [MODIFY] [types.ts](file:///d:/Project/github/StockAnalyzeAIConnect/src/terminal/types.ts)
- 加入 `'autotrading'` 至 `TerminalView` union 型別

#### [MODIFY] [App.tsx](file:///d:/Project/github/StockAnalyzeAIConnect/src/App.tsx)
- import `AutoTradingPage`
- 在 view 切換邏輯中加入 `autotrading` 路由

#### [MODIFY] [Layout.tsx](file:///d:/Project/github/StockAnalyzeAIConnect/src/terminal/shell/Layout.tsx)
- 在 `BOTTOM_NAV_IDS` 加入 autotrading 項目（Bot 圖示）

#### [MODIFY] Sidebar
- 加入「AI 自動交易」導覽項目（Bot / Cpu 圖示）

---

### 2. 前端頁面（新建）

#### [NEW] [AutoTradingPage.tsx](file:///d:/Project/github/StockAnalyzeAIConnect/src/terminal/pages/AutoTrading.tsx)
薄包裝，組合多個子元件

#### [NEW] [src/components/AutoTrading/index.ts](file:///d:/Project/github/StockAnalyzeAIConnect/src/components/AutoTrading/index.ts)
以下子元件：

| 子元件 | 功能 |
|--------|------|
| `AgentControlPanel.tsx` | 啟動/停止 AI 引擎、模擬/真實切換 Kill Switch |
| `StrategySelector.tsx` | 選擇或自訂 AI 策略（RSI、布林通道、MACD、AI LLM 選股） |
| `AssetMonitor.tsx` | 多股監控表（標的、報價、AI 信心度、當前部位、損益） |
| `DecisionLog.tsx` | AI 決策 Log 即時串流（WebSocket） |
| `RiskControlPanel.tsx` | 總預算上限、單日最大虧損、停損設定 |
| `BrokerSettings.tsx` | 選擇券商、填入 API Key / 憑證路徑 |
| `MarketSelector.tsx` | 台股個股 / 選擇權 / 期貨 / 美股 分頁切換 |
| `AccountSummary.tsx` | 總資產（TWD）、可用資金、當日損益 |

---

### 3. 後端 API（server.ts 擴充）

| 端點 | 方法 | 功能 |
|------|------|------|
| `/api/autotrading/status` | GET | 取得 AI 引擎狀態（running/stopped, mode） |
| `/api/autotrading/start` | POST | 啟動 AI 自動交易引擎 |
| `/api/autotrading/stop` | POST | 停止 AI 自動交易引擎 |
| `/api/autotrading/config` | GET/PUT | 讀寫使用者設定（策略、風控上限、券商設定） |
| `/api/autotrading/logs` | GET | 取得歷史決策 log |
| `/api/autotrading/positions` | GET | 取得所有 AI 管理的部位 |
| `/api/autotrading/broker/connect` | POST | 測試連線至選定券商 |
| `/ws/autotrading` | WebSocket | 即時推送 AI log、報價、狀態變更 |

---

### 4. AI 自動交易核心引擎（重構 autonomousAgent.ts）

#### [MODIFY] [autonomousAgent.ts](file:///d:/Project/github/StockAnalyzeAIConnect/server/services/autonomousAgent.ts)
重構為完整的 Agent Loop：
- 支援多策略（RSI 均值回歸、布林通道突破、MACD 交叉、AI/LLM 選股策略）
- 每個策略每次 tick 生成 AI 決策 log（信心度、理由、建議動作）
- 整合 RiskManager：超過日損失上限時自動停機
- 支援模擬/真實兩種執行路徑
- 透過 `emit`/WebSocket 即時廣播 log

#### [MODIFY] [RiskManager.ts](file:///d:/Project/github/StockAnalyzeAIConnect/server/services/RiskManager.ts)
- 加入總預算上限、單日最大虧損、最大持倉比例、停損比例

---

### 5. 台灣券商串接層（新建）

#### [NEW] [server/services/brokers/BrokerAdapter.ts](file:///d:/Project/github/StockAnalyzeAIConnect/server/services/brokers/BrokerAdapter.ts)
定義統一 `IBrokerAdapter` 介面：
```typescript
interface IBrokerAdapter {
  connect(config: BrokerConfig): Promise<void>;
  getBalance(): Promise<AccountBalance>;
  placeOrder(order: Order): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<void>;
  getPositions(): Promise<Position[]>;
  isConnected(): boolean;
}
```

#### [NEW] [server/services/brokers/SinopacAdapter.ts](file:///d:/Project/github/StockAnalyzeAIConnect/server/services/brokers/SinopacAdapter.ts)
永豐 Shioaji 橋接（透過 Python microservice HTTP 呼叫，非直接 COM）

#### [NEW] [server/services/brokers/SimulatedAdapter.ts](file:///d:/Project/github/StockAnalyzeAIConnect/server/services/brokers/SimulatedAdapter.ts)
模擬券商 Adapter：完整模擬下單/成交/持倉邏輯，帳面餘額以 DB 維護

#### [NEW] [server/services/brokers/KGIAdapter.ts](file:///d:/Project/github/StockAnalyzeAIConnect/server/services/brokers/KGIAdapter.ts)
群益 SKCOM 架構預留（stub），提供連線說明文件連結

#### [NEW] [server/services/brokers/YuantaAdapter.ts](file:///d:/Project/github/StockAnalyzeAIConnect/server/services/brokers/YuantaAdapter.ts)
元大 API 架構預留（stub）

---

### 6. 資料庫 Schema 擴充（新增 table）

| Table | 欄位 | 用途 |
|-------|------|------|
| `autotrading_configs` | userId, broker, mode, budget_limit, daily_loss_limit, strategies, symbols | 使用者自動交易設定 |
| `autotrading_logs` | id, userId, timestamp, level, source, message | AI 決策 log 持久化 |
| `autotrading_sessions` | id, userId, startedAt, stoppedAt, mode, totalPnl | 每次執行紀錄 |

---

## UI 設計規格

依據提供的截圖，UI 風格沿用現有 terminal dark theme：
- 頂部：`QUANTUM_CORE_V1` 品牌 + 分頁切換（LIVE_VIEW / STRATEGY / BACKTEST / SIMULATION）
- 右上：SIMULATED / LIVE_MODE 切換
- 中央左：AI DECISION LOG 即時串流面板
- 中央右：ASSET MONITOR 多股表格
- 右側欄：ACCOUNT SUMMARY + RISK CONTROL PANEL + KILL SWITCH 緊急平倉按鈕

---

## Verification Plan

### Automated Tests
- `npx tsc --noEmit` — 0 錯誤
- `npm run build` — 建置成功

### Manual Verification
- 啟動 dev server，切換至 AutoTrading 頁面
- 設定模擬模式，新增 2330.TW 監控，啟動 AI 引擎
- 確認 AI 決策 Log 開始出現，停損上限設定後超過閾值自動停止
- 測試緊急平倉（Kill Switch）按鈕清空所有部位

---

## 📅 目前實作進度 (Current Implementation Status)

**已完成 (Implemented):**
1. **路由 / 類型系統**
   - `types.ts` 中已加入 `'autotrading'` 至 `TerminalView`。
   - `App.tsx` 已成功整合 `AutoTradingPage` 路由。
   - 已建立前端基礎框架（Sidebar/Nav 等相關連動）。
2. **前端頁面與子元件**
   - 已建立 `AutoTradingPage.tsx` 主頁面包裝元件。
   - `src/components/AutoTrading/` 目錄已包含：
     - `AgentControlPanel.tsx` (啟動/停止 AI, Kill Switch)
     - `StrategySelector.tsx`, `StrategySandbox.tsx`, `StrategyFlowBuilder.tsx` (策略選擇與沙盒)
     - `AssetMonitor.tsx` (監控表)
     - `DecisionLog.tsx`, `DecisionHeatmap.tsx` (決策日誌與熱圖)
     - `RiskControlPanel.tsx` (風險控制設定)
     - `BrokerSettings.tsx` (券商設定)
     - `AccountSummary.tsx` (帳戶總結)
     - `useAutotradingWS.ts` (WebSocket 狀態管理)
3. **台灣券商串接層 (Broker Adapters)**
   - 已定義 `BrokerAdapter.ts` 介面。
   - 已實作 `SimulatedAdapter.ts` 作為預設的模擬券商。
   - 已預留/建立 `SinopacAdapter.ts` (永豐)、`KGIAdapter.ts` (群益)、`YuantaAdapter.ts` (元大) 的實作骨架。
4. **AI 自動交易核心引擎與資料層**
   - `server/services/autonomousAgent.ts` 已經重構包含多策略及自動化交易核心邏輯。
   - `server/repos/autotradingRepo.ts` 和 `server/repositories/autotradingConfigRepo.ts` 等資料庫介面已建立。

**待優化 / 待完成 (Pending for Next Steps):**
1. **真實券商 API (Live Trading) 串接**：
   - 永豐/群益/元大等券商的 Python 微服務與 COM 元件橋接。
   - Q1 提到的「真實下單開關」與金鑰驗證機制整合。
2. **選擇權/期貨支援**：
   - Q2 提到的 Greeks 計算與期貨保證金計算（目前重心仍在個股）。
3. **WebSocket/後端 API (Backend API) 完善**：
   - 確保 `server/api/` (如 `agent.ts`) 和 WebSocket 端點完全吻合 `AutoTradingPage.tsx` 的前端呼叫 (`/api/autotrading/*`)，並測試端到端（End-to-End）連線。

---

## 🔧 2026-04 改善紀錄（Trading Automation Improvements）

本輪聚焦在「假資料 / 寫死值 / 假按鈕 / 風控空轉」等問題，補齊核心防呆與設定持久化。

### 已完成
1. **預設值集中化** — 新增 `server/services/autotradingDefaults.ts` 作為 single source of truth；
   `autonomousAgent`、`RiskManager`、前端 `RiskControlPanel`、`AgentControlPanel`、`AutoTradingPage`
   不再各自寫死預算 / 虧損 / 監控標的 / 策略參數。
2. **盤前盤後守門** — 新增 `server/services/tradingSession.ts`，每次 tick 前檢查台股 / 美股
   是否處於盤中時段，週末或非交易時段自動跳過分析迴圈並寫入 SESSION log。
3. **交易稅費統一** — 抽出 `server/services/twFees.ts`：手續費 0.1425% (可帶折扣)、證交稅 0.3%、
   ETF 0.1%、當沖（同日買賣同檔）證交稅減半至 0.15%。`SimulatedAdapter` 已改用此模組並追蹤
   買進日期供當沖判定。
4. **RiskManager 真正接入 OrderExecutor** — `agentTick` 在送出委託前呼叫
   `riskManager.validateOrder`，超過單筆上限 / 部位佔比 / 預算上限會直接攔截並寫 `RISK_CHK` log；
   每次 SELL 平倉後將實現損益餵入 `recordPnl`，達上限自動觸發 Kill Switch。
5. **WebSocket 訊息補齊** —
   - `decisionHeat` 修正為 `decision_heat`（與前端 `useAutotradingWS` 對齊）。
   - 補上 `equity_update`（每 5 秒一筆權益曲線）與 `global_sentiment`（移動平均的 0–100 情緒分）。
6. **Kill Switch 流程** — 後端新增 `POST /api/autotrading/kill-switch/release`，前端
   `RiskControlPanel` 解除按鈕改呼叫該端點；觸發時同時聯動 `riskManager.activateKillSwitch()`，
   讓任何外部 caller 都會被風控擋下。
7. **新端點**
   - `GET /api/autotrading/defaults`：返回伺服器端預設配置（前端 hydrate 用）。
   - `GET /api/autotrading/session?symbols=...`：判斷是否盤中。
   - `GET /api/autotrading/broker/status`：回傳目前券商與 Sinopac Bridge URL。
8. **設定面板完整化**
   - `RiskControlPanel`：新增「單筆部位上限 / 最大部位佔比 / 個股停損 %」欄位、即時驗證、
     儲存/失敗 toast、解除 Kill Switch 直連 API。
   - `BrokerSettings`：增加 Bridge URL 欄位、stub 券商（KGI / Yuantra / Fugle / IB）顯示
     「Coming Soon」並停用「測試連線」按鈕、最後測試時間提示。
   - `AgentControlPanel` / `AutoTradingPage`：載入時呼叫 `getAutotradingDefaults()`，
     不再寫死 `2330.TW / 2317.TW` 與策略魔術數字。
9. **Schema 強化** — `configSchema.ts` 補上 `tradingHours`、`tickIntervalMs` 範圍、`maxPositionPct`、
   `riskPerTradePct`、`sizingMethod` 等欄位驗證。

### 仍待後續處理
1. 真實 KGI / Yuantra 券商的本地 Windows 服務橋接（目前 UI 已停用）。
2. 選擇權 Greeks（Black-Scholes）與期貨保證金的 Python microservice。

---

## 🔧 2026-04 改善紀錄（第二輪：部署 / 日曆 / 績效 / 訂單 / 通知）

### 部署架構 (§0)
- 新增 `Dockerfile`、`render.yaml`、`railway.json`，提供 Render / Railway 一鍵部署。
- `server.ts` 把 `process.env.VERCEL` 守門擴充為 `AUTOTRADING_DISABLED` 旗標，
  方便藍綠部署 / 測試環境關閉常駐 agent。
- 文件中載明 6 種 WebSocket 部署方案比較（Render / Railway / Fly / CF Workers / 自家 Win / VPS）。

### 台股交易日曆 (§1)
- 新檔 `server/services/twCalendar.ts`：內建 2026 / 2027 國定假日 + 半日交易。
- `tradingSession.ts` 接入 calendar；半日交易自動套用 12:00 收盤。
- `/api/autotrading/session` 額外回傳 `twHoliday / twEarlyClose` 與台北現在時間。

### 績效儀表板 (§3-A)
- 新檔 `server/services/performanceService.ts`：以日 PnL 序列計算 Sharpe，
  從累計權益曲線算 MaxDrawdown，並做策略歸因。
- `reportService` 移除硬編碼 Sharpe 1.8 與隨機 confidence；改用 agentMemories 真實值。
- 新端點 `GET /api/autotrading/performance?period=1d|1w|1m|3m|ytd|all`。
- 新元件 `PerformanceDashboard.tsx`：4 大指標卡 + 權益曲線 / 回撤 sparkline + 策略歸因表。
- AutoTradingPage 加入 `PERFORMANCE` 主分頁。

### 訂單生命週期 (§2-A)
- DB schema 新增 `orders` 表：PENDING / PARTIAL / FILLED / CANCELLED / REJECTED 全狀態 +
  retryCount + lastError + parentSignalId + brokerOrderId。
- 新檔 `server/repositories/ordersRepo.ts`：CRUD + listOpenByUser + cancel。
- 改寫 `OrderExecutor`：每張單寫 DB → 嘗試送單（指數退避最多 3 次重試）→
  廣播 `order_lifecycle` WS 事件 → 失敗自動觸發 risk_block 通知。
- 新 API：
  - `GET /api/autotrading/orders?open=0|1`
  - `POST /api/autotrading/orders/:id/cancel`
- 新元件 `OrderBookPanel.tsx`：即時表格 + 取消按鈕，顯示在 LIVE_VIEW 下方。
- `useAutotradingWS` 新增 `orderEvents` 狀態接收 WS 事件。

### 通知通道 (§2-B)
- DB schema 新增 `notification_settings`：channel / target / triggers JSONB / enabled。
- 新模組 `server/services/notifier/`：
  - `index.ts` 統一派發；任何通道失敗都不影響 agent loop。
  - `TelegramNotifier`（Bot API）、`DiscordNotifier`（Webhook）、
    `WebhookNotifier`（通用 POST JSON）、`EmailNotifier`（Resend HTTPS API stub）。
- `autonomousAgent` 在 Kill Switch / Cooldown / Risk Block 時呼叫 `notifier.dispatch`。
- 新 API：
  - `GET/PUT/DELETE /api/autotrading/notifications`
  - `POST /api/autotrading/notifications/test`
- 新元件 `NotificationSettings.tsx`：在 AgentControlPanel 多加一個 `Notify` 分頁，
  使用者可填 token / URL，按「測試」立即發送一則訊息驗證可用性。

### 仍待第三輪
1. 選擇權 / 期貨 Greeks + 保證金（Black-Scholes、TXF/TXO 解析、TAIFEX 報價）。
2. 回測 ↔ 實盤偏差分析（backtest_sessions 表 + AlignmentView）。
3. KGI / Yuantra Windows COM bridge。
