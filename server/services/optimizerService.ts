/**
 * server/services/optimizerService.ts
 * 策略自動優化器：透過參數變異與回測尋找最優配置
 */
import { runBacktestWithBestEngine, riskAdjustedScore, deflatedRiskAdjustedScore } from './backtestEngine.js';
import { getAgentConfig } from './autonomousAgent.js';

interface OptimizationProposal {
  originalParams: any;
  betterParams: any;
  improvementPct: number;
  riskAdjustedScore: number;     // 多重測試校正後（Deflated）— 決策用
  rawRiskAdjustedScore: number;  // 未校正原始分數 — 透明揭露過擬合稅
  trials: number;                // 試驗組數（含基準）
  reason: string;
}


/** ±scale 隨機微調一個數值，保持在 [min, max] 內。 */
function jitter(v: number, scale: number, min: number, max: number): number {
  return Number(Math.min(max, Math.max(min, v * (1 - scale / 2 + Math.random() * scale))).toFixed(1));
}

/** 隨機選一個整數步進方向並限制範圍。 */
function jitterInt(v: number, step: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v + (Math.random() > 0.5 ? step : -step)));
}

/**
 * 產生變異參數：涵蓋所有策略與風控欄位
 */
function mutateParams(params: any) {
  const next = JSON.parse(JSON.stringify(params));

  if (next.RSI_REVERSION) {
    next.RSI_REVERSION.period   = jitterInt(next.RSI_REVERSION.period ?? 14, 1, 5, 30);
    next.RSI_REVERSION.oversold  = jitterInt(next.RSI_REVERSION.oversold ?? 30, 2, 15, 45);
    next.RSI_REVERSION.overbought = jitterInt(next.RSI_REVERSION.overbought ?? 70, 2, 55, 85);
  }

  if (next.MACD_CROSS) {
    next.MACD_CROSS.fast   = jitterInt(next.MACD_CROSS.fast ?? 12, 1, 5, 20);
    next.MACD_CROSS.slow   = jitterInt(next.MACD_CROSS.slow ?? 26, 2, 15, 50);
    next.MACD_CROSS.signal = jitterInt(next.MACD_CROSS.signal ?? 9, 1, 5, 15);
    // 確保 fast < slow
    if (next.MACD_CROSS.fast >= next.MACD_CROSS.slow) {
      next.MACD_CROSS.fast = Math.max(5, next.MACD_CROSS.slow - 5);
    }
  }

  if (next.BOLLINGER_BREAKOUT) {
    next.BOLLINGER_BREAKOUT.period = jitterInt(next.BOLLINGER_BREAKOUT.period ?? 20, 2, 10, 50);
    next.BOLLINGER_BREAKOUT.stdDev = jitter(next.BOLLINGER_BREAKOUT.stdDev ?? 2, 0.2, 1.0, 3.5);
  }

  next.stopLossPct      = jitter(next.stopLossPct ?? 5, 0.2, 1, 15);
  next.takeProfitPct    = jitter(next.takeProfitPct ?? 10, 0.2, 2, 30);
  next.trailingStopPct  = jitter(next.trailingStopPct ?? 3, 0.2, 1, 10);

  return next;
}

/**
 * 執行優化掃描
 */
