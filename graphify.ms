Graphify 怎麼用？核心指令速查
建立知識圖譜
# 從當前資料夾建立圖譜（最常用）
/graphify .

# 指定某個資料夾
/graphify ./我的專案資料夾

# 深度推理模式（推斷更多潛在關聯）
/graphify . --mode deep

# 只更新有修改的檔案（增量模式，省時間）
/graphify . --update

# 監控模式：檔案一有變動就自動更新圖譜
/graphify . --watch
查詢知識圖譜
# 廣度優先搜尋（適合找大範圍相關概念）
/graphify query "AdSense 廣告收益的優化策略"

# 深度優先追蹤（適合追一條脈絡到底）
/graphify query "Search Console 索引" --dfs

# 找兩個概念之間的最短關係路徑
/graphify path "任務一" "任務四"

# 完整解釋某個概念節點
/graphify explain "SEO"
執行後會產生什麼？輸出檔案說明
graphify-out/（自動建立在你指定的資料夾）
  │
  ├── graph.html        → 互動式視覺化地圖（瀏覽器開啟，可點擊、搜尋）
  ├── graph.json        → 持久化圖譜資料（AI 查詢用，跨對話保存）
  ├── GRAPH_REPORT.md   → 分析報告（核心節點、驚喜關聯、建議問題）
  ├── obsidian/         → Obsidian 筆記格式（可直接匯入）
  │   └── graph.canvas
  └── wiki/             → 自動生成的 Wikipedia 風格文件
其中最重要的是 graph.html 和 graph.json：

graph.html：用瀏覽器打開，就能看到完整的互動知識地圖，節點大小代表重要程度，可以點擊任何節點查看詳情。
graph.json：這是讓 AI 在下次對話中繼續查詢的關鍵檔案，不需要重新建立圖譜，節省大量時間和 Token。
支援的檔案格式
Graphify 幾乎支援所有常見格式：

類型	支援格式	分析方式
程式碼	Python、JavaScript、TypeScript、Go、Rust、Java、C/C++、Ruby 等 20+ 語言	Tree-sitter AST 解析，不需要 AI
文件	.md、.rst、.txt	語意提取
PDF	.pdf	引用關係 + 概念提取
圖片	PNG、JPG、WebP、GIF	視覺 AI 分析（支援中文圖片）
Office	Word、Excel	需選裝額外套件
三個最值得使用的場景
場景一：快速看懂新的 GitHub 工具
Clone 一個陌生的 GitHub repo
       ↓
/graphify ./repo名稱
       ↓
/graphify query "這個工具的核心架構是什麼？"
       ↓
5 分鐘內看懂整個專案，不需要逐檔讀
場景二：建立個人 AI 知識庫
把收集的 PDF、筆記、教學文章放進一個資料夾
       ↓
/graphify ./知識庫資料夾
       ↓
之後每次查詢走圖譜而非重讀全部文件
       ↓
每次查詢省 71.5 倍 Token，知識庫越大省越多
場景三：找出任務之間的協作機會
把所有工作流程文件餵給 Graphify
       ↓
/graphify query "哪些任務共用相同工具？"
/graphify path "發文流程" "社群推廣"
       ↓
找出可以合併或自動化的步驟
       ↓
優化整體工作效率


Graphify 優缺點整理
面向	評估	說明
Token 節省效果	✅ 優秀	71.5x，大型知識庫效果最明顯
安裝難度	✅ 簡單	一行 pip install 搞定
支援中文	✅ 支援	含繁體中文 PDF 和圖片中的文字
持久化圖譜	✅ 支援	graph.json 跨對話保存，不需重複建立
小資料夾划算嗎	⚠️ 不划算	檔案少於 10 個，建圖的成本高於直接讀
需要 Claude Code	⚠️ 有依賴	核心功能需搭配 Claude Code 使用
什麼時候「不應該」用 Graphify？
資料夾少於 10 個檔案：建立圖譜的固定成本比直接讀還貴，不划算。
只查一次的問題：如果只是臨時問一個問題，直接問 AI 更快。
頻繁更動的資料夾：圖譜需要重建，但可以用 --update 增量模式降低成本。
Graphify 最適合的是：中大型、相對穩定、會重複查詢的知識庫。

推薦工具比較
工具	適合場景	Token 效率	費用
Graphify	程式碼 + 混合媒體知識庫	71.5x 節省	免費開源
RAG 向量資料庫	純文字知識庫	中等	視方案而定
直接讀檔案	少量、臨時查詢	無節省	免費但 Token 貴
Obsidian + Dataview	個人筆記管理	無 AI 整合	免費
總結：Graphify 適合你嗎？
如果你符合以下任一條件，Graphify 值得立刻安裝試用：

你有超過 20 個以上的文件/程式碼需要 AI 幫你管理
你常常需要 AI 幫你讀懂陌生的 GitHub 專案
你在用 Claude Code，想降低 Token 消耗成本
你想建立一個「讓 AI 長期記住」的個人知識庫
安裝只需要一行：

pip install graphifyy && graphify install
安裝後執行 /graphify .，幾分鐘內就能看到你的第一張知識圖譜。

有任何安裝問題或使用心得，歡迎在留言區分享！

📚 延伸閱讀：你可能也有興趣
Claude Code 指令完整攻略：50+ 斜線指令、快捷鍵與 CLI 旗標，效率翻倍秘技（2026）
Claude Code 怎麼連接 NotebookLM？MCP 安裝完整教學，自動生成影片總覽（2026）
Claude Code 長期記憶怎麼設定？Memvid + Hooks 讓 AI 自動記住你，零基礎完整教學（2026）
Claude Code Hooks、CLAUDE.md、MCP 整合一次搞懂（2026最新）