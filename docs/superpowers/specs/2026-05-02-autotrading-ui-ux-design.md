# Auto-Trading UI/UX 改善設計文件

**日期**：2026-05-02  
**範疇**：UI/UX — 決策視覺化、即時回饋、手機體驗  
**方案**：B — LIVE_VIEW 三欄重構  
**影響範圍**：僅 `AutoTrading.tsx` 及相關前端組件，不新增後端 API

---

## 目標

1. 讓使用者在 LIVE_VIEW 頁面**一眼看到 AI 如何做決定**（訊號來源、信心度、歷史決策）
2. 成交後提供**輕量且不干擾**的即時回饋（Toast + 高亮動畫）
3. 手機端維持**可讀、可切換**的精簡體驗（查看為主，不需完整操作）

---

## 佈局架構

### 桌機（≥ 768px）

現況的 LIVE_VIEW 為「左主體 flex-1 + 右側可拖曳 AgentControlPanel」。

**變更後**：左側主體區域改為三欄 grid，`AgentControlPanel` 右側邊欄保持不動。

```
┌─────────────────────────────────────────────────────┐
│  TopNav  TickerTape                                  │
├────────────────┬──────────────┬──────────────────────┤
│  決策解析面板   │  DecisionLog │  AssetMonitor        │
│  (新組件)      │  (現有)      │  + OrderBook (現有)  │
│  ~320px 固定   │  flex-1      │  ~280px 固定         │
├────────────────┴──────────────┴──────────────────────┤
│  Sidebar  AgentControlPanel  Footer                  │
└─────────────────────────────────────────────────────┘
```

- 實作：`grid-cols-[320px_1fr_280px]`，中欄自動填充
- 左欄寬度可透過現有 `Splitter` 組件拖曳，存 `localStorage`
- `DecisionLog`、`AssetMonitor`、`OrderBookPanel` **組件本體零改動**

### 手機（< 768px）

三欄折疊為單欄，頂部加入固定 tab 列：

```
[ 決策 | 日誌 | 部位 ]
```

- 預設顯示「日誌」tab
- `DecisionAnalysisPanel` 手機版隱藏時間軸，只保留信心儀表 + 訊號卡
- Toast 改為頂部彈出
- `AgentControlPanel` 維持現有 drawer 行為，不變

---

## 新組件：DecisionAnalysisPanel

**檔案**：`src/components/AutoTrading/DecisionAnalysisPanel.tsx`

資料來源：訂閱現有 WebSocket 訊息，**不新增後端 API**：
- `decision_fusion` → 信心儀表 + 訊號分解卡片
- `agent_log` / `log_history` → 決策時間軸（複用現有 `agentLogs` ring buffer）

### ① 信心儀表（Confidence Gauge）

顯示最新一筆 `DecisionFusion` 的 BUY / HOLD / SELL 信心度：

```
BUY   ████████░░  78%
HOLD  ███░░░░░░░  32%
SELL  █░░░░░░░░░  12%
```

- 三條橫向 progress bar
- 最高值那條高亮：BUY=綠、SELL=紅、HOLD=灰
- 標示「最終裁定」label
- 資料型別：`decisionFusion.confidence`（現有）

### ② 訊號分解卡片（Signal Breakdown）

每個啟用訊號來源顯示一張小卡：

| 欄位 | 說明 |
|------|------|
| 訊號名稱 | RSI / MACD / BOLLINGER / AI_LLM / Quantum / TimesFM |
| 方向 | BUY ↑ / SELL ↓ / HOLD — / PASS |
| 貢獻權重 | 來自 `agentConfig.params` 的 weight |
| 原始數值 | RSI 值、MACD 差值、LLM 信心度、量子閘值 |

卡片顏色：BUY=綠色邊框、SELL=紅色邊框、HOLD/PASS=灰色邊框  
資料型別：`decisionFusion.components`（現有 `SignalComponentInfo[]`）

### ③ 決策時間軸（Decision Timeline）

