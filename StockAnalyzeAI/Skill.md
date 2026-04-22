13. PostgreSQL Schema：基礎會員與交易 (Prisma)

你是精通 Next.js 後端與 PostgreSQL 的專家。請幫我新增撰寫 schema.prisma。請提供完整的 Prisma 結構代碼。

14. PostgreSQL Schema：Hermes 記憶庫擴充 (Agent Memory)

延續 schema.prisma，為了支援 Hermes Agent 的長期記憶與自我進化特性，請加入第四個模型 AgentMemory。
欄位包含：id, userId, memoryType (Enum: PREFERENCE, SKILL, CONTEXT), content (String/JSON), createdAt。這將讓 AI 能跨對話保留使用者的交易偏好與自動萃取出的技能。請提供更新後的 schema。

15. 多重資料源模組：Yahoo Finance

16. 多重資料源模組：TradingView 備援


17. 多重資料源模組：TWSE 台股即時補強


18. 智慧路由與資料整併 API (/api/market)

解析 ticker 判斷市場（純數字為台股）。

預設呼叫 Yahoo Finance 獲取資料。

若為台股且發現 Yahoo 資料非最新，則同步呼叫 TWSE API 更新即時價格。

若上述失敗，嘗試 Fallback 到 TradingView。
請回傳整合後的 JSON (包含 price, history 陣列)。

19. 後端技術指標運算邏輯

建立 utils/technical.ts。
接收 /api/market 抓到的歷史 OHLCV 陣列。使用 technicalindicators 套件，計算出 SMA(20)、SMA(50)、MACD、RSI(14)。並寫一段邏輯，根據這些指標回傳一個繁體中文的「綜合建議」(例如：強烈買進、觀望、賣出)。

20. 新聞情緒分析邏輯

建立 utils/sentiment.ts。
使用 yahoo-finance2 的 news 模組獲取該標的最新的 3 篇新聞。實作一個簡單的繁體中文正負向關鍵字計分演算法，計算平均情緒分數，並回傳「偏向樂觀 / 中立 / 偏向悲觀」的文字結論與新聞列表。

21. Hermes Agent：OpenRouter API 串接與免費模型選擇

建立 app/api/agent/route.ts 的基礎。
撰寫呼叫 OpenRouter API (https://openrouter.ai/api/v1/chat/completions) 的原生 fetch 邏輯。
嚴格要求：模型參數 model 必須設定為自動選擇免費可用模型，優先寫入 nousresearch/hermes-3-llama-3.1-405b:free。實作基本的請求與回應解析。

22. Hermes Agent：長期記憶讀取與 Context 注入 (RAG)

擴充 /api/agent/route.ts。
在向 OpenRouter 發送請求前，先透過 Prisma 查詢當前使用者的 AgentMemory、Watchlist 與 TradeRecord。
將這些資料與步驟 18, 19 取得的「最新股價與技術指標」組合，寫入傳給 LLM 的 system 角色 prompt 中，讓 Hermes 擁有完整的背景記憶。

23. Hermes Agent：自我進化 System Prompt (Skill Extraction)

繼續擴充 /api/agent/route.ts 裡的 System Prompt。
加入以下工程化指令：「你是 Hermes 代理框架，具備自我進化能力。觀察使用者的對話，若發現他們偏好特定的投資策略或指標，請在你的回覆中，另外以嚴格的 JSON 格式輸出一個 <extracted_skills> 區塊。你的對話回覆請一律使用繁體中文。」

24. Hermes Agent：記憶寫入資料庫與回傳 (Memory Persistence)

完善 /api/agent/route.ts 的回應處理。
解析 OpenRouter 回傳的內容，如果偵測到 <extracted_skills> 區塊的 JSON 內容，請在後端觸發 Prisma AgentMemory.create 將新技能/偏好存入資料庫。
最後將乾淨的文字回應以 JSON (或 HTTP Stream) 格式回傳給前端。