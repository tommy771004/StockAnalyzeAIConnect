# CLAUDE.md — StockAnalyzeAIConnect

行為指南，減少常見 LLM 編碼錯誤，並整合本專案架構規範。

---

## 專案概覽

**Hermes AI Trading Terminal** — 全端量化交易平台。

- **前端**：React 19 Canary + TypeScript + Tailwind CSS v4 + Vite
- **後端**：Express (Node.js) + Drizzle ORM + better-sqlite3 / Neon Postgres
- **桌面**：Electron（`dist-electron/main.js`）
- **Python 服務**：`server/python/`（量子訊號、TimesFM 預測、TradingView 爬蟲）
- **即時通訊**：Ably Realtime WebSocket

---

## 路由架構（`src/App.tsx`）

路由採 **hash-based**，無 React Router。

```
window.location.hash  →  TerminalView  →  對應頁面元件
```

`TerminalView` 聯合型別定義於 `src/terminal/types.ts`：

```
dashboard | market | crypto | portfolio | research |
backtest | news | alerts | screener | autotrading | settings
```

**新增頁面的正確流程：**
1. 在 `src/terminal/types.ts` 的 `TerminalView` 聯合型別加入新值
2. 在 `src/App.tsx` 的 `VALID_VIEWS` 陣列加入新值
3. 在 `SEARCH_PLACEHOLDER` map 加入對應佔位文字
4. 在 `Layout` render 區塊加入 `{view === 'xxx' && <XxxPage />}`
5. 在 `src/terminal/shell/Sidebar.tsx` 加入導覽項目

---

## 認證（`src/contexts/AuthContext.tsx`）

- JWT 由後端透過 **HttpOnly Cookie** 管理，前端**不存 token**，不用 `Authorization` header
- `useAuth()` 回傳 `{ user, loading, login, register, logout }`
- `user === null` 時 App 渲染 `<LoginPage />`；頁面元件不需自行做 auth guard
- API 層 401 會廣播 `AUTH_EXPIRED_EVENT`，自動清除 user 狀態

---

## Layout 系統（`src/terminal/shell/Layout.tsx`）

```
<Layout active={view} onChange={handleChange} searchPlaceholder="...">
  <ViewTransition>          ← React 19 view transition
    {view === 'x' && <XPage />}
  </ViewTransition>
</Layout>
```

Layout 內部包含：`TopNav` → `TickerTape` → `Sidebar` + `AgentPanel` + `Footer`

**行動版底部導覽**固定顯示 5 個最常用項目（`BOTTOM_NAV_IDS`）。

---

## 頁面元件位置

| 頁面 | 檔案 |
|------|------|
| Dashboard | `src/terminal/pages/Dashboard.tsx` |
| Market | `src/terminal/pages/Market.tsx` |
| Crypto | `src/terminal/pages/Crypto.tsx` |
| Portfolio | `src/terminal/pages/Portfolio.tsx` |
| Research | `src/terminal/pages/Research.tsx` |
| Backtest | `src/terminal/pages/Backtest.tsx` |
| News | `src/terminal/pages/News.tsx` |
| Alerts | `src/terminal/pages/Alerts.tsx` |
| Screener | `src/terminal/pages/Screener.tsx` |
| AutoTrading | `src/terminal/pages/AutoTrading.tsx` |
| Settings | `src/terminal/pages/Settings.tsx` |
| Login | `src/terminal/pages/Login.tsx` |

---

## 國際化（i18n）

- 使用 `react-i18next` + `i18next-http-backend`
- 語系檔位置：`public/locales/{en,zh}/*.json`
- **預設語言：`zh`**（繁體中文為主）
- `useTranslation()` + `t('key', 'fallback')` 用於所有 UI 文字
- `SEO` 元件自動產生 `hreflang` 標籤

---

## SEO（`src/components/SEO.tsx`）

每個頁面頂層須包 `<SEO title={...} path={...} />`，已整合 Open Graph 與 canonical URL。

