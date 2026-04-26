import { describe, it, expect } from 'vitest';
import { applyQuantumPolicy } from '../quantumPolicy.js';
import type { SignalFusionResult } from '../../../types/signal.js';
import type { RawQuantumOutput } from '../quantumPolicy.js';

function makeFused(action: 'BUY' | 'SELL' | 'HOLD', confidence: number): SignalFusionResult {
  return {
    symbol: 'TEST',
    action,
    confidence,
    score: action === 'BUY' ? 0.5 : action === 'SELL' ? -0.5 : 0,
    reason: 'test',
    components: [],
    meta: { minConfidence: 55, quantumEnabled: true },
  };
}

function makeQuantum(overrides: Partial<RawQuantumOutput> = {}): RawQuantumOutput {
  return {
    action: 'BUY',
    confidence: 70,
    momentum_phase: 0.3,
    regime_flip_prob: 0.1,
    uncertainty_penalty: 0.2,
    model: 'fallback_proxy',
    errors: [],
    ...overrides,
  };
}

describe('applyQuantumPolicy', () => {
  it('low uncertainty: action preserved, leverageMultiplier near 1.0', () => {
    const result = applyQuantumPolicy(makeFused('BUY', 75), makeQuantum({ uncertainty_penalty: 0.1 }));
    expect(result.action).toBe('BUY');
    expect(result.gated).toBe(false);
    expect(result.leverageMultiplier).toBeGreaterThan(0.9);
    expect(result.leverageMultiplier).toBeLessThanOrEqual(1.0);
  });

  it('high uncertainty (>0.65): action forced to HOLD, gated=true', () => {
    const result = applyQuantumPolicy(makeFused('BUY', 80), makeQuantum({ uncertainty_penalty: 0.8 }));
    expect(result.action).toBe('HOLD');
    expect(result.gated).toBe(true);
    expect(result.confidence).toBe(0);
  });

  it('uncertainty exactly at threshold (0.65) is not gated', () => {
    const result = applyQuantumPolicy(makeFused('SELL', 70), makeQuantum({ uncertainty_penalty: 0.65 }));
    expect(result.gated).toBe(false);
    expect(result.action).toBe('SELL');
  });

  it('uncertainty just above threshold (0.651) is gated', () => {
    const result = applyQuantumPolicy(makeFused('SELL', 70), makeQuantum({ uncertainty_penalty: 0.651 }));
    expect(result.gated).toBe(true);
    expect(result.action).toBe('HOLD');
  });

  it('negative momentum_phase with low uncertainty: confidence modified downward', () => {
    const fused = makeFused('BUY', 80);
    const result = applyQuantumPolicy(fused, makeQuantum({ momentum_phase: -0.8, uncertainty_penalty: 0.2 }));
    expect(result.action).toBe('BUY');
    expect(result.confidence).toBeLessThan(80);
  });

  it('positive momentum_phase does not reduce confidence', () => {
    const fused = makeFused('BUY', 75);
    const result = applyQuantumPolicy(fused, makeQuantum({ momentum_phase: 0.5, uncertainty_penalty: 0.1 }));
    expect(result.confidence).toBe(75);
  });

  it('preQuantumAction is always recorded correctly', () => {
    const buy = applyQuantumPolicy(makeFused('BUY', 70), makeQuantum({ uncertainty_penalty: 0.9 }));
    expect(buy.preQuantumAction).toBe('BUY');

    const sell = applyQuantumPolicy(makeFused('SELL', 65), makeQuantum({ uncertainty_penalty: 0.1 }));
    expect(sell.preQuantumAction).toBe('SELL');

    const hold = applyQuantumPolicy(makeFused('HOLD', 50), makeQuantum({ uncertainty_penalty: 0.5 }));
    expect(hold.preQuantumAction).toBe('HOLD');
  });

  it('preQuantumConfidence is always recorded correctly', () => {
    const result = applyQuantumPolicy(makeFused('BUY', 82), makeQuantum({ uncertainty_penalty: 0.9 }));
    expect(result.preQuantumConfidence).toBe(82);
  });

  it('leverageMultiplier decreases as uncertainty_penalty increases', () => {
    const low = applyQuantumPolicy(makeFused('BUY', 70), makeQuantum({ uncertainty_penalty: 0.1 }));
    const mid = applyQuantumPolicy(makeFused('BUY', 70), makeQuantum({ uncertainty_penalty: 0.5 }));
    const high = applyQuantumPolicy(makeFused('BUY', 70), makeQuantum({ uncertainty_penalty: 0.9 }));

    expect(low.leverageMultiplier).toBeGreaterThan(mid.leverageMultiplier);
    expect(mid.leverageMultiplier).toBeGreaterThan(high.leverageMultiplier);
    expect(high.leverageMultiplier).toBeGreaterThanOrEqual(0.25);
  });

  it('leverageMultiplier is always within [0.25, 1.0]', () => {
    for (const p of [0, 0.3, 0.65, 0.8, 1.0]) {
      const r = applyQuantumPolicy(makeFused('BUY', 70), makeQuantum({ uncertainty_penalty: p }));
      expect(r.leverageMultiplier).toBeGreaterThanOrEqual(0.25);
      expect(r.leverageMultiplier).toBeLessThanOrEqual(1.0);
    }
  });

  it('quantumScores are propagated intact', () => {
    const q = makeQuantum({ momentum_phase: -0.4, regime_flip_prob: 0.6, uncertainty_penalty: 0.3 });
    const result = applyQuantumPolicy(makeFused('BUY', 70), q);
    expect(result.quantumScores.momentum_phase).toBe(-0.4);
    expect(result.quantumScores.regime_flip_prob).toBe(0.6);
    expect(result.quantumScores.uncertainty_penalty).toBe(0.3);
  });
});
