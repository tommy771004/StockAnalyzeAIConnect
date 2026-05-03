/**
 * server/services/evaluation/ablationService.ts
 * Ablation 分析：技術指標 only vs +AI vs +AI+Quantum。
 * 每次優化任務都附帶此報告，決定是否 promote 進 live。
 */
import { runBacktestWithBestEngine, riskAdjustedScore } from '../backtestEngine.js';

export type AblationVariant = 'technical_only' | 'technical_plus_ai' | 'full';

export interface AblationVariantResult {
  variant: AblationVariant;
  metrics: {
    roi: number;
    sharpe: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
    riskAdjustedScore: number;
  };
}

export interface AblationReport {
  symbol: string;
  variants: AblationVariantResult[];
  recommendation: AblationVariant;
  promotable: boolean;
  summary: string;
}


function buildConfig(base: any, variant: AblationVariant): any {
  const cfg = JSON.parse(JSON.stringify(base));
  if (variant === 'technical_only') {
    cfg._ablation_quantumEnabled = false;
    cfg._ablation_aiEnabled = false;
  } else if (variant === 'technical_plus_ai') {
    cfg._ablation_quantumEnabled = false;
    cfg._ablation_aiEnabled = true;
  } else {
    cfg._ablation_quantumEnabled = true;
    cfg._ablation_aiEnabled = true;
  }
  return cfg;
}

export async function runAblation(
  symbol: string,
  history: any[],
  config: any,
): Promise<AblationReport> {
  const variants: AblationVariant[] = ['technical_only', 'technical_plus_ai', 'full'];
  const results: AblationVariantResult[] = [];

  for (const variant of variants) {
    const cfg = buildConfig(config, variant);
    const result = await runBacktestWithBestEngine(symbol, history, cfg);
    const score = riskAdjustedScore(result.metrics);
    results.push({
      variant,
      metrics: { ...result.metrics, riskAdjustedScore: Number(score.toFixed(4)) },
    });
  }

  const best = results.reduce((a, b) =>
    b.metrics.riskAdjustedScore > a.metrics.riskAdjustedScore ? b : a,
  );

  const baseline = results.find((r) => r.variant === 'technical_only')!;
  const full = results.find((r) => r.variant === 'full')!;

  // Promotable: full variant has better risk-adjusted score than baseline,
  // AND max drawdown does not exceed baseline + 2%
  const promotable =
    full.metrics.riskAdjustedScore > baseline.metrics.riskAdjustedScore &&
    full.metrics.maxDrawdown <= baseline.metrics.maxDrawdown + 2;

  const roiDiff = (full.metrics.roi - baseline.metrics.roi).toFixed(2);
  const mddDiff = (full.metrics.maxDrawdown - baseline.metrics.maxDrawdown).toFixed(2);
  const summary =
    `Best variant: ${best.variant} (score=${best.metrics.riskAdjustedScore}). ` +
    `Full vs baseline: ROI ${roiDiff}%, MDD Δ${mddDiff}%. ` +
    (promotable ? '✅ Promotable.' : '❌ Not promotable (risk threshold exceeded).');

  return { symbol, variants: results, recommendation: best.variant, promotable, summary };
}
