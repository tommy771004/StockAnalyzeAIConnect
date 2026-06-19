import { describe, it, expect } from 'vitest';
import { summarizeDepth, sectorHeatClass } from '../dashboardMarketUtils';

describe('summarizeDepth', () => {
  it('computes buy/sell share from bid/ask volume', () => {
    const r = summarizeDepth([{ price: 10, size: 30 }], [{ price: 9, size: 70 }]);
    expect(r).toEqual({ buyPct: 70, sellPct: 30 });
  });
  it('returns 50/50 when no depth', () => {
    expect(summarizeDepth([], [])).toEqual({ buyPct: 50, sellPct: 50 });
  });
});

describe('sectorHeatClass', () => {
  it('US convention: up=green, down=red', () => {
    expect(sectorHeatClass(1.5, false)).toContain('emerald');
    expect(sectorHeatClass(-0.5, false)).toContain('rose');
  });
  it('TW convention (invert): up=red, down=green', () => {
    expect(sectorHeatClass(1.5, true)).toContain('rose');
    expect(sectorHeatClass(-0.5, true)).toContain('emerald');
  });
  it('flat is neutral', () => {
    expect(sectorHeatClass(0, false)).toContain('zinc');
  });
});
