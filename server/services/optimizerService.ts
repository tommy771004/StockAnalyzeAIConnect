/**
 * server/services/optimizerService.ts
 * 策略自動優化器：透過參數變異與回測尋找最優配置
 */
import { runBacktestWithBestEngine } from './backtestEngine.js';
import { getAgentConfig } from './autonomousAgent.js';

interface OptimizationProposal {
  originalParams: any;
  betterParams: any;
  improvementPct: number;
  riskAdjustedScore: number;
  reason: string;
}

/**
 * 風險懲罰評分：Sharpe × (1 - MDD/100) × winRate/100
 * 確保高 MDD 或低勝率的配置不會因為高 ROI 就被 promote。
 */
function riskAdjustedScore(metrics: {
  roi: number; sharpe: number; maxDrawdown: number; winRate: number;
}): number {
  const mddPenalty = Math.max(0, 1 - metrics.maxDrawdown / 100);
  return metrics.sharpe * mddPenalty * (metrics.winRate / 100);
}

/**
 * 產生變異參數
 */
function mutateParams(params: any) {
  const next = JSON.parse(JSON.stringify(params));
  
  // 隨機微調 RSI
  if (next.RSI_REVERSION) {
    next.RSI_REVERSION.period = Math.max(5, next.RSI_REVERSION.period + (Math.random() > 0.5 ? 1 : -1));
  }
  
  // 隨機微調風控
  next.stopLossPct = Number((next.stopLossPct * (0.9 + Math.random() * 0.2)).toFixed(1));
  next.takeProfitPct = Number((next.takeProfitPct * (0.9 + Math.random() * 0.2)).toFixed(1));
  
  return next;
}

/**
 * 執行優化掃描
 */
export async function runOptimizationScan(symbol: string, history: any[]): Promise<OptimizationProposal | null> {
  const currentConfig = getAgentConfig();
  const currentParams = currentConfig.params;
  
  // 1. 先測試目前參數的績效 (基準)
  const baseResult = await runBacktestWithBestEngine(symbol, history, currentConfig);
  const baseScore = riskAdjustedScore(baseResult.metrics);

  let bestParams = currentParams;
  let bestScore = baseScore;
  let bestMetrics = baseResult.metrics;

  // 2. 測試 5 組變異子代
  for (let i = 0; i < 5; i++) {
    const candidateParams = mutateParams(currentParams);
    const candidateConfig = { ...currentConfig, params: candidateParams };

    const result = await runBacktestWithBestEngine(symbol, history, candidateConfig);
    const score = riskAdjustedScore(result.metrics);
    if (score > bestScore) {
      bestScore = score;
      bestParams = candidateParams;
      bestMetrics = result.metrics;
    }
  }

  const improvementPct = Number(((bestMetrics.roi - baseResult.metrics.roi)).toFixed(2));

  // 3. 只有風險調整後評分有顯著提升才提出建議
  if (bestScore > baseScore * 1.05) {
    return {
      originalParams: currentParams,
      betterParams: bestParams,
      improvementPct,
      riskAdjustedScore: Number(bestScore.toFixed(4)),
      reason: `在 ${symbol} 的歷史數據中，這組新參數展現了更好的風險調整後績效（Sharpe×(1-MDD)×勝率）。`
    };
  }

  return null;
}
