\[DOMAIN SKILL: NODE.JS BACKEND \& DRIZZLE ORM SECURITY]



1\. Drizzle ORM \& Database Layer (資料層)



Schema Definition (src/db/schema.ts): \* 所有資料表欄位必須具備精確型別。金融金額必須使用 numeric 或 decimal (嚴禁使用浮點數 float 避免精度丟失)。



必須定義清晰的 relations 以支援 Drizzle 的關聯查詢 (Relational Queries)。



Repository Pattern (儲存庫模式): \* 絕對禁止在 server/api/ 的路由處理器中寫入原生的 Drizzle db.select() 等查詢。



所有資料庫操作必須封裝在 server/repositories/ 內部，透過 Dependency Injection 或 Export Function 供 Services 調用。



Performance Indexing (效能索引): \* 對於 tradesRepo.ts 或 server/services/backtestEngine.ts 會頻繁查詢的時間序列資料表，必須在 Schema 中使用 Drizzle 語法宣告複合索引 (Composite Indexes)，例如 .index('idx\_symbol\_time').on(table.symbol, table.timestamp)，以加速查詢。



2\. Authentication \& API Security (身分驗證與介面安全)



Middleware (server/middleware/auth.ts): \* 所有的 Private Route 必須經過該中介層驗證。



Token Storage (憑證安全): \* 嚴禁指引前端將 JWT 或 Session Token 儲存於 localStorage 或 sessionStorage (極易遭受 XSS 攻擊)。



Node.js 後端在登入成功後，必須透過 res.cookie() 發放 JWT，且必須設定 HttpOnly: true, Secure: true, SameSite: 'strict'。



CORS \& Rate Limiting (跨域與限流):



後端必須配置嚴格的 CORS 策略，僅允許 vite.config.ts 中設定的 Client Domain 連線。



針對 AI Agent 路由 (server/api/agent.ts) 與登入路由，必須實作 Rate Limiting (如 express-rate-limit 或 Redis)，防止惡意用戶耗盡 LLM API 額度。



CSRF Protection: \* 針對所有修改狀態的 API (POST/PUT/DELETE)，需搭配 Anti-CSRF Token 機制或依賴 SameSite Cookie 策略進行嚴格防護。



3\. WebSocket Security (即時通訊安全)



Ticket-Based Authentication (票證驗證):



建立 WebSocket 連線時，嚴禁將 JWT 放在 URL 參數中 (wss://...?token=xxx)，避免憑證洩漏於伺服器 Log 中。



標準流程： 前端先打一個 REST API (/api/ws-ticket) 獲取一個短效期 (如 10 秒) 的隨機 Ticket -> 前端拿 Ticket 建立 WS 連線 -> WS Server 驗證 Ticket 後立即將其銷毀 (One-time use)。



4\. API Key Isolation (外部金鑰隔離)



第三方金鑰 (如 OpenAI API Key, TradingView Scraper Credentials, Finnhub Key) 必須且只能存在於 Node 後端的 .env 中。



絕對禁止在前端的 Vite .env 中加上 VITE\_ 前綴將敏感金鑰打包進 Client 端。所有的外部請求皆須由 Node.js Server 做 Gateway 轉發。

