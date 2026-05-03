/**
 * server/services/RiskManager.ts
 * 風險管理器 — 支援完整的多層風控規則
 *
 * 規則層級：
 *  1. 單筆最大部位上限
 *  2. 每日最大損失上限（Kill Switch）
 *  3. 總預算使用率上限
 *  4. 個股最大停損比例
 *  5. 最大槓桿倍數
 */

import { DEFAULT_RISK_CONFIG as SHARED_DEFAULTS, DEFAULT_MODEL_RISK_CONFIG } from './autotradingDefaults.js';

export type RolloutStage = 'paper' | 'sandbox_live' | 'full_live';

export interface ModelRiskConfig {
  quantumEnabled: boolean;
  aiEnabled: boolean;
  /** Reject model output if data is older than this (ms) */
  dataFreshnessThresholdMs: number;
  /** Trigger model circuit-breaker if drift > this fraction */
  maxModelDriftPct: number;
  /** Current rollout stage */
  rolloutStage: RolloutStage;
  /** Consecutive drawdown-exceeded days before rollback */
  rollbackDrawdownDays: number;
  /** Max drawdown fraction allowed per rollout stage */
  maxDrawdownForRollback: number;
}

export interface OrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
}

export interface RiskConfig {
  budgetLimitTWD: number;       // 總預算上限（台幣）
  maxDailyLossTWD: number;      // 單日最大虧損（台幣）
  maxSinglePositionTWD: number; // 單筆最大部位（台幣）
  maxPositionPct: number;       // 最大部位佔總資金比例（0~1）
  stopLossPct: number;          // 個股停損比例（0~1, 例如 0.05 = 5%）
}

export const DEFAULT_RISK_CONFIG: RiskConfig = { ...SHARED_DEFAULTS };

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  level?: 'WARNING' | 'BLOCK' | 'KILL';
}

export interface MonteCarloRiskSnapshot {
  paths: number;
  horizonSteps: number;
  ruinProbability: number;
  valueAtRisk95Pct: number;
  expectedMaxDrawdownPct: number;
  ruinThresholdTWD: number;
  lastUpdated: string;
}

class RiskManager {
  private config: RiskConfig = { ...DEFAULT_RISK_CONFIG };
  private modelRisk: ModelRiskConfig = { ...DEFAULT_MODEL_RISK_CONFIG };
  private currentDailyLoss = 0;
  private currentDailyTrade = 0;
  private killSwitchActive = false;
  private totalUsed = 0;
  private consecutiveDrawdownDays = 0;
  private monteCarlo: MonteCarloRiskSnapshot = {
    paths: 1000,
    horizonSteps: 30,
    ruinProbability: 0,
    valueAtRisk95Pct: 0,
    expectedMaxDrawdownPct: 0,
    ruinThresholdTWD: 0,
    lastUpdated: new Date(0).toISOString(),
  };

  updateConfig(cfg: Partial<RiskConfig>) {
    this.config = { ...this.config, ...cfg };
  }

  getConfig(): RiskConfig { return { ...this.config }; }

  activateKillSwitch() {
    this.killSwitchActive = true;
    console.warn('[RiskManager] ⚠️ KILL SWITCH ACTIVATED — 所有自動交易已暫停');
  }

  deactivateKillSwitch() {
    this.killSwitchActive = false;
    console.log('[RiskManager] Kill Switch 已解除');
  }

  isKillSwitchActive(): boolean { return this.killSwitchActive; }

  /**
   * 依據 Monte Carlo 破產機率計算動態倉位縮放比例
   * 如果機率 >= 10%，則完全阻擋下單 (回傳 0)
   * 如果機率 >= 5%，則倉位減半 (回傳 0.5)
   * 如果機率 >= 3%，則倉位減少 20% (回傳 0.8)
   */
  getDynamicPositionScaling(): number {
    const ruin = this.monteCarlo.ruinProbability;
    if (ruin >= 0.1) return 0;
    if (ruin >= 0.05) return 0.5;
    if (ruin >= 0.03) return 0.8;
    return 1;
  }

  resetDaily() {
    this.currentDailyLoss = 0;
    this.currentDailyTrade = 0;
  }

  restoreDailyState(state: { dailyLoss?: number; killSwitchActive?: boolean }) {
    if (state.dailyLoss !== undefined) this.currentDailyLoss = state.dailyLoss;
    if (state.killSwitchActive) this.killSwitchActive = true;
  }

