/**
 * server/services/autotradingDefaults.ts
 * 自動交易系統的「單一事實來源」(single source of truth)。
 *
 * 任何模組在沒有使用者覆寫設定時，都應從此處讀取預設值，
 * 避免散落在 UI / autonomousAgent / RiskManager 各處的魔術數字不同步。
 */

import type { AgentConfig, StrategyParams } from '../../src/components/AutoTrading/types.js';

export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  RSI_REVERSION: { period: 14, overbought: 70, oversold: 30, weight: 0.2 },
  BOLLINGER_BREAKOUT: { period: 20, stdDev: 2, weight: 0.2 },
  MACD_CROSS: { fast: 12, slow: 26, signal: 9, weight: 0.2 },
  AI_LLM: { confidenceThreshold: 65, weight: 0.6 },
  TIMESFM_FORECAST: { horizonTicks: 8, minEdgePct: 0.2, weight: 0.35 },
  stopLossPct: 5.0,
  takeProfitPct: 15.0,
  trailingStopPct: 3.0,
  maxAllocationPerTrade: 0.1,
  enableMTF: true,
};

export const DEFAULT_CIRCUIT_BREAKER = {
  enabled: true,
  maxLossStreak: 3,
  maxDailyLossPct: 2.0,
  cooldownMinutes: 60,
};

/** 台股盤中時段（台北時間 24h 制），可被使用者覆寫 */
export const DEFAULT_TRADING_HOURS = { start: '09:00', end: '13:30' };

export const DEFAULT_BUDGET_LIMIT_TWD = 10_000_000;
export const DEFAULT_MAX_DAILY_LOSS_TWD = 200_000;
export const DEFAULT_MAX_SINGLE_POSITION_TWD = 500_000;
export const DEFAULT_MAX_POSITION_PCT = 0.3;
export const DEFAULT_STOP_LOSS_PCT = 0.05;
export const DEFAULT_TICK_INTERVAL_MS = 60_000;

export const DEFAULT_SYMBOLS: string[] = ['2330.TW', '2317.TW'];

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  mode: 'simulated',
  strategies: ['AI_LLM'],
  params: DEFAULT_STRATEGY_PARAMS,
  symbols: DEFAULT_SYMBOLS,
  circuitBreaker: DEFAULT_CIRCUIT_BREAKER,
  tradingHours: DEFAULT_TRADING_HOURS,
  tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
  budgetLimitTWD: DEFAULT_BUDGET_LIMIT_TWD,
  maxDailyLossTWD: DEFAULT_MAX_DAILY_LOSS_TWD,
};

export const DEFAULT_RISK_CONFIG = {
  budgetLimitTWD: DEFAULT_BUDGET_LIMIT_TWD,
  maxDailyLossTWD: DEFAULT_MAX_DAILY_LOSS_TWD,
  maxSinglePositionTWD: DEFAULT_MAX_SINGLE_POSITION_TWD,
  maxPositionPct: DEFAULT_MAX_POSITION_PCT,
  stopLossPct: DEFAULT_STOP_LOSS_PCT,
};

export const DEFAULT_MODEL_RISK_CONFIG = {
  quantumEnabled: false,         // 預設關閉，透過 ENABLE_QUANTUM_SIGNAL env 控制
  aiEnabled: true,
  dataFreshnessThresholdMs: 5 * 60 * 1000, // 5 分鐘
  maxModelDriftPct: 0.3,         // 模型輸出漂移超過 30% 則 fallback
  rolloutStage: 'paper' as const,
  rollbackDrawdownDays: 3,       // 連續 3 日超標回撤則觸發警告
  maxDrawdownForRollback: 0.05,  // 5% 為回滾門檻
};
