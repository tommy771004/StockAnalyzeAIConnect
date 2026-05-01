# CONTEXT.md — Hermes AI Trading Terminal

AutoTrading 子系統的領域詞彙表與決策紀錄。  
僅收錄對領域專家有意義的術語，不耦合實作細節。

---

## 詞彙表

### TradingMode（交易模式）
`'simulated' | 'real'`

- **Simulated（模擬模式）**：所有訂單由 `SimulatedAdapter` 執行，不實際接觸券商，不產生真實資金損益。**目前唯一可用的執行路徑。**
- **Real（真實模式）**：預計透過 KGI / Sinopac / Yuanta broker adapter 下單。所有 adapter 目前均為架構佔位（方法 `throw` 或回傳 `ok: false`），尚未可用。

**決策（2026-05-01）**：`mode: 'real'` 在 UI 上保留選項但不啟用真實下單，待 adapter 實作完整且通過沙盒驗證後再開啟。

---

### AgentStatus（代理狀態）
`'running' | 'stopped' | 'cooldown' | 'error' | 'paused'`

- **running**：Tick 循環正在運行，系統主動掃描訊號並可執行訂單。
- **stopped**：Tick 循環已停止，不掃描不下單。
- **cooldown**：熔斷器觸發後的冷卻期，暫停下單但仍維持狀態監控。
- **paused**：使用者手動暫停，與 cooldown 不同之處在於由人工觸發而非風控自動觸發。
- **error**：系統發生無法自我恢復的錯誤。

---

### CircuitBreaker（熔斷器）
當以下任一條件成立時自動觸發，AgentStatus 切換為 `cooldown`：
- 連續虧損次數 ≥ `maxLossStreak`（預設 3）
- 當日虧損佔總資金比例 ≥ `maxDailyLossPct`（預設 2%）

冷卻期間 (`cooldownMinutes`，預設 60 分鐘) 過後自動解除。

---

### KillSwitch（Kill Switch）
由 `RiskManager.activateKillSwitch()` 觸發，**永久性**暫停所有自動下單，直到人工呼叫 `deactivateKillSwitch()` 解除。與 CircuitBreaker 的差異：Kill Switch 不會自動逾時解除。

---

### Tick（交易週期）
一次完整的分析-決策-下單循環，由 `tickIntervalMs`（預設 60,000ms）驅動。

**兩階段執行語意**：
1. **分析階段（並行）**：所有監控標的同時呼叫 `runAnalysis()`，互不阻塞。
2. **下單階段（循序）**：依 `analysisResults` 陣列順序逐一處理。採「先到先得」語意：前一個標的成交後立即扣除 `availableMargin`，後面的標的以扣除後的餘額計算可用資金。

**邊界條件**：
- 盤外時段（非台股交易時間）：跳過分析，僅廣播帳戶狀態。
- `isTickRunning = true` 防止 tick 重疊執行。
- 如果 tick 執行途中連損次數超限，立即觸發 CircuitBreaker 並 `break` 剩餘標的。

---

### HedgeConfig（對沖設定）

主帳戶每筆成交後，可選擇性地對另一個標的（`hedgeSymbol`）下單以控制風險曝險。

**欄位語意**：
- `hedgeRatio` — 對沖下單數量佔主單數量的比例（0.5 = 主單的一半）
- `hedgeSymbol` — 對沖標的（例如反向 ETF 00632R、或相關性低的標的）
- `hedgeBrokerId` — 預留欄位，目前對沖也走同一個 `simulatedAdapter`

**已知缺口（2026-05-01）**：`executeHedge()` 的對沖方向硬編碼為 `side: 'BUY'`，不考慮主單方向。

正確語意取決於 `hedgeSymbol` 的類型：
| hedgeSymbol 類型 | 主單方向 | 正確對沖方向 | 目前行為 |
|----------------|---------|------------|---------|
| 反向 ETF（如 00632R） | BUY 或 SELL | 永遠 BUY ✅ | BUY ✅ |
| 正向標的（如 0050） | BUY | SELL（delta-neutral） | BUY ❌ |
| 正向標的（如 0050） | SELL | BUY | BUY ✅ |

**待修復**：在 `AgentConfig.hedgeConfig` 新增 `hedgeType: 'inverse_etf' | 'direct'` 欄位。`hedgeType === 'direct'` 時，對沖方向應與主單方向相反。

---

### TenantIsolation（租戶隔離）

**已知缺口（P2 技術債）**：`autonomousAgent.ts` 是 **process-level singleton**。所有狀態（`agentStatus`、`agentConfig`、`posTrack`、`lossStreakCount`）為 module-level 變數，同一後端實例只能服務一個用戶。

**已緩解（2026-05-01）**：`startAgent()` 在 userId 切換時（新 userId ≠ 當前 `agentConfig.userId`）會清空 `posTrack` 和 `lossStreakCount`，防止前一用戶的持倉狀態污染後一用戶的損益計算。

**根本缺口仍存在**：若兩個用戶**並行**持有各自的 session 並同時觸發 tick，狀態仍會互相覆蓋。完整解法是以 `Map<userId, AgentInstance>` 管理多實例，屬 P2 重構項目。

---

### CopyTrading（跟單）

