# Stock AI Connect — UX / 設計審計報告

> 審計日期：2026-06-18 ·  審計範圍：前端 Web 介面（量化交易終端機）
> 對象：`https://stock-analyze-ai-connect.vercel.app/` 對應之原始碼

---

## ⏩ 更新（2026-06-18，後續實作）

第一階段（PR #43，已合併）完成審計報告 + 低風險無障礙修正。經使用者授權後，**第二階段**進一步實作了原本「只建議、不動手」的 4 個項目：

| 原編號 | 項目 | 實作 |
|---|---|---|
| P0-1 | 啟用 ErrorBoundary | `App.tsx` 以 `<ErrorBoundary key={view}>` 包覆頁面切換（`key` 確保切換頁面時自動復原）；並修正其未定義背景 `--card-bg` → `--color-term-panel`。任一頁 render 例外時改為顯示**可重試的錯誤卡片且外殼（導覽列）保留**，不再整頁空白。見 `screenshots/after-errorboundary.png`。 |
| P1-1 | 對比達 AA | `--color-term-muted` `#5c6678` → `#7e8a9c`（on panel ≈5.3:1、on bg ≈5.6:1，通過 AA）。`subtle` 維持原值（僅用於邊框/捲軸/裝飾 icon，無正文）。 |
| P1-2 | 統一主色為琥珀 | Settings 全數 `sky-*` → `--color-term-accent`（Save／Contact／Edit／PRO 徽章／通知開關／輸入框 focus）；Backtest「開始回測 RUN」`indigo-500` → `--color-term-accent`。見 `screenshots/after-settings-amber.png`、`after-backtest-amber.png`。 |
| P2-1 | 對齊側欄圖示 | `Sidebar` dashboard `Star`→`LayoutDashboard`、market `CalendarDays`→`Globe`，與底部導覽一致且語意正確。 |

> 驗證：`VERCEL=1 npm run build` ✅；4 項皆以 Playwright 重新截圖確認。其餘 P2/P3 建議（alert→toast、補 `<h1>`、Backtest i18n、ARIA combobox、`<html lang>` 同步等）維持為建議。

---

## 0. 摘要（TL;DR）

整體而言，這是一套**完成度很高、工程基礎扎實**的深色終端機風格介面：語意化 `<button>`/`<section>`/`<header>`、`focus-ring`（focus-visible）、`motion-safe` + `prefers-reduced-motion`、`h-dvh` + safe-area、表格 `overflow-x` 邊到邊捲動、良好的空狀態（empty state）等都做得不錯。

主要問題集中在三塊：

1. **可讀性 / 對比**：大量次要文字使用 `--color-term-muted (#5c6678)` 與 `--color-term-subtle (#3a4557)`，實測對比 **3.40:1 / 2.04:1**，未達 WCAG AA（4.5:1）。這是最普遍、最影響日常使用的問題。
2. **設計一致性**：主要按鈕顏色在不同頁面分別是 **琥珀（amber）／青（cyan/sky）／紫（violet）**；側欄與底部導覽對「同一個目的地」用了**不同且語意不符的圖示**（Dashboard=星星、Market=日曆）。
3. **韌性 / 無障礙**：專案內有 `ErrorBoundary` 元件，但**整個 live 樹中沒有任何地方使用它** → 任一頁面 render 例外會讓整個畫面變空白。另有數個表單欄位缺 label 關聯、一個用 `<div onClick>` 做的開關。

本報告已**直接修正**所有「安全、明確、低風險」的項目（label 關聯、`role="switch"`、aria-label、aria-hidden、autocomplete、typo 等 9 項，見 §3）。凡牽涉**全站設計取捨**（全域色彩 token、品牌主色、圖示語彙、改用 toast 等）一律**只提建議、不動手**（見 §4）。修改後 `npm run build` ✅ 通過（3011 modules，無新增錯誤）。

---

## 1. 方法與限制（重要）

