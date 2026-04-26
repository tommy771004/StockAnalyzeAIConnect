# AutoTrading Realtime：Ably Free 佈署與設定手冊

本文件對應專案 `StockAnalyzeAIConnect`，目標是讓 AutoTrading 即時事件改走 Ably（保留 WS 與 HTTP polling fallback）。

## 1) 什麼情境需要這份設定

- 你部署在 Vercel，前端出現 `wss://.../ws/autotrading failed`。
- 想要穩定的即時傳輸，不受自架 WS 升級限制影響。
- 想保留原本架構：Ably 失效時仍可 fallback 到輪詢。

## 2) Ably Free 方案適用性

Ably Free 對 PoC/小型產品通常足夠（請以 Ably 官方最新頁面為準）：
- Messages/month：6,000,000
- Message rate：500/s
- Concurrent connections：200
- Concurrent channels：200

參考：
- https://ably.com/docs/pricing/free
- https://ably.com/docs/pricing/limits

## 3) 專案已實作內容

後端：
- `GET /api/autotrading/realtime/meta`：回傳 realtime provider 與 channel metadata
- `GET /api/autotrading/ably/token`：使用伺服器端 Ably key 換取 token（不暴露 secret）
- AutoTrading broadcast 同步 publish 到 Ably channel

前端：
- `useAutotradingWS` 連線順序：
  1. Ably（若可用）
  2. 原生 WebSocket `/ws/autotrading`
  3. HTTP polling（status/logs/positions/balance）
- UI 已顯示「Realtime 未連線，已切輪詢」提示

## 4) Ably 後台設定步驟

1. 建立 Ably 帳號並建立 app。  
2. 在該 app 建立 API Key。  
3. 取得 API key（格式類似 `xxxxxx.yyyyyy:zzzzzzzzzz`）。

## 5) 環境變數設定

### 5.1 Server 必填（本機與 Vercel）

- `ABLY_API_KEY`
  - 例：`xxxxxx.yyyyyy:zzzzzzzzzz`
- `ABLY_AUTOTRADING_CHANNEL`（選填）
  - 預設：`autotrading:global`
- `ABLY_TOKEN_TTL_MS`（選填）
  - 預設：`3600000`（1 小時）

> 注意：`ABLY_API_KEY` 只能放在後端環境變數，不能放 `VITE_` 前綴。

### 5.2 Frontend 選填

- `VITE_AUTOTRADING_RT_PROVIDER`
  - `auto`（預設）：先嘗試 Ably，失敗再 WS，最後 polling
  - `ably`：優先 Ably
  - `ws`：只走原生 WS（不嘗試 Ably）
- `VITE_DISABLE_AUTOTRADING_WS`
  - `true/1` 可強制停用原生 WS
- `VITE_DISABLE_AUTOTRADING_ABLY`
  - `true/1` 可強制停用 Ably

## 6) Vercel 設定清單

1. 進入 Project Settings → Environment Variables。  
2. 新增：
   - `ABLY_API_KEY`
   - `ABLY_AUTOTRADING_CHANNEL`（可不填）
   - `ABLY_TOKEN_TTL_MS`（可不填）
   - `VITE_AUTOTRADING_RT_PROVIDER=auto`（或 `ably`）
3. 重新部署（Redeploy）。

## 7) 本機驗證流程

1. 設定 `.env`（server 可讀取）：
   - `ABLY_API_KEY=...`
   - `ABLY_AUTOTRADING_CHANNEL=autotrading:global`
2. 啟動專案。
3. 登入後打開 AutoTrading 頁。
4. Network 檢查：
   - `/api/autotrading/realtime/meta` 回傳 `ably.enabled=true`
   - `/api/autotrading/ably/token` 回傳 token details
5. UI 右上角連線狀態應顯示 `Ably Realtime`。

## 8) 故障排查

### 症狀：`/api/autotrading/ably/token` 回 501
- 原因：`ABLY_API_KEY` 未設或格式錯誤。
- 解法：檢查 server env 變數是否存在且包含 `:`。

### 症狀：仍顯示輪詢模式
- 可能原因：
  - Ably SDK 無法載入（網路限制/CSP）
  - token endpoint 回錯（401/500）
  - Ably channel 名稱不一致
  - 前後端不同網域，token 請求未帶 cookie
- 解法：
  1. 先看 `/api/autotrading/realtime/meta`
  2. 再看 `/api/autotrading/ably/token`
  3. 確認 `ABLY_AUTOTRADING_CHANNEL` 一致
  4. 檢查 UI 顯示的離線原因（會顯示 token endpoint 失敗原因）

### 症狀：Ably Dashboard 的 API Request Log 完全沒有紀錄
- 常見原因：
  - 前端根本沒進到 Ably（例如 `VITE_AUTOTRADING_RT_PROVIDER=ws`）
  - `/api/autotrading/ably/token` 未成功，導致沒建立 realtime 連線
  - token 路徑打錯網域（有設 `VITE_API_URL` 但仍走前端相對路徑）
- 目前專案已做：
  - 連線前會先 preflight token endpoint
  - token 請求改由前端顯式 `fetch(..., { credentials: 'include' })`
  - 會把離線原因顯示在畫面（例如 401、501、CSP、SDK 載入失敗）

### 症狀：有連上但沒事件
- 可能原因：Agent 尚未產生 broadcast event。
- 解法：啟動引擎、觸發策略決策後再看日誌與資產變化。

## 9) 安全建議

- 不要把 `ABLY_API_KEY` 放到前端 bundle。
- token endpoint 必須走既有登入驗證（本專案已用 `authMiddleware`）。
- capability 只開 `subscribe`；publish 只在後端做。
