import { describe, expect, it, vi } from 'vitest';
import { queueAgentBacktest } from '../../services/agentBacktestTool.js';

describe('AI execute_backtest tool', () => {
  it('queues the same persisted strategy runtime used by the REST API', async () => {
    const startBacktest = vi.fn(async () => ({
      id: 'job-1',
      status: 'queued',
    }));

    const result = await queueAgentBacktest(
      'user-1',
      {
        strategyVersionId: 'version-1',
        ticker: '2330.TW',
        initialCapital: 500_000,
        startDate: '2025-01-01',
        endDate: '2026-01-01',
      },
      { startBacktest } as any,
    );

    expect(result).toEqual({ jobId: 'job-1', status: 'queued' });
    expect(startBacktest).toHaveBeenCalledWith('user-1', {
      strategyVersionId: 'version-1',
      symbol: '2330.TW',
      period1: '2025-01-01',
      period2: '2026-01-01',
      execution: { initialCapital: 500_000 },
    });
  });

  it('rejects calls without immutable strategy identity', async () => {
    await expect(queueAgentBacktest(
      'user-1',
      { ticker: '2330.TW' },
      { startBacktest: vi.fn() } as any,
    )).rejects.toThrow('strategyVersionId');
  });
});