| 項目 | 說明 |
|---|---|
| 預期作法 | 用帳密登入線上站，逐頁截圖 |
| 實際限制 | **本執行環境的網路政策封鎖了該 Vercel 網域**（egress proxy 回傳 `HTTP 403 / x-deny-reason: host_not_allowed`；github.com、npm 等其他主機則可連）。因此**無法**從本機觸及線上站。 |
| 替代作法 | 本機 `vite` dev server（`127.0.0.1:3000`）啟動前端，以 **Playwright（Chromium）** 對 12 個 view + 登入頁，於**桌機 1440×900** 與 **手機 390×844** 兩個斷點逐頁截圖（共 26 張），並以路由攔截 mock 登入狀態。 |
| 截圖字型 | Google Fonts 同樣被 proxy 封鎖，截圖以**系統 fallback 字型**呈現；實際站上的 JetBrains Mono / Outfit 視覺會略有不同。**版面、間距、色彩、對比、層級判讀不受影響。** |
| 資料 | 無後端，API 以空資料 mock；故截圖多為**空狀態 / 載入後空表**。Dashboard、Research、SmartMoney、Alerts、AutoTrading 在空資料下觸發 render 例外（屬 mock 資料 shape 不符，**非線上 bug**），該 5 頁改以**靜態原始碼分析**為主。 |
| 對比量測 | 依 WCAG 2.1 相對亮度公式計算（見 §5 附錄），數值可重現。 |
| 可重現腳本 | `scripts/ux-shots.mjs`（需 `npm i -D playwright && npx playwright install chromium`）。 |

> 若希望我直接審計**線上正式站**（含真實資料下的圖表、表格密度、即時互動回饋），請在環境網路政策放行 `stock-analyze-ai-connect.vercel.app`，我可重跑同一套流程補齊。

---

## 2. 嚴重度分級

| 等級 | 定義 |
|---|---|
| **P0 critical** | 會導致功能不可用或整頁崩潰、或嚴重阻擋無障礙使用 |
| **P1 high** | 明顯影響可用性 / 可讀性 / 一致性，建議優先處理 |
| **P2 medium** | 影響體驗或可維護性，排期處理 |
| **P3 low** | 細節打磨、nice-to-have |
| ✅ **已修** | 本次已直接修正 |

---

## 3. 發現（依嚴重度）

### 🔴 P0-1　全站缺少 ErrorBoundary，render 例外會整頁變空白
- **類別**：韌性 / 互動回饋
- **位置**：`src/components/ErrorBoundary.tsx`（元件存在）；`src/main.tsx:28-46`、`src/App.tsx:119-145`（**未包覆**）
- **證據**：在 mock 空資料下，Dashboard 等頁面一拋例外即呈現**全黑空白**（無任何訊息或重試）。`grep` 確認 `ErrorBoundary` 在整個 `src/` 中**沒有任何 import**。
- **說明**：`<App>` 的頁面切換與 `Layout` 內容沒有任何 error boundary；任一子元件 render 期間拋錯，React 會卸載整棵樹，使用者只看到空白畫面。
- **建議**：將既有 `ErrorBoundary` 包在 `App.tsx` 的頁面切換（每個 `view` 一層）或 `Layout` 的 `<main>{children}</main>` 外；順帶修正其背景 bug（見 P3-6）。屬架構調整 → **只建議**。

### 🟠 P1-1　次要文字對比未達 WCAG AA（最普遍的可讀性問題）
- **類別**：對比 / 可讀性
- **位置（代表）**：`src/styles.css:11-12`（token 定義）；`src/terminal/ui/Panel.tsx:70`（面板標題）；`src/terminal/shell/Footer.tsx`、各頁表格欄位標頭、`src/terminal/pages/Login.tsx:133`（副標）
- **實測對比**：
  - `--color-term-muted #5c6678` on bg `#080b10` = **3.40:1** ❌（一般文字需 4.5）
  - 同色 on panel `#0e1420` = **3.18:1** ❌
  - `--color-term-subtle #3a4557` = **2.04:1** ❌（連大字 3:1 都不過）
  - 登入副標 `muted/60` = **1.91:1** ❌
- **說明**：muted/subtle 被大量用於面板標題、欄位標籤、表格標頭、頁尾、metadata。資料色（amber 9.18、cyan 10.9、rose 7.12）本身都 OK，問題只在這兩個灰階。
- **建議**：將 `--color-term-muted` 提到約 **`#7e8a9c`↑（≈4.5:1）**、`--color-term-subtle` 僅作為**邊框/分隔**用途、不再承載文字。屬全域 token 取捨 → **只建議**（避免半套修改）。