垂直捲動列表，最新在頂，保留最近 20 筆：

```
14:32:05  2330.TW  BUY  ●●●●●  conf 78%
14:28:41  2330.TW  HOLD ●●●░░  conf 45%
14:24:19  2330.TW  SELL ●●░░░  conf 61%
```

- 點擊任一列：展開顯示完整訊號分解（inline expand，不開 modal）
- 資料來源：`agentLogs` ring buffer（現有 300 筆容量）
- 手機版此區塊隱藏（`hidden md:block`）

---

## 新組件：TradeToast

**檔案**：`src/components/AutoTrading/TradeToast.tsx`

掛載於 `AutoTrading.tsx` 頂層，監聽 `trade_executed` 和 `order_lifecycle` WebSocket 事件。

### Toast 規格

```
✓ 已買入  2330.TW × 1,000 股
  成交價 $580  |  金額 $580,000
  [x]                    ████░  4s
```

- 位置：桌機右下角固定、手機頂部固定
- 同時最多顯示 3 則，超過進入 queue 依序彈出
- 顯示 4 秒後自動消失（含倒數 progress bar 動畫）
- 顏色：BUY=綠色左邊框、SELL=紅色左邊框、Cancel=黃色左邊框
- 實作：純 CSS transition + `useState`，不引入外部套件

---

## 高亮動畫

**實作位置**：`AutoTrading.tsx`（父層 state）

觸發事件：`trade_executed` 或 `positions_update`

父層維護：
```typescript
const [highlightedSymbols, setHighlightedSymbols] = useState<Set<string>>(new Set())
```

透過 props 傳入子組件：
- **`AssetMonitor`**：對應 symbol 列閃爍 `bg-(--color-term-accent)/20` → 淡出，1.5 秒
- **`DecisionLog`**：最新決策列高亮，1 秒

子組件改動：只在對應列加一個 conditional class，**組件邏輯零改動**。

---

## 資料流

```
WebSocket (useAutotradingWS)
  ├── decision_fusion  →  DecisionAnalysisPanel (信心儀表 + 訊號卡)
  ├── agent_log        →  DecisionAnalysisPanel (時間軸) + DecisionLog (現有)
  ├── trade_executed   →  TradeToast + highlightedSymbols state
  ├── positions_update →  AssetMonitor (現有) + highlightedSymbols state
  └── order_lifecycle  →  TradeToast + OrderBookPanel (現有)
```

所有資料均來自現有 WebSocket 訊息，**不新增後端端點**。

---

## 新增檔案

| 檔案 | 說明 |
|------|------|
| `src/components/AutoTrading/DecisionAnalysisPanel.tsx` | 新組件：決策解析面板 |
| `src/components/AutoTrading/TradeToast.tsx` | 新組件：成交 Toast |

## 修改檔案

| 檔案 | 改動說明 |
|------|----------|
| `src/terminal/pages/AutoTrading.tsx` | LIVE_VIEW 佈局改三欄 grid、掛載 TradeToast、傳入 highlightedSymbols props |
| `src/components/AutoTrading/AssetMonitor.tsx` | 接受 `highlightedSymbols?: Set<string>` prop，加 conditional class |
| `src/components/AutoTrading/DecisionLog.tsx` | 接受 `highlightLatest?: boolean` prop，加 conditional class |

---

## 不在本次範疇

- 後端 API 變更
- Strategy / Backtest / Simulation / Performance 其他 tab 改動
- AgentControlPanel 內部改動
- 真實券商 adapter 整合
- 多租戶架構（P2 tech debt）

---

## 成功標準

1. 開啟 LIVE_VIEW 不需任何點擊即可看到當前訊號信心度與分解
2. 成交後 1 秒內出現 Toast，對應部位列高亮
3. 手機版可在三個 tab 間切換，不出現橫向捲軸
4. TypeScript 型別檢查通過（`npm run lint`）
5. 不破壞其他 tab（STRATEGY / BACKTEST 等）的現有功能
