\[DOMAIN SKILL: PRODUCTION READINESS \& CROSS-PLATFORM]



1\. 跨平台架構 (Cross-Platform Execution)



本專案為三棲架構：Web SPA (Vercel)、PWA (Mobile)、Desktop (Electron)。



環境變數注入: 嚴禁在程式碼中寫死 API URL (http://localhost...)。必須依賴 import.meta.env.VITE\_API\_URL 與 import.meta.env.VITE\_WS\_URL。



Electron 隔離 (IPC): 當打包為 Electron (Scripts/build-electron.mjs) 時，前端必須透過 preload.ts 暴露的 contextBridge 與系統底層溝通，嚴禁在 React 中直接 import fs 或調用 Node 原生模組。



PWA 與 Mobile 適配: \* 偵測到行動裝置時 (hooks/useDeviceType.ts)，react-grid-layout 必須切換至單欄模式 (isBounded={true}, cols={1})。



啟用 hooks/useSwipeNavigation.ts 與 hooks/usePullToRefresh.ts 增強觸控體驗。



2\. 國際化與 AI 語系同步 (i18n \& Context Aware AI)



UI 多語系: 所有介面字串必須使用 react-i18next (useTranslation hook) 進行包裝，字典檔統一放於 public/locales/。



AI 語系連動: 前端向 server/api/agent.ts 發起請求時，Payload 必須包含當前的語系代碼 (e.g., { query: "...", locale: "zh-TW" })。後端 Agent 必須將此 locale 注入至 LLM 的 System Prompt，強制 AI 使用與 UI 一致的語言回覆與生成工具 JSON。



3\. 多雲部署策略 (Multi-Cloud Deployment)



Frontend (Vercel): 依賴 vercel.json 進行靜態託管與路由重寫 (SPA Fallback)。



Backend (Render): 依賴 render.yaml 部署 Node.js Express Server 與背景 Worker。確保 Health Check endpoint (api/ping.ts) 設定正確。



Database (Neon/PostgreSQL): 依賴 Scripts/migrate-json-to-neon.ts 完成本地資料至雲端資料庫的遷移。生產環境的 Drizzle 必須連線至 Connection Pooling 的 URL (如 PgBouncer)。



4\. 系統容錯與韌性 (Resilience \& Fallbacks)



API 斷路器 (Circuit Breaker): 若第三方資料源 (TradingView, Finnhub) 連續 Timeout，系統應停止重試並啟動本地 Cache (services/cache.ts) 作為 Fallback 顯示歷史資料。



Agent 降級體驗: 若 LLM 供應商 (如 OpenAI) API 異常，autonomousAgent.ts 必須捕捉錯誤，並回傳格式化的 JSON 錯誤訊息，前端 GenUI 需渲染 <Alert variant="destructive">AI 服務暫時無法使用</Alert>，確保終端機其他功能 (如手動下單、看盤) 依然可正常運作。