### 🟠 P1-2　主要操作按鈕顏色不一致（無單一主色）
- **類別**：一致性 / 資訊層級
- **位置**：`Login.tsx:258`（**琥珀**「INITIATE_HANDSHAKE」）、`Settings.tsx:77,144`（**sky/cyan**「Save / Contact Sales」）、Backtest「開始回測 RUN」（**violet**）、`Portfolio`「+ Add Position」（琥珀）
- **證據**：見 `screenshots/12-settings-desktop.png`（cyan 按鈕）vs `screenshots/07-backtest-desktop.png`（紫色 RUN）vs `screenshots/00-login-desktop.png`（琥珀）。
- **說明**：全站 accent 是琥珀，但 Settings 直接寫死 `bg-sky-500`、Backtest 用紫色，導致「主要動作」在不同頁面是三種顏色，弱化了主色的訊號性，也讓 Settings 像是另一套設計系統。
- **建議**：選定單一 primary（建議琥珀）並 token 化（如 `--color-term-primary`），cyan 保留給「資訊/中性」、紫色保留給「AI 特性」。屬設計取捨 → **只建議**。

### 🟠 P1-3 ✅　表單欄位缺 label 關聯與 autocomplete（已修）
- **類別**：無障礙
- **位置**：`Login.tsx`（Email/密碼/暱稱）、`Settings.tsx`（API Key）、`TopNav.tsx`（搜尋框，僅有 placeholder）
- **修正**：為 input 補 `id` 並讓 `<label htmlFor>` 關聯；搜尋框加 `type="search"` + `aria-label`；登入欄位加 `autoComplete`（email / current-password / new-password / name），改善密碼管理器與行動裝置自動填入。

### 🟠 P1-4 ✅　通知開關用 `<div onClick>`、鍵盤不可達（已修）
- **類別**：無障礙 / 互動回饋
- **位置**：`src/terminal/pages/Settings.tsx:175-186`
- **修正**：改為 `<button role="switch" aria-checked aria-label>` 並加 `focus-ring` → 可 Tab 聚焦、可 Space/Enter 切換、螢幕報讀器會正確播報為「開關（已開啟/已關閉）」。視覺完全不變（見 `screenshots/12-settings-desktop.png`）。

---

### 🟡 P2-1　導覽圖示不一致且語意不符
- **類別**：一致性 / 資訊層級
- **位置**：`src/terminal/shell/Sidebar.tsx:18-26` vs `src/terminal/shell/Layout.tsx:43-49`
- **說明**：同一目的地在兩個導覽用不同圖示，且側欄圖示語意誤導：

  | 目的地 | 側欄（Sidebar） | 底部導覽（Bottom nav） |
  |---|---|---|
  | dashboard | `Star`（像「收藏」） | `LayoutDashboard` ✅ |
  | market | `CalendarDays`（像「行事曆」） | `Globe` ✅ |
  | portfolio | `BarChart3` | `BarChart3` |

- **建議**：將側欄對齊底部導覽那組語意正確的圖示。屬圖示語彙取捨 → **只建議**（但信心高）。

### 🟡 P2-2　面板標題過小（10px）且低對比
- **類別**：可讀性 / 資訊層級
- **位置**：`src/terminal/ui/Panel.tsx:70`（`text-[10px] ... text-(--color-term-muted) uppercase`）
- **說明**：這是全站每個面板的標題樣式，10px + muted(3.2:1) + 全大寫 + 字距 0.28em，辨識成本偏高。
- **建議**：提到 11–12px、改用較高對比的灰，或保留 10px 但加粗/提高對比擇一。屬設計取捨 → **只建議**。

### 🟡 P2-3　以原生 `alert()/prompt()/confirm()` 做回饋與破壞性操作
- **類別**：互動回饋 / 一致性
- **位置**：`Settings.tsx:56,58,103,114,116`（存檔結果、改名）、`Dashboard.tsx:226`、`Portfolio.tsx:434`（刪除確認）
- **說明**：專案已有 `ToastProvider`（`src/contexts/ToastContext.tsx`，API：`toast(msg, type)`）與整套樣式，但這些地方仍用會打斷流程、無法套用主題的原生對話框。
- **建議**：成功/失敗改用 toast；破壞性操作改用自訂確認對話框。屬行為變更 → **只建議**。

