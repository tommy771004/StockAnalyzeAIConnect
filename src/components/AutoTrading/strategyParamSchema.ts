import type { BacktestStrategyId } from '../../utils/backtest';
import type { StrategyParams, StrategyType } from './types';

export type StrategyParamFieldType = 'number' | 'range';

export interface StrategyParamFieldSchema {
  path: string;
  label: string;
  labelKey?: string;
  type: StrategyParamFieldType;
  step?: number;
  min?: number;
  max?: number;
  defaultValue: number;
  unit?: string;
  fullWidth?: boolean;
}

export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  RSI_REVERSION: { period: 14, overbought: 70, oversold: 30, weight: 0.25 },
  BOLLINGER_BREAKOUT: { period: 20, stdDev: 2, weight: 0.25 },
  MACD_CROSS: { fast: 12, slow: 26, signal: 9, weight: 0.25 },
  AI_LLM: { confidenceThreshold: 65, weight: 0.25 },
  TIMESFM_FORECAST: { horizonTicks: 8, minEdgePct: 0.2, weight: 0.35 },
  INST_FLOW: { weight: 0.5 },
  stopLossPct: 5,
  takeProfitPct: 10,
  trailingStopPct: 3,
  maxAllocationPerTrade: 100000,
  enableMTF: false,
  sizingMethod: 'fixed',
  riskPerTradePct: 1.0,
  maxPositionPct: 20,
  mtfTimeframe: '1h',
  mtfTrendIndicator: 'EMA200',
  enableReasoning: true,
};

export const STRATEGY_PARAM_SCHEMA: Record<StrategyType, StrategyParamFieldSchema[]> = {
  RSI_REVERSION: [
    { path: 'RSI_REVERSION.period', label: 'Period', labelKey: 'autotrading.strategy.params.period', type: 'number', step: 1, min: 2, max: 200, defaultValue: 14 },
    { path: 'RSI_REVERSION.oversold', label: 'Oversold', labelKey: 'autotrading.strategy.params.oversold', type: 'number', step: 1, min: 1, max: 50, defaultValue: 30 },
    { path: 'RSI_REVERSION.overbought', label: 'Overbought', labelKey: 'autotrading.strategy.params.overbought', type: 'number', step: 1, min: 50, max: 99, defaultValue: 70 },
  ],
  BOLLINGER_BREAKOUT: [
    { path: 'BOLLINGER_BREAKOUT.period', label: 'Period', labelKey: 'autotrading.strategy.params.period', type: 'number', step: 1, min: 2, max: 200, defaultValue: 20 },
    { path: 'BOLLINGER_BREAKOUT.stdDev', label: 'StdDev', labelKey: 'autotrading.strategy.params.stdDev', type: 'number', step: 0.1, min: 0.5, max: 5, defaultValue: 2 },
  ],
  MACD_CROSS: [
    { path: 'MACD_CROSS.fast', label: 'Fast', labelKey: 'autotrading.strategy.params.fast', type: 'number', step: 1, min: 2, max: 80, defaultValue: 12 },
    { path: 'MACD_CROSS.slow', label: 'Slow', labelKey: 'autotrading.strategy.params.slow', type: 'number', step: 1, min: 4, max: 200, defaultValue: 26 },
    { path: 'MACD_CROSS.signal', label: 'Signal', labelKey: 'autotrading.strategy.params.signal', type: 'number', step: 1, min: 2, max: 60, defaultValue: 9 },
  ],
  AI_LLM: [
    { path: 'AI_LLM.confidenceThreshold', label: 'Min Confidence Threshold', labelKey: 'autotrading.strategy.params.minConfidenceThreshold', type: 'range', step: 1, min: 50, max: 95, defaultValue: 65, fullWidth: true, unit: '%' },
  ],
};

export const RISK_EXIT_PARAM_SCHEMA: StrategyParamFieldSchema[] = [
  { path: 'stopLossPct', label: 'Stop Loss', labelKey: 'autotrading.strategy.params.stopLoss', type: 'number', step: 0.1, min: 0.1, max: 50, defaultValue: 5, unit: '%' },
  { path: 'takeProfitPct', label: 'Take Profit', labelKey: 'autotrading.strategy.params.takeProfit', type: 'number', step: 0.1, min: 0.1, max: 100, defaultValue: 10, unit: '%' },
  { path: 'trailingStopPct', label: 'Trailing Stop', labelKey: 'autotrading.strategy.params.trailingStop', type: 'number', step: 0.1, min: 0.1, max: 50, defaultValue: 3, unit: '%' },
];

const BACKTEST_TO_STRATEGY: Record<BacktestStrategyId, StrategyType> = {
  ma_crossover: 'BOLLINGER_BREAKOUT',
  neural: 'AI_LLM',
  rsi: 'RSI_REVERSION',
  macd: 'MACD_CROSS',
};

export function mapBacktestStrategyToStrategyType(strategy: BacktestStrategyId): StrategyType {
  return BACKTEST_TO_STRATEGY[strategy];
}

export function getStrategyParamValue(
  params: StrategyParams,
  path: string,
  defaultValue: number,
): number {
  const parts = path.split('.');
  let cursor: unknown = params;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) {
      return defaultValue;
    }
    cursor = (cursor as Record<string, unknown>)[part];
  }
  const n = Number(cursor);
  return Number.isFinite(n) ? n : defaultValue;
}

export function setStrategyParamValue(
  params: StrategyParams,
  path: string,
  value: number,
): StrategyParams {
  const next: StrategyParams = { ...params };
  const parts = path.split('.');
  if (parts.length === 1) {
    (next as Record<string, unknown>)[parts[0]] = value;
    return next;
  }
  const root = parts[0];
  const leaf = parts[1];
  const parent = { ...((next as Record<string, unknown>)[root] as Record<string, unknown> | undefined) };
  parent[leaf] = value;
  (next as Record<string, unknown>)[root] = parent;
  return next;
}
