import { describe, expect, it, vi } from 'vitest';
import {
  StrategyRuntimeService,
  type StrategyRuntimeRepoPort,
} from '../strategyRuntimeService.js';

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-1',
    strategyId: 1,
    userId: 'user-1',
    version: 1,
    runtime: 'indicator',
    source: 'def run(data, params): return {"buy": [False, False], "sell": [False, False]}',
    sourceHash: 'b9605850acf6af184c4278fdd450e834f0102596d3b37357eae529d8337223b0',
    parameterSchema: {},
    defaultParameters: {},
    executionPolicy: {},
    validationStatus: 'valid',
    diagnostics: [],
    provenance: 'human',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as any;
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    userId: 'user-1',
    strategyVersionId: 'version-1',
    symbol: '2330.TW',
    status: 'queued',
    request: {},
    result: null,
    error: null,
    sourceHash: 'b9605850acf6af184c4278fdd450e834f0102596d3b37357eae529d8337223b0',
    dataHash: 'd'.repeat(64),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    ...overrides,
  } as any;
}

function fakeRepo(overrides: Partial<StrategyRuntimeRepoPort> = {}): StrategyRuntimeRepoPort {
  return {
    createVersion: vi.fn(async () => version()),
    getVersionForUser: vi.fn(async () => version()),
    listVersionsForUser: vi.fn(async () => [version()]),
    updateValidationResult: vi.fn(async () => version()),
    createBacktestJob: vi.fn(async () => job()),
    markBacktestRunning: vi.fn(async () => job({ status: 'running' })),
    completeBacktestJob: vi.fn(async () => job({ status: 'completed' })),
    failBacktestJob: vi.fn(async () => job({ status: 'failed' })),
    getBacktestJobForUser: vi.fn(async () => job()),
    ...overrides,
  };
}

const bars = [
  {
    timestamp: '2026-01-01',
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1_000,
  },
  {
    timestamp: '2026-01-02',
    open: 101,
    high: 102,
    low: 100,
    close: 101,
    volume: 1_000,
  },
];