### 🟡 P2-4　多頁缺少頁面層級 `<h1>`
- **類別**：資訊層級 / 無障礙
- **位置**：`Dashboard`、`Market`、`Crypto`、`Research`、`AutoTrading`（這些頁無自有 `<h*>`，僅靠 Panel 的 `<h2>`）
- **說明**：`Panel` 會輸出 `<h2>`（很好），但上述頁面沒有 `<h1>`，導致標題大綱「從 h2 開始、跳過 h1」。螢幕報讀器無法用標題快速定位頁面主題。
- **建議**：每個 view 補一個（可視或視覺隱藏的）`<h1>` 作為頁面標題。屬輕度結構調整 → **只建議**。

### 🟡 P2-5　Backtest 頁寫死繁中、未走 i18n，且用到未定義 CSS 變數
- **類別**：i18n 一致性 / 潛在視覺 bug
- **位置**：`src/terminal/pages/Backtest.tsx` → `src/components/BacktestPage.tsx` 及其子元件；`src/components/backtest/PriceForecastPanel.tsx`（用 `var(--md-primary)`、`var(--color-up/down)`、`var(--font-data)` 等**主題未定義**的變數）
- **說明**：見 `screenshots/07-backtest-desktop.png`——整頁幾乎全是寫死的繁體中文（回測引擎、初始資金…），切換到 English 時不會翻譯；其餘終端機頁面則走 i18n。`PriceForecastPanel` 的 `--md-*` 變數在現行主題不存在，回測結果圖的顏色會落到瀏覽器預設/失效值。
- **建議**：將該頁文案接入 i18n；把 `--md-*` 換成 `--color-term-*` token。屬較大重構 → **只建議**。

### 🟡 P2-6　搜尋自動完成未對輔助技術曝露（ARIA combobox）
- **類別**：無障礙
- **位置**：`src/terminal/shell/TopNav.tsx:214-321`
- **說明**：方向鍵選取、Enter 確認、Esc 關閉的鍵盤行為都做了（很好），但下拉沒有 `role="combobox/listbox/option"`、`aria-expanded`、`aria-activedescendant`，螢幕報讀器使用者得不到「有 N 筆結果、目前選到第幾筆」的訊息。
- **建議**：套用標準 ARIA combobox pattern。屬中等複雜度 → **只建議**。

---

### 🟢 P3-1　頂部導覽未選取分頁對比偏低
- `src/terminal/shell/TopNav.tsx:180`：`text-(--color-term-text)/50` 實測 **4.34:1**（11.5px 一般文字差一點點未達 4.5）。建議改 `/65`~`/70`。**只建議**。

### 🟢 P3-2 ✅　純裝飾低對比文字（已修）
- `Login.tsx:296-301` 的 `SYS:READY`/`v3.0.0`（1.43:1）及欄位裝飾性 icon → 已加 `aria-hidden="true"`，正確地從無障礙樹排除（裝飾性文字的對比不再構成問題；視覺上仍刻意作為極淡裝飾）。

### 🟢 P3-3　`<html lang>` 寫死且不隨語言切換更新
- `index.html:2`（`lang="zh-TW"`）；找不到任何 `documentElement.lang` 同步邏輯。切到 English 時語言標記仍是中文。建議在 i18n `languageChanged` 時更新 `document.documentElement.lang`。**只建議**。

### 🟢 P3-4　Settings 桌機右欄留白、版面略失衡
- `Settings.tsx:84`（`md:grid-cols-2`）：見 `screenshots/12-settings-desktop.png`，SUBSCRIPTION 下方右欄整片空白。可考慮把「AI & Integration」改為右欄延伸或調整佈局。**只建議**。

### 🟢 P3-5　行動裝置寬表格僅靠水平捲動、缺提示
- `Portfolio.tsx:326,540`、`Dashboard.tsx:174`、`Screener.tsx:479` 採 `overflow-x-auto`（含 `-mx-3 px-3 sm:mx-0` 邊到邊捲動，做得不錯）。但手機上使用者不一定知道可橫向捲（見 `screenshots/04-portfolio-mobile.png` 右緣裁切）。可加捲動陰影提示或在窄螢幕改卡片式。**只建議**。

### 🟢 P3-6　ErrorBoundary 與多個 legacy 元件使用未定義 CSS 變數（dead code）
- `ErrorBoundary.tsx:24` 用 `bg-[var(--card-bg)]`（主題未定義 → 透明卡片）；`components/SentimentPage.tsx`、`components/Simulator.tsx`、`components/Alerts.tsx` 亦同，且**未被任何地方 import**（dead code）。建議清除或修正；若採用 P0-1 的建議啟用 ErrorBoundary，務必先把背景改為 `--color-term-panel`。**只建議**。