export async function runOptimizationScan(symbol: string, history: any[]): Promise<OptimizationProposal | null> {
  const currentConfig = getAgentConfig();
  const currentParams = currentConfig.params;
  
  // 1. 基準 + 5 組變異子代 — 全部並行執行
  const CANDIDATES = 5;
  const candidateParamsList = Array.from({ length: CANDIDATES }, () => mutateParams(currentParams));
  const candidateConfigs = candidateParamsList.map(p => ({ ...currentConfig, params: p }));

  const [baseSettled, ...candidateSettled] = await Promise.allSettled([
    runBacktestWithBestEngine(symbol, history, currentConfig),
    ...candidateConfigs.map(cfg => runBacktestWithBestEngine(symbol, history, cfg)),
  ]);

  if (baseSettled.status === 'rejected') return null;
  const baseResult = baseSettled.value;
  const baseScore = riskAdjustedScore(baseResult.metrics);

  let bestParams = currentParams;
  let bestScore = baseScore;
  let bestMetrics = baseResult.metrics;

  // 2. 從並行結果中找最優子代
  candidateSettled.forEach((settled, idx) => {
    if (settled.status === 'rejected') return;
    const score = riskAdjustedScore(settled.value.metrics);
    if (score > bestScore) {
      bestScore = score;
      bestParams = candidateParamsList[idx];
      bestMetrics = settled.value.metrics;
    }
  });

  const improvementPct = Number((bestMetrics.roi - baseResult.metrics.roi).toFixed(2));

  // 3. 多重測試校正：從 CANDIDATES+1 組挑最優會膨脹 Sharpe，扣除預期膨脹量後才比較
  const numTrials = CANDIDATES + 1;
  const deflatedBest = deflatedRiskAdjustedScore(bestMetrics, numTrials, history.length);

  // 只有「校正後」風險調整評分仍顯著勝過基準才提出建議（防止過擬合提案）
  if (deflatedBest > baseScore * 1.05) {
    return {
      originalParams: currentParams,
      betterParams: bestParams,
      improvementPct,
      riskAdjustedScore: Number(deflatedBest.toFixed(4)),
      rawRiskAdjustedScore: Number(bestScore.toFixed(4)),
      trials: numTrials,
      reason: `在 ${symbol} 的歷史數據中，這組新參數在多重測試校正（Deflated Sharpe，${numTrials} 組試驗）後仍展現更佳的風險調整績效。`
    };
  }

  return null;
}

/**
 * 回測頁面專用優化器：直接接受明確的策略參數，不依賴 getAgentConfig()
 */
export async function runExplicitOptimizationScan(
  symbol: string,
  history: any[],
  strategyId: string,
  currentParams: any,
): Promise<OptimizationProposal | null> {
  const strategyMap: Record<string, string[]> = {
    neural:       ['RSI_REVERSION', 'MACD_CROSS', 'BOLLINGER_BREAKOUT'],
    rsi:          ['RSI_REVERSION'],
    macd:         ['MACD_CROSS'],
    ma_crossover: ['BOLLINGER_BREAKOUT'],
  };
  const strategies = strategyMap[strategyId] ?? ['BOLLINGER_BREAKOUT'];
  const baseConfig = { strategies, params: currentParams, _ablation_quantumEnabled: false, _ablation_aiEnabled: false };

  const CANDIDATES = 5;
  const candidateParamsList = Array.from({ length: CANDIDATES }, () => mutateParams(currentParams));

  const [baseSettled, ...candidateSettled] = await Promise.allSettled([
    runBacktestWithBestEngine(symbol, history, baseConfig),
    ...candidateParamsList.map(p => runBacktestWithBestEngine(symbol, history, { ...baseConfig, params: p })),
  ]);

  if (baseSettled.status === 'rejected') return null;
  const baseResult = baseSettled.value;
  const baseScore = riskAdjustedScore(baseResult.metrics);

  let bestParams = currentParams;
  let bestScore = baseScore;
  let bestMetrics = baseResult.metrics;

  candidateSettled.forEach((settled, idx) => {
    if (settled.status === 'rejected') return;
    const score = riskAdjustedScore(settled.value.metrics);
    if (score > bestScore) {
      bestScore = score;
      bestParams = candidateParamsList[idx];
      bestMetrics = settled.value.metrics;
    }
  });

  const numTrials = CANDIDATES + 1;
  const deflatedBest = deflatedRiskAdjustedScore(bestMetrics, numTrials, history.length);

  if (deflatedBest > baseScore * 1.05) {
    return {
      originalParams: currentParams,
      betterParams: bestParams,
      improvementPct: Number((bestMetrics.roi - baseResult.metrics.roi).toFixed(2)),
      riskAdjustedScore: Number(deflatedBest.toFixed(4)),
      rawRiskAdjustedScore: Number(bestScore.toFixed(4)),
      trials: numTrials,
      reason: `在 ${symbol} 的歷史數據中，新參數經多重測試校正（Deflated Sharpe，${numTrials} 組試驗）後風險調整績效提升了 ${((deflatedBest / Math.max(baseScore, 1e-9) - 1) * 100).toFixed(1)}%。`,
    };
  }

  return null;
}
