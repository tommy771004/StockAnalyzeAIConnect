/**
 * server/services/optimizerService.ts
 * 策略自動優化器：透過參數變異與回測尋找最優配置
 */
import { runAdvancedBacktest } from './backtestEngine.js';
import { getAgentConfig } from './autonomousAgent.js';

interface OptimizationProposal {
  originalParams: any;
  betterParams: any;
  improvementPct: number;
  reason: string;
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
  const baseResult = await runAdvancedBacktest(symbol, history, currentConfig);
  const baseRoi = baseResult.metrics.roi;

  let bestParams = currentParams;
  let maxRoi = baseRoi;
  let improvement = 0;

  // 2. 測試 5 組變異子代
  for (let i = 0; i < 5; i++) {
    const candidateParams = mutateParams(currentParams);
    const candidateConfig = { ...currentConfig, params: candidateParams };
    
    const result = await runAdvancedBacktest(symbol, history, candidateConfig);
    if (result.metrics.roi > maxRoi) {
      maxRoi = result.metrics.roi;
      bestParams = candidateParams;
      improvement = maxRoi - baseRoi;
    }
  }

  // 3. 如果有顯著提升 (> 2%)，則提出建議
  if (improvement > 2) {
    return {
      originalParams: currentParams,
      betterParams: bestParams,
      improvementPct: Number(improvement.toFixed(2)),
      reason: `在 ${symbol} 的歷史數據中，這組新參數展現了更好的風險報酬比。`
    };
  }

  return null;
}
