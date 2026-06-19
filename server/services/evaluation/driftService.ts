/**
 * server/services/evaluation/driftService.ts
 * 回測期望 vs 實盤實現 的偏移比較（懷疑論者視角：要求可稽核的「回測說 X、實盤是 Y」落差）。
 * 純函式，不做 IO；market data / 回測由呼叫端供應。
 */

export interface DriftMetricInput {
  winRate: number;        // 0-100
  sharpe: number;
  maxDrawdownPct: number; // 正值＝回撤幅度，例 12.5 代表 -12.5%
  profitFactor: number;
}

export type DriftMetricName = 'winRate' | 'sharpe' | 'maxDrawdown' | 'profitFactor';

export interface MetricDrift {
  metric: DriftMetricName;
  backtest: number;
  live: number;
  delta: number;     // live − backtest（maxDrawdown 為幅度差，正＝實盤回撤更大）
  degraded: boolean; // 實盤顯著劣於回測
}

export interface DriftReport {
  symbol: string;
  liveTrades: number;
  metrics: MetricDrift[];
  degradedCount: number;
  verdict: 'aligned' | 'mild_drift' | 'severe_drift' | 'insufficient_data';
  summary: string;
}

/** 相對劣化超過此比例才視為 degraded。 */
const TOLERANCE = 0.2;
/** 實盤樣本數低於此值不做比較（避免雜訊結論）。 */
const MIN_LIVE_TRADES = 5;

function round(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : n;
}

/** higher-is-better：實盤低於回測 ×(1−tol) 即劣化（需兩端皆有限）。 */
function degradedHigher(bt: number, lv: number): boolean {
  if (!Number.isFinite(bt) || !Number.isFinite(lv)) return false;
  return lv < bt * (1 - TOLERANCE);
}

/** lower-is-better（回撤幅度）：實盤高於回測 ×(1+tol) 即劣化。 */
function degradedLower(bt: number, lv: number): boolean {
  if (!Number.isFinite(bt) || !Number.isFinite(lv)) return false;
  return lv > bt * (1 + TOLERANCE);
}

export function computeDrift(
  symbol: string,
  backtest: DriftMetricInput,
  live: DriftMetricInput,
  liveTrades: number,
): DriftReport {
  if (liveTrades < MIN_LIVE_TRADES) {
    return {
      symbol,
      liveTrades,
      metrics: [],
      degradedCount: 0,
      verdict: 'insufficient_data',
      summary: `實盤樣本不足（${liveTrades} 筆 < ${MIN_LIVE_TRADES}），無法可靠比較回測落差。`,
    };
  }

  const metrics: MetricDrift[] = [
    {
      metric: 'winRate',
      backtest: round(backtest.winRate),
      live: round(live.winRate),
      delta: round(live.winRate - backtest.winRate),
      degraded: degradedHigher(backtest.winRate, live.winRate),
    },
    {
      metric: 'sharpe',
      backtest: round(backtest.sharpe),
      live: round(live.sharpe),
      delta: round(live.sharpe - backtest.sharpe),
      degraded: degradedHigher(backtest.sharpe, live.sharpe),
    },
    {
      metric: 'profitFactor',
      backtest: round(backtest.profitFactor),
      live: round(live.profitFactor),
      delta: round(live.profitFactor - backtest.profitFactor),
      degraded: degradedHigher(backtest.profitFactor, live.profitFactor),
    },
    {
      metric: 'maxDrawdown',
      backtest: round(backtest.maxDrawdownPct),
      live: round(live.maxDrawdownPct),
      delta: round(live.maxDrawdownPct - backtest.maxDrawdownPct),
      degraded: degradedLower(backtest.maxDrawdownPct, live.maxDrawdownPct),
    },
  ];

  const degradedCount = metrics.filter((m) => m.degraded).length;
  const verdict: DriftReport['verdict'] =
    degradedCount === 0 ? 'aligned' : degradedCount <= 2 ? 'mild_drift' : 'severe_drift';

  const summary =
    verdict === 'aligned'
      ? `${symbol}：實盤與回測大致一致，無顯著劣化。`
      : `${symbol}：${degradedCount}/4 項指標實盤顯著劣於回測（${verdict === 'severe_drift' ? '嚴重' : '輕微'}偏移）。`;

  return { symbol, liveTrades, metrics, degradedCount, verdict, summary };
}
