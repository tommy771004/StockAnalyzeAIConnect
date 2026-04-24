🤖 Codex 開發與重構協作手冊



零、 環境準備 (Context Setup)



在開始任何開發之前，必須先將所有的架構規則載入 AI 的上下文中。



skills/00\_Master\_Architecture.md

skills/01\_Frontend\_Performance.md

skills/02\_Agent\_GenUI.md

skills/03\_Backend\_Security.md

skills/04\_Production\_Readiness.md





如果您使用 Cursor IDE：

請在對話框輸入 @docs/skills 將資料夾引入，或在專案根目錄的 .cursorrules 中寫入：

Always read and follow the markdown files inskills/ before writing any code.



壹、 階段性重構指令 (Phased Prompts)



請一次只執行一個階段。確認程式碼能順利運行且沒有 TypeScript 錯誤後，再進入下一個階段。



📍 Phase 1: 後端資安與資料庫加固 (Backend First)



目標：確保底層 API 安全，設定 Drizzle 效能索引。



請複製並貼上以下指令：



「這是一個重構任務 (Phase 1)。

請先仔細閱讀skills/00\_Master\_Architecture.md 與skills/03\_Backend\_Security.md。



任務內容：



檢查現有的 server/middleware/auth.ts，將其重構為僅依賴 HttpOnly Cookie 進行 JWT 驗證，徹底移除從 Header 或 LocalStorage 讀取 Token 的邏輯。



檢查 src/db/schema.ts，並撰寫一個新的 Drizzle migration，針對 trades 與 positions 等資料表加上符合高頻回測效能的複合索引。



請一步步執行，並在修改後簡要說明套用了規格書中的哪一條規則。」



📍 Phase 2: 前端狀態剝離與 Web Worker 強化



目標：解決 React 效能瓶頸，分離高頻報價數據。



請複製並貼上以下指令：



「進入重構任務 (Phase 2)。

請先仔細閱讀skills/01\_Frontend\_Performance.md。



任務內容：



檢查 src/store/marketDataStore.ts，清除所有不適合放入全域狀態的高頻 WebSocket 變數。



建立新的 src/workers/socket.worker.ts，負責 WebSocket 連線池與 Tick 資料接收，並實作 postMessage 介面。



修改 src/components/ChartWidget.tsx，移除對 Zustand 高頻資料的依賴，改用 useEffect 監聽 Worker，並透過 useRef 直接更新圖表。



請確保實作完全符合『高頻數據與 Web Worker 通訊』原則。」



📍 Phase 3: 終端機 UI 儀表板 (The Grid Dashboard)



目標：導入拖曳式版面與響應式設計。



請複製並貼上以下指令：



「進入重構任務 (Phase 3)。

請先仔細閱讀skills/01\_Frontend\_Performance.md 與skills/04\_Production\_Readiness.md。



任務內容：



確保已安裝 react-grid-layout。



將 src/components/Dashboard.tsx 重寫為 Responsive Grid Layout。



將 LiveTradingConsole.tsx 與 ChartWidget.tsx 作為 Widget 放入 Grid 中，並設定寬高 100% 滿版。



使用 Zustand 儲存 Layout 狀態，並加入 useDeviceType.ts 判斷：若為手機版，則強制轉換為單欄顯示 (cols=1)。



請產出完整可運行的 Dashboard.tsx 程式碼。」



📍 Phase 4: Agent 大腦與 GenUI (The AI Revolution)



目標：導入 Function Calling 與生成式 UI。



請複製並貼上以下指令：



「進入核心 AI 重構任務 (Phase 4)。

請務必仔細閱讀skills/02\_Agent\_GenUI.md。



任務內容：



重構 server/services/autonomousAgent.ts。將 TWSeService.ts 內的功能定義成 OpenAI Tools (Function Calling Schema)，停止使用傳統 Prompt 塞資料的方式。



修改 Node.js Agent Route，支援 SSE 串流回傳，並在觸發 Tool Call 時吐出特定的 JSON UI 標記。



修改前端 src/services/aiService.ts，攔截 Tool Call 標記，並在 React 中動態渲染實體的圖表元件，取代純文字輸出。



請先產出後端定義 Tools 的程式碼，確認無誤後再進行前端實作。」



📍 Phase 5: 國際化與跨平台適配 (Production Readiness)



目標：處理多語系、API 路由設定及 Electron 相容性。



請複製並貼上以下指令：



「進入上線準備任務 (Phase 5)。

請閱讀skills/04\_Production\_Readiness.md。



任務內容：



檢查 src/utils/api.ts (或 axios/fetch 設定)，確保所有 API Base URL 均動態讀取 import.meta.env.VITE\_API\_URL。



檢查 src/i18n.ts，修改前端呼叫 server/api/agent.ts 的 payload，確保每次請求皆附帶當前使用者的 locale (如 zh-TW)，供後端 Agent 參考。



審查 Scripts/build-electron.mjs 和 preload.ts，確認目前前端的寫法符合 Electron 的 IPC 安全性原則。



請逐一檢查並提供必要的修改建議。」



💡 與 AI 協作的心法 (Best Practices)



避免上下文污染 (Clear Context)： 執行完一個 Phase 後，若使用 CLI，建議輸入 /clear 清除紀錄，再重新 /add 必要文件，防止 AI 混淆。



要求它思考 (Chain of Thought)： 可在指令結尾加上："請先用 <thinking></thinking> 標籤分析你要改動哪些檔案，再開始寫 Code。"，這能顯著降低改錯檔案的機率。



小步快跑： 要求 AI：「改完一個 Component 就停下來等我確認，不要一次修改太多檔案。」

