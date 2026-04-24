是的，確實絕大多數是假資料跟不會動作的按鈕。讓我誠實拆解現況：

目前是模擬資料
src/terminal/mockData.ts 裡 全部硬寫死：

indexTickers — S&P 500 / DOW / NASDAQ 等指數
watchlistRows — AAPL/TSLA/NVDA/MSFT/AMD 價格
heatmapCells — 板塊漲跌
dashboardNews / newsFeed — 新聞全文（含內文段落、pull quote）
portfolioHoldings / tradeLog / navSeries / sectorAllocation
aaplCandles — 用 Math.sin + Math.random 產生
aaplMacd — 同上
研究頁的估值指標、分析師共識、情緒評分都寫死
目前是假按鈕（UI only）
元件	目前行為
頂部 Search 欄	只收 input，沒 submit
🔔 通知 / ⚙️ 設定 / 👤 帳號	純圖示
左側 Sidebar 全部 icon	點下去沒反應
Quick Trade BUY / SELL	不會送單
範圍按鈕 1D/1W/1M/YTD	只改 local state，不換資料
News Filter（所有地區/產業/資產）	按了沒過濾
News 分享/書籤/列印 icon	沒接
Research 的 MA / MACD toggle	不真的切換圖
持倉「查看全部」	連結指向 #
Footer 三個連結	#
目前真的會動的部分
Tabs 切換頁面（6 個 view + URL hash 同步）
Watchlist 點選 → 中間圖表 & Quick Trade 的標的會跟著換
Top Movers 的 GAINERS/LOSERS tab
News feed 點選 → 右側文章閱讀器換內文
Quick Trade 的 QUANTITY × PRICE → EST. TOTAL 即時計算
視覺的 heatmap / donut / candlestick（SVG 用 mock 數據畫出來）
另外：Phase 1/2/4 也還沒串到 UI
Phase 1 HttpOnly cookie auth → 沒有 Login 畫面呼叫它
Phase 2 socket.worker.ts → ChartWidget 加了 liveMode prop，但 FIN-TERMINAL 介面沒有用 ChartWidget（目前畫面用的是 src/terminal/pages/Dashboard.tsx 裡的 SVG bar chart）
Phase 4 streamAgentChat() → 沒有任何 Chat UI 呼叫它
下一步建議（任一都可）
把 Dashboard 的 Watchlist 接到 /api/watchlist + /api/stock/:symbol（最有感，不用改 UI 架構）
把中央圖表改用 ChartWidget + liveMode，讓 socket.worker 真的跑起來
新增 AI Chat Panel 呼叫 streamAgentChat()，把 Phase 4 的 GenUI 真的渲染出 <ChartWidget>
建 Login 頁呼叫 /api/auth/login，驗證 Phase 1 cookie 流程