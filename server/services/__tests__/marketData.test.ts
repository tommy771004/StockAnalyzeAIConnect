import { describe, expect, it, vi } from 'vitest';

import { getInstitutionalFlow } from '../marketData.js';

describe('marketData registry integration', () => {
  it('formats sourced institutional flow without random synthesis', async () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('random market data is forbidden');
    });
    const registry = {
      resolve: vi.fn(async () => ({
        data: {
          foreignNet: 1_200,
          trustNet: -300,
          dealerNet: 100,
        },
        provenance: {
          providerId: 'wantgoo-chip',
          marketTimestamp: '2026-01-02T00:00:00.000Z',
        },
      })),
    };

    const text = await getInstitutionalFlow('2330.TW', registry as never);

    expect(random).not.toHaveBeenCalled();
    expect(registry.resolve).toHaveBeenCalledWith({
      operation: 'institutional',
      symbol: '2330.TW',
      market: 'tw_stock',
    });
    expect(text).toContain('外資: +1200 張');
    expect(text).toContain('資料來源: wantgoo-chip');
  });
});
