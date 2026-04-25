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