describe('StrategyRuntimeService', () => {
  it('hashes source before creating an immutable version', async () => {
    const repo = fakeRepo();
    const service = new StrategyRuntimeService({
      repo,
      loadBars: vi.fn(async () => bars),
      validate: vi.fn(),
      backtest: vi.fn(),
      schedule: vi.fn(),
    });
    const source = 'def run(data, params): return {"buy": [], "sell": []}';

    await service.createVersion('user-1', 1, {
      runtime: 'indicator',
      source,
      parameterSchema: {},
      defaultParameters: {},
      executionPolicy: {},
      provenance: 'human',
    });

    expect(repo.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      strategyId: 1,
      source,
      sourceHash: '476faed19bd4f9dede0b22722172169e56f5c017cae29df1ac0bb1204687e193',
    }));
  });

  it('does not reveal another users strategy version', async () => {
    const validate = vi.fn();
    const service = new StrategyRuntimeService({
      repo: fakeRepo({ getVersionForUser: vi.fn(async () => null) }),
      loadBars: vi.fn(async () => bars),
      validate,
      backtest: vi.fn(),
      schedule: vi.fn(),
    });

    await expect(service.validateVersion('user-2', 'version-1'))
      .rejects.toThrow('Strategy version not found');
    expect(validate).not.toHaveBeenCalled();
  });

  it('persists immutable hashes and completes a scheduled backtest', async () => {
    let scheduled: (() => Promise<void>) | undefined;
    const repo = fakeRepo();
    const backtest = vi.fn(async (request) => ({
      runId: request.runId,
      strategyVersionId: request.strategyVersionId,
      sourceHash: request.sourceHash,
      engineVersion: 'hermes-quant-1',
      equityCurve: [{ timestamp: '2026-01-01', equity: 10_000, drawdownPct: 0 }],
      trades: [],
      metrics: { totalReturnPct: 0 },
      assumptions: {},
      warnings: [],
    }));
    const service = new StrategyRuntimeService({
      repo,
      loadBars: vi.fn(async () => bars),
      validate: vi.fn(),
      backtest,
      schedule: (task) => {
        scheduled = task;
      },
    });

    const queued = await service.startBacktest('user-1', {
      strategyVersionId: 'version-1',
      symbol: '2330.TW',
      parameters: {},
      execution: { initialCapital: 10_000 },
    });

    expect(queued.status).toBe('queued');
    expect(repo.createBacktestJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      sourceHash: version().sourceHash,
      dataHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(scheduled).toBeTypeOf('function');

    await scheduled?.();

    expect(repo.markBacktestRunning).toHaveBeenCalledWith('user-1', 'job-1');
    expect(backtest).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'job-1',
      bars,
    }));
    expect(repo.completeBacktestJob).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      expect.objectContaining({ engineVersion: 'hermes-quant-1' }),
    );
  });

  it('persists worker failures without throwing into the scheduler', async () => {
    let scheduled: (() => Promise<void>) | undefined;
    const repo = fakeRepo();
    const service = new StrategyRuntimeService({
      repo,
      loadBars: vi.fn(async () => bars),
      validate: vi.fn(),
      backtest: vi.fn(async () => {
        throw new Error('runtime unavailable');
      }),
      schedule: (task) => {
        scheduled = task;
      },
    });

    await service.startBacktest('user-1', {
      strategyVersionId: 'version-1',
      symbol: '2330.TW',
      parameters: {},
      execution: { initialCapital: 10_000 },
    });
    await expect(scheduled?.()).resolves.toBeUndefined();

    expect(repo.failBacktestJob).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      'runtime unavailable',
    );
  });

  it('loads, hashes, persists, and executes one cross-sectional universe', async () => {
    let scheduled: (() => Promise<void>) | undefined;
    const repo = fakeRepo({
      createBacktestJob: vi.fn(async (input) => job({
        symbol: input.symbol,
        request: input.request,
        dataHash: input.dataHash,
      })),
    });
    const loadBars = vi.fn(async (input: { symbol: string }) => (
      input.symbol === 'AAPL'
        ? [{
            timestamp: '2025-12-31',
            open: 99,
            high: 100,
            low: 98,
            close: 99,
            volume: 1_000,
          }, ...bars]
        : bars
    ));
    const backtest = vi.fn(async (request) => ({
      runId: request.runId,
      strategyVersionId: request.strategyVersionId,
      sourceHash: request.sourceHash,
      engineVersion: 'hermes-quant-1',
      equityCurve: [{ timestamp: '2026-01-01', equity: 10_000, drawdownPct: 0 }],
      trades: [],
      metrics: { totalReturnPct: 0 },
      assumptions: { strategyMode: 'cross_sectional' },
      warnings: [],
    }));
    const service = new StrategyRuntimeService({
      repo,
      loadBars,
      validate: vi.fn(),
      backtest,
      schedule: (task) => {
        scheduled = task;
      },
    });

    const queued = await service.startBacktest('user-1', {
      strategyVersionId: 'version-1',
      crossSectional: {
        symbols: ['aapl', 'msft', 'nvda'],
        portfolioSize: 2,
        longRatio: 0.5,
        rebalanceFrequency: 'weekly',
      },
      execution: { initialCapital: 10_000 },
    });

    expect(loadBars.mock.calls.map(([input]) => input.symbol)).toEqual([
      'AAPL',
      'MSFT',
      'NVDA',
    ]);
    expect(queued.symbol).toBe('AAPL,MSFT,NVDA');
    expect(repo.createBacktestJob).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'AAPL,MSFT,NVDA',
      dataHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      request: expect.objectContaining({
        crossSectional: expect.objectContaining({
          symbols: ['AAPL', 'MSFT', 'NVDA'],
        }),
        universeBars: {
          AAPL: bars,
          MSFT: bars,
          NVDA: bars,
        },
      }),
    }));

    await scheduled?.();

    expect(backtest).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'AAPL,MSFT,NVDA',
      crossSectional: expect.objectContaining({ portfolioSize: 2 }),
      universeBars: {
        AAPL: bars,
        MSFT: bars,
        NVDA: bars,
      },
    }));
  });

  it('allows long-only ScriptStrategy paper execution and rejects short-capable policy', async () => {
    const service = new StrategyRuntimeService({
      repo: fakeRepo({
        getVersionForUser: vi.fn(async (_userId, versionId) => (
          versionId === 'long-script'
            ? version({
                id: versionId,
                runtime: 'script',
                executionPolicy: { tradeDirection: 'long' },
              })
            : version({
                id: versionId,
                runtime: 'script',
                executionPolicy: { tradeDirection: 'both' },
              })
        )),
      }),
      loadBars: vi.fn(async () => bars),
      validate: vi.fn(),
      backtest: vi.fn(),
      schedule: vi.fn(),
    });

    await expect(service.assertPaperExecutableVersion('user-1', 'long-script'))
      .resolves.toMatchObject({ runtime: 'script' });
    await expect(service.assertPaperExecutableVersion('user-1', 'both-script'))
      .rejects.toThrow('long-only');
  });
});