### 🟢 P3-7 ✅　其他低風險小修（已修）
- AutoTrading 行動裝置遮罩 `<div onClick>` 補 `aria-hidden="true"`（與 Sidebar 遮罩一致）；`StrategyFlowBuilder.tsx:128` 註解 typo「Slider Slider」→「Slider」；Electron 視窗控制鈕（最小化/最大化/關閉）補 `aria-label` 與 SVG `aria-hidden`。

---

## 3.5　做得好的地方（保留）
- 幾乎全用語意化 `<button>`（全 `src/terminal` 只有 1 處 `<div onClick>`，且為 modal 遮罩）。
- `focus-ring`（focus-visible）一致套用；`motion-safe:` + `@media (prefers-reduced-motion)` 有處理。
- `Panel` 用 `<section>`+`<header>`+`<h2>`、collapsible 是真 `<button aria-expanded>`、裝飾元素 `aria-hidden`。
- `h-dvh`、`env(safe-area-inset-*)`、行動底部導覽有 `aria-label`。
- 良好的空狀態（「No positions yet」「Select a template…」）、登入送出有 `aria-busy` + loading spinner + disabled。
- 資料語意色（多/空/中性）對比充足且色彩編碼一致（見 Screener 篩選 chips）。

---

## 4. 「只建議、不動手」清單（設計取捨）
1. 全域 `--color-term-muted/subtle` 對比提升（P1-1）
2. 統一主要按鈕主色、token 化（P1-2）
3. 啟用並包覆 ErrorBoundary（P0-1）
4. 對齊側欄/底部導覽圖示語彙（P2-1）
5. 面板標題字級/對比（P2-2）
6. alert/prompt/confirm → toast / 自訂對話框（P2-3）
7. 補頁面 `<h1>`（P2-4）
8. Backtest i18n 化 + 修 `--md-*` 變數（P2-5）
9. 搜尋 ARIA combobox（P2-6）
10. 未選取分頁對比、`<html lang>` 同步、Settings 版面、行動表格提示、清除 dead code（P3 各項）

---

## 5. 已修改檔案（本次直接修正）
| 檔案 | 修正內容 |
|---|---|
| `src/terminal/pages/Login.tsx` | 三個 input 補 `id` + `<label htmlFor>` 關聯、`autoComplete`；欄位裝飾 icon 與角落裝飾文字加 `aria-hidden` |
| `src/terminal/pages/Settings.tsx` | 通知開關 `<div>`→`<button role="switch" aria-checked aria-label>` + `focus-ring`；API Key input/label 關聯 |
| `src/terminal/shell/TopNav.tsx` | 搜尋框 `type="search"` + `aria-label`；Electron 視窗鈕補 `aria-label` + SVG `aria-hidden` |
| `src/terminal/pages/AutoTrading.tsx` | 行動遮罩補 `aria-hidden="true"` |
| `src/components/AutoTrading/StrategyFlowBuilder.tsx` | 註解 typo「Slider Slider」→「Slider」 |

> 驗證：`role="switch"`/`aria-checked`、`label[for]`/`autocomplete` 等屬性以 Playwright 斷言確認存在；`VERCEL=1 npm run build` 通過（無新增錯誤；既有 6 個 TS 型別錯誤位於 `server/services/smartMoneyConfig.ts`、`CongressTradesPanel.tsx`，與本次修改無關、修改前即存在）。

---

## 6. 附錄：對比量測（WCAG 2.1）

| 前景 / 背景 | 對比 | AA 一般 | AA 大字 |
|---|---|---|---|
| text `#dde2e8` / bg `#080b10` | 15.12 | ✅ | ✅ |
| muted `#5c6678` / bg | 3.40 | ❌ | ✅ |
| muted / panel `#0e1420` | 3.18 | ❌ | ✅ |
| subtle `#3a4557` / bg | 2.04 | ❌ | ❌ |
| muted/60（登入副標）/ panel | 1.91 | ❌ | ❌ |
| text/50（未選取分頁）/ header | 4.34 | ❌ | ✅ |
| accent `#f59e0b` / bg | 9.18 | ✅ | ✅ |
| cyan `#22d3ee` / bg | 10.90 | ✅ | ✅ |
| rose `#f87171` / bg | 7.12 | ✅ | ✅ |

審計斷點：桌機 1440×900、手機 390×844。截圖於 `docs/ux-audit/screenshots/`。