  recordPnl(pnl: number) {
    if (pnl < 0) {
      this.currentDailyLoss += Math.abs(pnl);
      if (this.currentDailyLoss >= this.config.maxDailyLossTWD) {
        this.activateKillSwitch();
      }
    }
  }

checkMaintenanceMargin(
      positions: Array<{ symbol: string; qty: number; avgCost: number; currentPrice?: number }>,
      totalAssets: number,
    ): { symbol: string; shortfallTwd: number; shortfallPct: number; autoReduceContracts: number }[] {
      const INITIAL_MARGIN_PCT    = 0.10;
      const MAINT_MARGIN_PCT      = 0.07;
      const AUTO_REDUCE_THRESHOLD = 0.50;
      const alerts: { symbol: string; shortfallTwd: number; shortfallPct: number; autoReduceContracts: number }[] = [];
      for (const pos of positions) {
        const isFutures = pos.symbol.startsWith('TX') || pos.symbol.endsWith('.F');
        if (!isFutures || pos.qty <= 0) continue;
        const price         = pos.currentPrice ?? pos.avgCost;
        const contractValue = price * pos.qty;
        const maintRequired = contractValue * MAINT_MARGIN_PCT;
        const marginUsed    = contractValue * INITIAL_MARGIN_PCT;
        const available     = totalAssets - marginUsed;
        const shortfall     = maintRequired - available;
        if (shortfall <= 0) continue;
        const shortfallPct = (shortfall / maintRequired) * 100;
        let autoReduceContracts = 0;
        if (shortfallPct > AUTO_REDUCE_THRESHOLD * 100) {
          const marginPerContract = price * INITIAL_MARGIN_PCT;
          autoReduceContracts = marginPerContract > 0
            ? Math.min(Math.ceil(shortfall / marginPerContract), pos.qty) : 0;
        }
        alerts.push({ symbol: pos.symbol, shortfallTwd: shortfall, shortfallPct, autoReduceContracts });
      }
      return alerts;
    }
  
    validateOrder(order: OrderRequest, totalAssets: number): RiskCheckResult {
    if (this.killSwitchActive) {
      return { allowed: false, reason: '緊急停機開關已啟動，所有交易已暫停', level: 'KILL' };
    }

    const orderValue = order.quantity * order.price;

    // 1. 單筆上限
    if (orderValue > this.config.maxSinglePositionTWD) {
      return {
        allowed: false,
        reason: `單筆部位 ${orderValue.toLocaleString()} TWD 超過上限 ${this.config.maxSinglePositionTWD.toLocaleString()} TWD`,
        level: 'BLOCK',
      };
    }

    // 1.5 期貨保證金驗證 (Futures Margin Validation)
    const isFutures = order.symbol.startsWith('TX') || order.symbol.endsWith('.F');
    if (isFutures) {
      const initialMargin = order.price * order.quantity * 0.1; // 假設 10% 初始保證金
      if (initialMargin > totalAssets) {
        return {
          allowed: false,
          reason: `期貨初始保證金不足: 需要 ${initialMargin.toLocaleString()} TWD，目前權益 ${totalAssets.toLocaleString()} TWD`,
          level: 'BLOCK',
        };
      }
    }

    // 2. 佔比上限
    if (totalAssets > 0 && orderValue / totalAssets > this.config.maxPositionPct) {
      return {
        allowed: false,
        reason: `單筆部位佔比 ${((orderValue / totalAssets) * 100).toFixed(1)}% 超過上限 ${(this.config.maxPositionPct * 100).toFixed(0)}%`,
        level: 'BLOCK',
      };
    }

    // 3. 每日損失預警
    if (this.currentDailyLoss > this.config.maxDailyLossTWD * 0.8) {
      return {
        allowed: true,
        reason: `⚠️ 今日損失已達上限 80%（${this.currentDailyLoss.toLocaleString()} / ${this.config.maxDailyLossTWD.toLocaleString()} TWD）`,
        level: 'WARNING',
      };
    }

    // 4. 總預算上限
    if (this.totalUsed + orderValue > this.config.budgetLimitTWD) {
      return {
        allowed: false,
        reason: `超過總預算上限 ${this.config.budgetLimitTWD.toLocaleString()} TWD`,
        level: 'BLOCK',
      };
    }

    return { allowed: true };
  }

  recordTrade(orderValue: number) {
    this.totalUsed += orderValue;
    this.currentDailyTrade += orderValue;
  }

  // ── Model Risk Controls ────────────────────────────────────────────────────

  updateModelRisk(cfg: Partial<ModelRiskConfig>) {
    this.modelRisk = { ...this.modelRisk, ...cfg };
  }

  getModelRisk(): ModelRiskConfig { return { ...this.modelRisk }; }

  setRolloutStage(stage: RolloutStage) {
    this.modelRisk.rolloutStage = stage;
    console.log(`[RiskManager] Rollout stage → ${stage}`);
  }

  getRolloutStage(): RolloutStage { return this.modelRisk.rolloutStage; }