主帳戶每筆成交後，自動按比例對多個跟隨者帳戶下單。

**FollowerAccount（跟隨者帳戶）**：
- `mode: 'live'` — 實際呼叫 broker adapter 下單（目前仍走 `simulatedAdapter`）
- `mode: 'shadow'` — 僅記錄日誌，不執行訂單；用於低風險觀察
- `multiplier` — 相對於主帳戶的下單比例（0.5 = 半張）
- `staggeredDelayMs` — 刻意延遲以避免同時搶市場流動性

**已知缺口（2026-05-01）**：`followers` 陣列硬編碼在 `CopyTradingService` 內部，無法透過 UI 或 API 新增/移除跟隨者帳戶。

---

### Backtest（回測）vs Sandbox（沙盒）

兩者均在 `AutoTradingPage` 的獨立 tab 中，但目的不同：

| | Backtest (`BacktestPanel`) | Sandbox (`StrategySandbox`) |
|---|---|---|
| **目的** | 歷史數據驗證策略勝率 | A/B 測試多組參數的 shadow config |
| **資料來源** | 歷史 K 棒（`/api/backtest`） | 目前 AgentConfig 的快照 |
| **輸出** | 績效報表（報酬率、最大回撤、夏普） | 可 promote 回主設定的 StrategyParams |
| **與 live agent 關係** | 完全獨立 | Shadow config 可升格（promote）為 live config |

**Promote（升格）**：將 Sandbox 中表現較佳的 shadow config 的 `StrategyParams` 複寫到主要 `AgentConfig` 的操作。升格後 shadow config 不會自動刪除。

---

### Strategy（策略）

`AgentConfig.strategies: StrategyType[]` 是 **UI 分組標籤**，不控制哪些訊號源參與計算。  
SignalFusion 永遠融合所有訊號源；真正控制影響力的是各訊號的 `weight`。

**設計決策（2026-05-01）**：接受此語意，但須定義每個策略選項對應的「推薦 weight 組合」，讓 UI 選擇有可預期的效果，而非靜默無效：

| 策略標籤 | AI_LLM weight | technical weight | macro weight |
|---------|--------------|-----------------|-------------|
| `AI_LLM` only | 1.0 | 0.1 | 0.1 |
| `RSI_REVERSION` | 0.4 | 1.2 | 0.4 |
| `MACD_CROSS` | 0.4 | 1.2 | 0.4 |
| 全選 | 0.6 | 0.8 | 0.5 |

`weight = 0` 等同於停用（`fuseSignals` 的 `filter(o => o.weight > 0)` 會排除）。

**待實作**：UI 切換 `strategies` 時，自動套用上表對應的預設 weight 組合，寫入 `StrategyParams`。

---

### posTrack（持倉追蹤表）

Agent 在記憶體中維護的 `Map<symbol, { avgCost, qty }>`，記錄每個標的的**平均成本**與**數量**，用於計算平倉損益和停損判斷。

**持久化路徑（已實作）**：
- 每次成交後：`syncStateToDb()` → `autotradingConfigRepo.saveState()` 將 `posTrack` 寫入 DB
- 重啟恢復：`startAutonomousAgent()` → `autotradingConfigRepo.getConfig()` → `posTrack = new Map(Object.entries(savedConfig.posTrack || {}))`

**已知缺口（2026-05-01）**：`getAllActiveConfigs()` 僅查詢 `status = 'running'` 的記錄。若引擎在 `cooldown` 狀態時伺服器重啟，posTrack 不會被恢復，下一次成交的損益計算將以 `avgCost = 0` 起算，`lossStreakCount` 可能永遠不正確累加。

**待修復**：`getAllActiveConfigs()` 應改為查詢 `status IN ('running', 'cooldown')`。

---

### StopLoss（停損）

**已知缺口（2026-05-01）**：目前系統無主動停損機制。

現況：停損只有在 LLM 或技術指標「剛好」在某個 tick 發出 SELL 訊號時才發生。系統未在每個 tick 比對「現價 vs 持倉均成本」以判斷是否達到 `stopLossPct` 門檻。

三個相關參數的職責分工（目前語意**未完全落地**）：
| 參數 | 位置 | 目前實際作用 |
|------|------|------------|
| `StrategyParams.stopLossPct` | 每標的策略參數 | 定義停損比例，但無執行點 |
| `RiskConfig.stopLossPct` | RiskManager 全域 | `validateOrder()` 進行靜態審查，非主動出場 |
| `lossStreakCount` | agentTick 內部 | 計算連損次數以觸發 CircuitBreaker，非單筆停損 |

**待實作**：在下單階段開始前，針對每個已持倉標的比對現價與均成本，若虧損比例 ≥ `stopLossPct` 則直接注入一筆強制 SELL 決策，繞過 LLM 信心度門檻。

---

### SignalFusion（訊號融合）
將多個訊號來源（RSI、Bollinger、MACD、AI_LLM、Quantum）的輸出，依各自 `weight × confidence` 加權後得出最終 `BUY / SELL / HOLD` 決策。
- score > 0.15 → BUY
- score < -0.15 → SELL
- 其餘 → HOLD

量子訊號（`source: 'quantum'`）預設關閉，需 `ENABLE_QUANTUM_SIGNAL=true` 環境變數啟用。
