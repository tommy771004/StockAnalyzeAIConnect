\[DOMAIN SKILL: FRONTEND \& PERFORMANCE ARCHITECTURE]



1\. 終端機動態儀表板 (react-grid-layout)



畫布設定: src/components/Dashboard.tsx 必須實作 Responsive、WidthProvider 的 Grid 畫布。



斷點設計 (Breakpoints): 必須定義 lg: 1200, md: 996, sm: 768, xs: 480 的響應式斷點與對應的欄位數 (cols)。



Widget 封裝: 所有的元件 (如 ChartWidget.tsx) 長寬必須設為 100%，並監聽 ResizeObserver 確保內部圖表能跟隨 Grid 拖曳時即時縮放。



Layout 持久化: 透過 Zustand 監聽 onLayoutChange，並將配置寫入 localStorage 或同步至 Node 後端，確保用戶刷新頁面後版面不變。



2\. 高頻數據與 Web Worker 通訊 (The Golden Rule)



嚴禁 React State 污染: 絕對禁止將 WebSocket 的即時 Ticks 或 Orderbook 放入 useState、Zustand 或 Context。



Worker 通訊協定:



WebSocket 連線必須建立在 src/workers/socket.worker.ts 中。



Worker 接收資料、解壓縮、計算（搭配 indicator.worker.ts）後，透過嚴格型別的 postMessage 傳送。

Payload 範例: { type: 'TICK\_UPDATE', symbol: 'AAPL', data: { price: 150.5, vol: 100 } }



DOM 直接繪製: Component 內部使用 useEffect 監聽 Worker 訊息，將數值存入 useRef，並呼叫 Lightweight Charts 的 .update() 直接重繪 Canvas。



3\. 狀態分層 (State Stratification)



Zustand (marketDataStore.ts): 僅限用於全局 UI 變數，例如：currentSelectedSymbol、isDarkMode、activeWidgets。



TanStack React Query (useQueryHooks.ts): 用於所有 REST API (歷史 K 線、財報、新聞)。必須設定合理的 staleTime (例如：K線資料 1 分鐘內不重複發 API) 與 cacheTime。