  /**
   * Check model output validity: data freshness + drift detection.
   * Returns BLOCK if model should be bypassed (caller falls back to technical only).
   */
  checkModelRisk(input: {
    modelType: 'quantum' | 'ai';
    dataAgeMs: number;
    driftPct?: number;
    hasError?: boolean;
  }): RiskCheckResult {
    if (input.modelType === 'quantum' && !this.modelRisk.quantumEnabled) {
      return { allowed: false, reason: 'Quantum model disabled via switch', level: 'BLOCK' };
    }
    if (input.modelType === 'ai' && !this.modelRisk.aiEnabled) {
      return { allowed: false, reason: 'AI model disabled via switch', level: 'BLOCK' };
    }
    if (input.hasError) {
      return { allowed: false, reason: `${input.modelType} model returned error`, level: 'BLOCK' };
    }
    if (input.dataAgeMs > this.modelRisk.dataFreshnessThresholdMs) {
      return {
        allowed: false,
        reason: `${input.modelType} data stale: ${Math.round(input.dataAgeMs / 1000)}s > ${Math.round(this.modelRisk.dataFreshnessThresholdMs / 1000)}s`,
        level: 'BLOCK',
      };
    }
    if (input.driftPct !== undefined && input.driftPct > this.modelRisk.maxModelDriftPct) {
      return {
        allowed: false,
        reason: `${input.modelType} model drift ${(input.driftPct * 100).toFixed(1)}% exceeds limit`,
        level: 'BLOCK',
      };
    }
    return { allowed: true };
  }

  /**
   * Record end-of-day drawdown result.
   * Triggers rollback warning if consecutive days exceed threshold.
   */
  recordDailyDrawdown(drawdownPct: number): void {
    if (drawdownPct > this.modelRisk.maxDrawdownForRollback) {
      this.consecutiveDrawdownDays++;
      if (this.consecutiveDrawdownDays >= this.modelRisk.rollbackDrawdownDays) {
        console.warn(
          `[RiskManager] ⚠️ Rollback condition met: ${this.consecutiveDrawdownDays} consecutive days exceeded drawdown limit. Current stage: ${this.modelRisk.rolloutStage}`,
        );
      }
    } else {
      this.consecutiveDrawdownDays = 0;
    }
  }

  getConsecutiveDrawdownDays(): number { return this.consecutiveDrawdownDays; }

  runMonteCarloRuinAssessment(input: {
    capitalTWD: number;
    paths?: number;
    horizonSteps?: number;
    driftPerStep?: number;
    volatilityPerStep?: number;
    ruinThresholdTWD?: number;
  }): MonteCarloRiskSnapshot {
    const paths = Math.max(100, Math.floor(input.paths ?? 1000));
    const horizonSteps = Math.max(10, Math.floor(input.horizonSteps ?? 30));
    const capital = Math.max(1, Number(input.capitalTWD || 0));
    const drift = Number.isFinite(input.driftPerStep) ? Number(input.driftPerStep) : 0;
    const vol = Math.max(0.0001, Number.isFinite(input.volatilityPerStep) ? Number(input.volatilityPerStep) : 0.012);
    const ruinThreshold = Math.max(1, Number(input.ruinThresholdTWD || capital * 0.65));

    let ruinCount = 0;
    const terminalReturns: number[] = [];
    let maxDrawdownAccum = 0;

    const sampleNormal = () => {
      const u1 = Math.max(Number.EPSILON, Math.random());
      const u2 = Math.random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    for (let i = 0; i < paths; i++) {
      let equity = capital;
      let peak = capital;
      let pathMaxDd = 0;
      let ruined = false;

      for (let step = 0; step < horizonSteps; step++) {
        const stepRet = drift + vol * sampleNormal();
        equity = Math.max(1, equity * (1 + stepRet));
        if (equity > peak) peak = equity;
        const dd = (peak - equity) / Math.max(peak, 1);
        if (dd > pathMaxDd) pathMaxDd = dd;
        if (equity <= ruinThreshold) {
          ruined = true;
          break;
        }
      }

      if (ruined) ruinCount += 1;
      terminalReturns.push((equity - capital) / capital);
      maxDrawdownAccum += pathMaxDd;
    }

    terminalReturns.sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(terminalReturns.length - 1, Math.floor(0.05 * terminalReturns.length)));
    const var95 = Math.max(0, -terminalReturns[idx] * 100);
    const ruinProbability = ruinCount / paths;
    const expectedMaxDrawdownPct = (maxDrawdownAccum / paths) * 100;

    this.monteCarlo = {
      paths,
      horizonSteps,
      ruinProbability: Number(ruinProbability.toFixed(4)),
      valueAtRisk95Pct: Number(var95.toFixed(2)),
      expectedMaxDrawdownPct: Number(expectedMaxDrawdownPct.toFixed(2)),
      ruinThresholdTWD: Number(ruinThreshold.toFixed(2)),
      lastUpdated: new Date().toISOString(),
    };

    return { ...this.monteCarlo };
  }

  getStats() {
    return {
      dailyLoss: this.currentDailyLoss,
      dailyTrade: this.currentDailyTrade,
      totalUsed: this.totalUsed,
      killSwitchActive: this.killSwitchActive,
      config: this.config,
      modelRisk: this.modelRisk,
      consecutiveDrawdownDays: this.consecutiveDrawdownDays,
      monteCarlo: this.monteCarlo,
    };
  }
}

export const riskManager = new RiskManager();
