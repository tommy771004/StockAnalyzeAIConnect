/**
 * server/services/evaluation/walkForwardService.ts
 * Walk-forward + regime split 評估。
 * 每個 window: train → 回測; test → 評分。Regime: 牛/熊/震盪。
 */
import { runBacktestWithBestEngine } from '../backtestEngine.js';

export type Regime = 'bull' | 'bear' | 'sideways';

export interface WindowResult {
  windowIndex: number;
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  regime: Regime;
  metrics: {
    roi: number;
    sharpe: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
  };
}

export interface WalkForwardReport {
  symbol: string;
  windows: WindowResult[];
  aggregated: {
    avgRoi: number;
    avgSharpe: number;
    avgMaxDrawdown: number;
    avgWinRate: number;
    regimeBreakdown: Record<Regime, { count: number; avgRoi: number }>;
  };
}

function detectRegime(prices: number[]): Regime {
  if (prices.length < 2) return 'sideways';
  const ret = (prices[prices.length - 1] - prices[0]) / Math.max(Math.abs(prices[0]), 1e-6);
  if (ret > 0.1) return 'bull';
  if (ret < -0.1) return 'bear';
  return 'sideways';
}

function avg(vals: number[]): number {
  return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * @param trainSize  Number of history bars for training window
 * @param testSize   Number of history bars for out-of-sample test
 * @param step       Step size between windows (defaults to testSize)
 */
export async function runWalkForward(
  symbol: string,
  history: any[],
  config: any,
  trainSize = 200,
  testSize = 60,
  step = testSize,
): Promise<WalkForwardReport> {
  const windows: WindowResult[] = [];

  for (
    let trainStart = 0;
    trainStart + trainSize + testSize <= history.length;
    trainStart += step
  ) {
    const trainEnd = trainStart + trainSize;
    const testEnd = Math.min(trainEnd + testSize, history.length);
    const testSlice = history.slice(trainEnd, testEnd);

    if (testSlice.length < 20) break;

    const result = await runBacktestWithBestEngine(symbol, testSlice, config);
    const prices = testSlice.map((h: any) => h.close).filter((p: number) => p > 0);

    windows.push({
      windowIndex: windows.length,
      trainStart,
      trainEnd,
      testStart: trainEnd,
      testEnd,
      regime: detectRegime(prices),
      metrics: {
        roi: result.metrics.roi,
        sharpe: result.metrics.sharpe,
        maxDrawdown: result.metrics.maxDrawdown,
        winRate: result.metrics.winRate,
        totalTrades: result.metrics.totalTrades,
      },
    });
  }

  const regimeBreakdown: Record<Regime, { count: number; avgRoi: number }> = {
    bull: { count: 0, avgRoi: 0 },
    bear: { count: 0, avgRoi: 0 },
    sideways: { count: 0, avgRoi: 0 },
  };
  for (const w of windows) {
    regimeBreakdown[w.regime].count++;
    regimeBreakdown[w.regime].avgRoi += w.metrics.roi;
  }
  for (const r of Object.keys(regimeBreakdown) as Regime[]) {
    const g = regimeBreakdown[r];
    if (g.count > 0) g.avgRoi = g.avgRoi / g.count;
  }

  return {
    symbol,
    windows,
    aggregated: {
      avgRoi: avg(windows.map((w) => w.metrics.roi)),
      avgSharpe: avg(windows.map((w) => w.metrics.sharpe)),
      avgMaxDrawdown: avg(windows.map((w) => w.metrics.maxDrawdown)),
      avgWinRate: avg(windows.map((w) => w.metrics.winRate)),
      regimeBreakdown,
    },
  };
}
