# Quantum + AI Agent + Data Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破壞既有交易核心約束（同構 `Step()`、無 `isBacktest` 分支、`saas/agent/lab` 分層）的前提下，將「量子計算訊號 + AI Agent + 跨模組資料分析」落地為可灰度發布的能力。

**Architecture:** 使用「雙層決策」：第一層維持既有策略與風控，第二層加入量子/科學模型分數作為 gating 與排序，不直接越權下單。計算密集工作放入 Python 科學服務（`server/python`），Node 服務負責編排、快取、審計與 API。

**Tech Stack:** TypeScript (Node/Express), React, FastAPI/Python, Polars, TimesFM, Qiskit/PennyLane (先模擬器), Postgres, Redis cache, Ably realtime

---

## Source Digest (scientific-agent-skills 對應)

1. Quantum toolchain: `qiskit`, `pennylane`, `cirq`, `qutip`
2. Time-series foundation model: `timesfm`
3. 高效資料處理: `polars` / `dask`
4. 資料整合入口: `database-lookup` / `paper-lookup`（研究與證據補強）
5. 安全建議：僅安裝需要的 skills，逐一審核 `SKILL.md`

---

## Current Project Baseline (已存在，可直接升級)

- `server/utils/scienceService.ts`: 已有 `arxiv/search`、`web/scrape`、`polars/backtest`、`timesfm/predict` client
- `server/python/science_skills_service.py`: 已有 FastAPI 骨架，但 `timesfm/predict` 仍是 stub
- `server/services/backtestEngine.ts`: 已有本地版回測與 Polars 委派入口
- `server/services/autonomousAgent.ts`: 已有多策略 + LLM 決策 + 風控 + 深度研究呼叫點
- `docs/SystemDesign.md` / `docs/AGENTS.md` / `docs/evo.md`: 已定義 `Step()` 純函數與 `saas/agent/lab` 邊界

---

### Task 3: 量子訊號策略（Quantum as Meta-Signal）

**Files:**
- Create: `server/services/quantum/quantumFeatureEncoder.ts`
- Create: `server/services/quantum/quantumPolicy.ts`
- Create: `server/services/quantum/__tests__/quantumPolicy.test.ts`

- [ ] 定義量子訊號角色：只做「排序/過濾/信心修正」，不直接發 BUY/SELL 指令
- [ ] 設計三種輸出：`momentum_phase`, `regime_flip_prob`, `uncertainty_penalty`
- [ ] 融入風控：高不確定度時自動降槓桿或轉為 HOLD
- [ ] 記錄每筆決策的「量子前/量子後」差異，供回測審計

**Acceptance:**
- 任何量子異常不會繞過 RiskManager
- 可在日誌/報表看見量子分數對最終決策的影響

---

### Task 4: 數據分析與跨功能整合（Other Features）

**Files:**
- Create: `server/services/analytics/featureStoreService.ts`
- Create: `server/services/analytics/attributionService.ts`
- Create: `server/repositories/featureSnapshotRepo.ts`
- Modify: `server/repositories/tradesRepo.ts`
- Modify: `server/repositories/portfolioHistoryRepo.ts`

- [ ] 建立 feature snapshot（下單前特徵快照）
- [ ] 建立 decision attribution（哪個訊號主導這筆交易）
- [ ] 打通 AutoTrading / Backtest / Screener 可共享的特徵欄位
- [ ] 支援「產業/類股」聚合指標，提供策略篩選前置條件

**Acceptance:**
- 每筆交易可回溯：輸入特徵、融合分數、下單理由、風控結果
- Screener 可讀取同一份 sector-level features，不再各自計算

---

### Task 5: Backtest & Lab 深化（GA + 新訊號共演）

**Files:**
- Modify: `server/services/backtestEngine.ts`
- Modify: `server/services/optimizerService.ts`
- Create: `server/services/evaluation/walkForwardService.ts`
- Create: `server/services/evaluation/ablationService.ts`

- [ ] 新增 walk-forward + regime split（牛/熊/震盪）評估
- [ ] 新增 ablation（技術指標 only vs +AI vs +AI+Quantum）
- [ ] 優化器評分函數納入風險懲罰（MDD、turnover、滑價敏感度）
- [ ] 產出可比較報表，決定是否 promote 進 live 設定

**Acceptance:**
- 每次優化任務都附帶 ablation 報告
- 只有通過風險門檻的設定可進入候選清單

---

### Task 6: 前端可理解性與操作閉環

**Files:**
- Modify: `src/components/AutoTrading/DecisionLog.tsx`
- Modify: `src/components/AutoTrading/PerformanceDashboard.tsx`
- Modify: `src/components/AutoTrading/OptimizationPanel.tsx`
- Create: `src/components/AutoTrading/SignalAttributionPanel.tsx`

- [ ] 顯示「訊號來源分解」（technical/ai/quantum/macro）
- [ ] 顯示「離線降級狀態」（模型 unavailable 時使用 fallback）
- [ ] 在回測報表加入 ablation 視圖與 regime 表現
- [ ] i18n：新加文字全部進中/英翻譯檔

**Acceptance:**
- 使用者可直接看懂每筆決策來自哪些訊號
- 當前是高階模型或 fallback 模式一眼可見

---

### Task 7: 風控、治理與發佈策略

**Files:**
- Modify: `server/services/RiskManager.ts`
- Modify: `server/services/autotradingDefaults.ts`
- Create: `docs/quantum-ai-governance.md`

- [ ] 新增模型風險開關（模型漂移、異常波動、資料新鮮度不足）
- [ ] 建立 rollout 機制：paper → sandbox live(min size) → full live
- [ ] 建立回滾條件：連續 N 日超標回撤/偏離基準
- [ ] 文件化 AI/量子能力邊界與責任分工

**Acceptance:**
- 任一新模型都可獨立開關、灰度、回滾
- 風險事件可追蹤到版本與參數

---

## KPI / Milestones

1. **M1 (2 週):** TimesFM + Feature Aggregate 可用，且不影響現有交易流程
2. **M2 (4 週):** Quantum meta-signal 上線至回測與 paper trading
3. **M3 (6 週):** Ablation + Walk-forward 報表完整，可支援 promote 決策
4. **M4 (8 週):** 小流量 live 灰度，達成預設風控 KPI 才擴大

**推薦 KPI:**
- 回測 OOS Sharpe 提升 >= 10%
- Max Drawdown 不高於基線 +2%
- 決策可解釋覆蓋率 100%
- 服務降級可用性 >= 99.5%

---

## Risk Notes

- 量子模型短期不一定提升報酬，應先定位成「不確定度估計器」
- TimesFM/外部模型可能有載入成本，必須做 warm-up + cache
- 不可讓 Python 端故障阻塞主交易迴圈（永遠可 fallback）
- 嚴守 `docs/SystemDesign.md` 約束：`Step()` 純函數、回測/實單同構、API Key 僅在 agent 端