```tsx
<SEO title={t(`nav.${view}`, view.toUpperCase())} path={`/#${view}`} />
```

---

## 樣式規範

- **Tailwind CSS v4**：使用 CSS 變數語法，例如 `bg-(--color-term-bg)`
- 工具函式：`cn()` 位於 `src/lib/utils.ts`（`clsx` + `tailwind-merge`）
- 終端機色盤以 CSS 自訂屬性 `--color-term-*` 定義

---

## 後端 API 路徑

```
/api/auth/*         → 認證（login / register / logout / me）
/api/agent          → AI Agent（server/api/agent.ts）
/api/research       → 個股研究（server/api/research.ts）
/api/ecpay          → 金流（server/api/ecpay.ts）
```

---

## 開發指令

```bash
# 啟動後端（含 tsx 熱重載）
npm run dev

# 啟動 Electron 前端開發
npm run dev:electron

# 型別檢查（無輸出 = 通過）
npm run lint

# 生產建置
npm run build
```

---

## 行為準則

### 1. 先思考再編碼
- 明確陳述假設；有疑問就問
- 多種解讀時列出選項，不要默默挑一個
- 有更簡單的方案就說出來

### 2. 簡潔優先
- 最少的程式碼解決問題，不添加未被要求的功能
- 不為一次性操作建立抽象層
- 200 行能寫 50 行就重寫

### 3. 外科手術式修改
- 只動必須動的地方，不順手重構鄰近程式碼
- 符合既有風格（即使你會不同做法）
- 自己的改動製造的孤兒 import/變數要清掉；既有的死碼提醒即可，不刪除

### 4. 目標驅動執行
- 將任務轉換為可驗證的目標再開始實作
- 多步驟任務列出計畫並逐步驗證

---

## 常見陷阱

- **不要**在 `src/App.tsx` 以外的地方讀寫 `window.location.hash`，路由邏輯集中於此
- **不要**在前端 localStorage 儲存 JWT 或任何認證 token
- **不要**在頁面元件內自行呼叫 `/api/auth/me`，使用 `useAuth()` context
- Electron 打包後 `app.getAppPath()` 可能指向 `.asar`，避免用它解析靜態資源路徑
- 新增 `TerminalView` 值時必須同時更新 `VALID_VIEWS`、`SEARCH_PLACEHOLDER`、Sidebar，否則導覽會靜默失效

---

## AutoTrading 子系統常見陷阱

- **Agent 是 process-level singleton**：後端僅支援單一用戶的 Agent 實例。多用戶並發會造成 `agentConfig` 互相覆蓋，`posTrack` / `lossStreakCount` 跨用戶污染。這是已知技術債（P2），不要在沒有完整多租戶重構的情況下假設多用戶安全。
- **`strategies` 陣列不控制訊號計算**：勾選 `AI_LLM` 不會停用技術指標的 `SignalObservation`。調整訊號影響力需修改各訊號的 `weight`；`weight = 0` 才是真正停用。
- **主動停損由 `stopLossPct` 觸發，不靠 LLM**：Tick 的 Phase 1（分析）結束後、Phase 2（下單）開始前，會比對 `posTrack` 均成本與現價，虧損比例 ≥ `params.stopLossPct`（預設 5%）時自動注入 `confidence = 100` 的強制 SELL，繞過 LLM 信心度門檻。不要移除此邏輯改為依賴 LLM 自行判斷停損。
- **`posTrack` 重啟恢復需要查詢 `cooldown` 狀態**：`getAllActiveConfigs()` 查詢範圍為 `status IN ('running', 'cooldown')`。若縮減為只查 `running` 會導致 cooldown 重啟後 `avgCost` 歸零，損益計算和連損計數永久錯誤。
- **對沖方向由 `hedgeConfig.hedgeType` 決定**：`hedgeType: 'direct'`（正向標的）時，對沖方向與主單相反（BUY→SELL, SELL→BUY）；`'inverse_etf'`（預設，如 00632R）永遠 BUY。新增 `hedgeSymbol` 時必須同時指定 `hedgeType`，否則正向標的會被錯誤地加碼而非對沖。
- **所有 broker adapter（KGI / Sinopac / Yuanta）均為架構佔位**：`mode: 'real'` 在 UI 存在但 `activeBroker` 硬編碼為 `simulatedAdapter`。勿替換為真實 adapter，除非 adapter 已通過完整沙盒驗證並簽署風險預告書。

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
