import { describe, expect, it } from 'vitest';

import { createDefaultAgentTools } from '../../ai/defaultTools.js';
import type { AgentToolContext } from '../../ai/toolRegistry.js';
import { TradingSessionRegistry } from '../TradingSessionRegistry.js';
import {
  StrategyRuntimeService,
  type StrategyRuntimeRepoPort,
} from '../strategyRuntimeService.js';
import type { TradingSessionSnapshot } from '../tradingSessionState.js';

const bars = [
  {
    timestamp: '2026-01-01T14:30:00.000Z',
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1_000,
  },
  {
    timestamp: '2026-01-02T14:30:00.000Z',
    open: 101,
    high: 102,
    low: 100,
    close: 101,
    volume: 1_000,
  },
];

function createStrategyRepo() {
  const versions = new Map<string, any>();
  const jobs = new Map<string, any>();
  let versionSequence = 0;
  let jobSequence = 0;

  const repo: StrategyRuntimeRepoPort = {
    createVersion: async (input) => {
      const id = `version-${++versionSequence}`;
      const created = {
        id,
        strategyId: input.strategyId,
        userId: input.userId,
        version: versionSequence,
        runtime: input.runtime,
        source: input.source,
        sourceHash: input.sourceHash,
        parameterSchema: input.parameterSchema ?? {},
        defaultParameters: input.defaultParameters ?? {},
        executionPolicy: input.executionPolicy ?? {},
        validationStatus: 'pending',
        diagnostics: [],
        provenance: input.provenance ?? 'human',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      versions.set(id, created);
      return structuredClone(created);
    },
    getVersionForUser: async (userId, versionId) => {
      const found = versions.get(versionId);
      return found?.userId === userId ? structuredClone(found) : null;
    },
    listVersionsForUser: async (userId, strategyId) => (
      [...versions.values()]
        .filter((entry) => entry.userId === userId && entry.strategyId === strategyId)
        .map((entry) => structuredClone(entry))
    ),
    updateValidationResult: async (userId, versionId, status, diagnostics) => {
      const found = versions.get(versionId);
      if (!found || found.userId !== userId) return null;
      found.validationStatus = status;
      found.diagnostics = structuredClone(diagnostics);
      return structuredClone(found);
    },
    createBacktestJob: async (input) => {
      const id = `job-${++jobSequence}`;
      const created = {
        id,
        userId: input.userId,
        strategyVersionId: input.strategyVersionId,
        symbol: input.symbol,
        status: 'queued',
        request: input.request,
        result: null,
        error: null,
        sourceHash: input.sourceHash,
        dataHash: input.dataHash,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        startedAt: null,
        completedAt: null,
      };
      jobs.set(id, created);
      return structuredClone(created);
    },
    markBacktestRunning: async (userId, jobId) => {
      const found = jobs.get(jobId);
      if (!found || found.userId !== userId) return null;
      found.status = 'running';
      found.startedAt = new Date('2026-01-02T00:00:00.000Z');
      return structuredClone(found);
    },
    completeBacktestJob: async (userId, jobId, result) => {
      const found = jobs.get(jobId);
      if (!found || found.userId !== userId) return null;
      found.status = 'completed';
      found.result = structuredClone(result);
      found.completedAt = new Date('2026-01-02T00:01:00.000Z');
      return structuredClone(found);
    },
    failBacktestJob: async (userId, jobId, error) => {
      const found = jobs.get(jobId);
      if (!found || found.userId !== userId) return null;
      found.status = 'failed';
      found.error = error;
      return structuredClone(found);
    },
    getBacktestJobForUser: async (userId, jobId) => {
      const found = jobs.get(jobId);
      return found?.userId === userId ? structuredClone(found) : null;
    },
  };

  return repo;
}

describe('QuantDinger capability integration', () => {
  it('runs create, validate, backtest, paper fill, inspect, and stop as one flow', async () => {
    const scheduled: Array<() => Promise<void>> = [];
    const strategyService = new StrategyRuntimeService({
      repo: createStrategyRepo(),
      loadBars: async () => bars,
      validate: async (request) => ({
        valid: true,
        diagnostics: [],
        sourceHash: request.sourceHash,
        engineVersion: 'hermes-quant-1',
      }),
      backtest: async (request) => ({
        runId: request.runId,
        strategyVersionId: request.strategyVersionId,
        sourceHash: request.sourceHash,
        engineVersion: 'hermes-quant-1',
        equityCurve: [{
          timestamp: bars[0]!.timestamp,
          equity: 100_000,
          drawdownPct: 0,
        }],
        trades: [],
        metrics: { totalReturnPct: 0 },
        assumptions: { nextBarExecution: true },
        warnings: [],
      }),
      schedule: (task) => scheduled.push(task),
    });
    const snapshots = new Map<string, TradingSessionSnapshot>();
    const lifecycleEvents: Array<{ userId: string; event: { type: string; data: unknown } }> = [];
    const registry = new TradingSessionRegistry({
      repo: {
        saveConfig: async () => undefined,
        saveSessionSnapshot: async (snapshot) => {
          snapshots.set(snapshot.userId, structuredClone(snapshot));
        },
        getAllActiveSessionSnapshots: async () => [...snapshots.values()],
      },
      isMarketOpen: () => true,
      evaluateStrategyVersion: async ({ versionId, symbol }) => ({
        strategyVersionId: versionId,
        sourceHash: 'a'.repeat(64),
        engineVersion: 'hermes-quant-1',
        symbol,
        action: 'BUY',
        confidence: 100,
        price: 100,
        marketTimestamp: new Date().toISOString(),
      }),
      publish: (userId, event) => lifecycleEvents.push({ userId, event }),
    });
    const tools = createDefaultAgentTools({
      resolveData: async () => {
        throw new Error('not used in this flow');
      },
      getPortfolio: async () => [],
      getTrades: async () => [],
      createStrategyVersion: (userId, strategyId, command) => (
        strategyService.createVersion(userId, strategyId, command)
      ),
      validateStrategyVersion: (userId, versionId) => (
        strategyService.validateVersion(userId, versionId)
      ),
      queueBacktest: async (userId, input) => {
        const queued = await strategyService.startBacktest(userId, {
          strategyVersionId: String(input.strategyVersionId),
          symbol: String(input.ticker),
          execution: { initialCapital: Number(input.initialCapital ?? 100_000) },
        });
        return { jobId: queued.id, status: queued.status };
      },
      getBacktestJob: (userId, jobId) => strategyService.getBacktestJob(userId, jobId),
      startPaperStrategy: async (userId, input) => {
        await strategyService.assertPaperExecutableVersion(userId, input.strategyVersionId);
        const session = await registry.start(userId, {
          mode: 'simulated',
          symbols: [input.ticker],
          strategyVersionId: input.strategyVersionId,
          params: { maxAllocationPerTrade: 0.01 },
        }, { runImmediately: false });
        return {
          sessionId: userId,
          status: session.state.status,
          paperOnly: true,
        };
      },
      inspectPaperSession: async (userId) => {
        const session = registry.require(userId);
        return {
          sessionId: userId,
          status: session.state.status,
          positions: session.state.paperBroker.exportState().positions,
          paperOnly: true,
        };
      },
      inspectPaperOrders: async (userId) => ({
        sessionId: userId,
        positions: registry.require(userId).state.paperBroker.exportState().positions,
        paperOnly: true,
      }),
      stopPaperStrategy: async (userId) => {
        registry.stop(userId);
        return {
          sessionId: userId,
          status: registry.require(userId).state.status,
          paperOnly: true,
        };
      },
    });
    const context: AgentToolContext = {
      userId: 'user-1',
      scopes: ['R', 'W', 'B', 'T'],
      paperOnly: true,
      allowedMarkets: ['us_stock'],
      allowedInstruments: ['AAPL'],
    };

    const draft = await tools.execute('create_strategy_draft', {
      strategyId: 7,
      runtime: 'indicator',
      source: 'def run(data, params): return {"buy": [False, True], "sell": [False, False]}',
    }, context);
    const versionId = String((draft.data as { id: string }).id);
    const validation = await tools.execute(
      'validate_strategy',
      { strategyVersionId: versionId },
      context,
    );
    const queued = await tools.execute('execute_backtest', {
      ticker: 'AAPL',
      strategyVersionId: versionId,
      initialCapital: 100_000,
    }, context);
    await scheduled[0]!();
    const inspectedBacktest = await tools.execute(
      'inspect_backtest',
      { jobId: (queued.data as { jobId: string }).jobId },
      context,
    );
    const started = await tools.execute('start_paper_strategy', {
      ticker: 'AAPL',
      strategyVersionId: versionId,
    }, context);
    await registry.require('user-1').runTick();
    const paper = await tools.execute('inspect_paper_session', {}, context);
    const stopped = await tools.execute('stop_paper_strategy', {}, context);

    expect(validation.data).toMatchObject({ valid: true });
    expect(inspectedBacktest.data).toMatchObject({ status: 'completed' });
    expect(started.data).toMatchObject({ status: 'running', paperOnly: true });
    expect(paper.data).toMatchObject({
      status: 'running',
      positions: [expect.objectContaining({ symbol: 'AAPL' })],
    });
    expect(lifecycleEvents).toContainEqual(expect.objectContaining({
      userId: 'user-1',
      event: expect.objectContaining({ type: 'order_lifecycle' }),
    }));
    expect(stopped.data).toMatchObject({ status: 'stopped', paperOnly: true });
    registry.disposeAll();
  });
});
