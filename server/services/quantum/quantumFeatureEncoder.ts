/**
 * server/services/quantum/quantumFeatureEncoder.ts
 * Encodes raw price data + technical indicators into the feature dict
 * expected by getQuantumSignal (Python /quantum/signal endpoint).
 *
 * Normalization contracts:
 *  - returns_5d  : 5-period log-return, clamped to [-1, 1]
 *  - volatility  : std of last 10 returns, clamped to [0, 1]
 *  - rsi_norm    : rsi/100 → [0, 1]
 *  - macd_diff   : passed through as-is (already normalized upstream)
 *  - flow_bias   : passed through as-is
 */

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function logReturn(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return Math.log(b / a);
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function encodeQuantumFeatures(
  prices: number[],
  indicators: Record<string, number>,
): Record<string, number> {
  const n = prices.length;

  const returns_5d =
    n >= 6 ? clamp(logReturn(prices[n - 6], prices[n - 1]), -1, 1) : 0;

  const recentReturns =
    n >= 11
      ? prices.slice(n - 11).map((p, i, arr) => (i > 0 ? logReturn(arr[i - 1], p) : 0)).slice(1)
      : [];
  const volatility = clamp(stdDev(recentReturns), 0, 1);

  const rsi_norm = clamp((indicators['rsi'] ?? 50) / 100, 0, 1);
  const macd_diff = indicators['macd_diff'] ?? 0;
  const flow_bias = indicators['flow_bias'] ?? 0;

  return { returns_5d, volatility, rsi_norm, macd_diff, flow_bias };
}
