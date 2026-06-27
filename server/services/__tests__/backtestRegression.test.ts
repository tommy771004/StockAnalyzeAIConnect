import { describe, expect, it } from 'vitest';
import { runAdvancedBacktest } from '../backtestEngine.js';
import { fuseSignals } from '../signalFusionService.js';

describe('existing trading behavior', () => {
  it('ignores zero-weight observations', () => {
    const result = fuseSignals({
      symbol: '2330.TW',
      minConfidence: 0,
      quantumEnabled: true,
      observations: [
        { source: 'ai', action: 'BUY', confidence: 90, weight: 1 },
        { source: 'technical', action: 'SELL', confidence: 100, weight: 0 },
      ],
    });

    expect(result.action).toBe('BUY');
    expect(result.components).toHaveLength(1);
  });

  it('applies engine stop loss before a later recovery', async () => {
    const closes = [...Array.from({ length: 50 }, () => 100), 70, 60, 80];
    const quotes = closes.map((close, index) => ({
      close,
      volume: 1_000_000,
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    }));

    const result = await runAdvancedBacktest('TEST', quotes, {
      strategies: ['RSI_REVERSION'],
      params: {
        RSI_REVERSION: { period: 2, oversold: 101, overbought: 200, weight: 1 },
        AI_LLM: { weight: 0, confidenceThreshold: 0 },
        stopLossPct: 5,
        takeProfitPct: 100,
      },
      _ablation_aiEnabled: false,
      _ablation_quantumEnabled: false,
    });

    expect(result.trades.some((trade) => trade.pnlPct <= -5)).toBe(true);
  });
});
