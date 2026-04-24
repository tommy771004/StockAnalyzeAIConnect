[DOMAIN SKILL: AUTONOMOUS AGENT & GENERATIVE UI]

1. 後端 Agent 大腦 (Node.js)

目標檔案： server/services/autonomousAgent.ts

Function Calling (工具呼叫): Agent 不能憑空捏造數據。必須將 server/repositories/ 的資料庫操作，包裝成嚴格的 JSON Schema 註冊為 LLM Tools。
範例: get_portfolio_performance、execute_backtest。

Agent Memory (代理記憶): 整合 agentMemoryRepo.ts，在每次向 LLM 發送 Request 前，先查詢該用戶的歷史偏好 (例如風險承受度) 作為 System Prompt 的 Context 增強。

2. 串流與生成式 UI (Streaming & GenUI)

Server-Sent Events (SSE): Node.js 後端必須實作 SSE 或 WebSocket 串流，將 LLM 的回應即時推送到前端。

自定義 Tool 攔截器 (GenUI):

當後端 LLM 決定呼叫工具 (例如：show_stock_chart)，後端會透過串流吐出特殊的標記或 JSON 結構 (例如：{"type": "ui_component", "name": "ChartWidget", "props": {"ticker": "AAPL"}})。

前端的 aiService.ts 解析到此標記時，停止輸出純文字。

在 React Chat 元件中，透過 Component Map 動態渲染實體的 React Widget。

嚴禁 Markdown 幻覺: 絕對禁止讓 LLM 輸出 ASCII K線圖或是複雜的 Markdown 表格來呈現金融數據，一律改用實體 UI 元件渲染。