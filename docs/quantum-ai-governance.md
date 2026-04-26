# Quantum & AI Model Governance

## 能力邊界

| 層級 | 元件 | 允許 | 不允許 |
|------|------|------|--------|
| **量子訊號** | `quantumPolicy.ts` | 修改 confidence、leverageMultiplier、強制 HOLD | 直接發 BUY/SELL 指令、繞過 RiskManager |
| **AI/LLM 決策** | `autonomousAgent.ts` | 提供 action + reasoning | 執行下單、修改 RiskConfig |
| **訊號融合** | `signalFusionService.ts` | 加權平均多來源訊號 | 覆寫風控結果 |
| **Python 科學服務** | `science_skills_service.py` | 計算特徵、模型推論 | 持久化訂單、訪問 API Key |

## 模型風險開關

由 `RiskManager.updateModelRisk()` 控制，Config 存於 `autotradingDefaults.ts`：

```typescript
DEFAULT_MODEL_RISK_CONFIG = {
  quantumEnabled: false,          // 預設關閉
  aiEnabled: true,
  dataFreshnessThresholdMs: 300000, // 5 min
  maxModelDriftPct: 0.30,
  rolloutStage: 'paper',
  rollbackDrawdownDays: 3,
  maxDrawdownForRollback: 0.05,
}
```

各開關可在 runtime 透過 `riskManager.updateModelRisk({ quantumEnabled: true })` 動態切換，**不需要重啟服務**。

## Rollout 流程

```
paper trading → sandbox_live (最小部位) → full_live
```

| Stage | 說明 | 升級條件 |
|-------|------|----------|
| `paper` | 模擬撮合，不觸碰真實資金 | OOS Sharpe ≥ +10% vs baseline，連續 2 週 |
| `sandbox_live` | 真實下單，部位上限 10% | MDD ≤ baseline + 2%，連續 4 週 |
| `full_live` | 正常部位 | 持續監控 KPI |

升級由人工觸發：`riskManager.setRolloutStage('sandbox_live')`。

## 回滾條件

- 連續 `rollbackDrawdownDays`（預設 3）日 drawdown 超過 `maxDrawdownForRollback`（預設 5%）
- 觸發後 RiskManager 記錄警告日誌（不自動降 stage，需人工確認）
- 人工回滾：`riskManager.setRolloutStage('paper')`

## 責任分工

| 事件 | 負責元件 | 記錄位置 |
|------|----------|----------|
| 訂單被風控攔截 | `RiskManager.validateOrder` | AgentLog (RISK_CHK) |
| 量子 gate 觸發 | `quantumPolicy.applyQuantumPolicy` | AgentLog (MONITOR) |
| 模型資料過期 | `RiskManager.checkModelRisk` | AgentLog (WARNING) |
| 連續回撤警告 | `RiskManager.recordDailyDrawdown` | console.warn + AgentLog |
| 決策可追蹤 | `featureSnapshotRepo` + `attributionService` | in-memory snapshot |

## 架構約束（不可違反）

1. `Step()` 純函數：回測與實單使用同構邏輯，禁止 `isBacktest` 分支。
2. Python 服務故障不阻塞主交易迴圈（永遠可 fallback 至 technical only）。
3. API Key 僅在 agent 端持有，Python 服務只收特徵向量。
4. 所有新模型輸出必須先通過 `RiskManager.checkModelRisk()` 才可進入融合層。
