import { afterEach, describe, expect, it, vi } from 'vitest';

import { AutonomousTradingSession } from '../AutonomousTradingSession.js';
import { TradingSessionState } from '../tradingSessionState.js';

afterEach(() => {
  vi.useRealTimers();
});

function createSession(
  userId: string,
  overrides: ConstructorParameters<typeof AutonomousTradingSession>[1] = {},
) {
  const state = new TradingSessionState(userId);
  const persist = vi.fn(async () => undefined);
  const session = new AutonomousTradingSession(state, {
    analyze: async () => ({ action: 'HOLD', confidence: 0, price: 100 }),
    persist,
    isMarketOpen: () => true,
    ...overrides,
  });
  return { state, session, persist };
}

describe('AutonomousTradingSession lifecycle', () => {
  it('starts and stops only its own paper scheduler', async () => {
    vi.useFakeTimers();
    const a = createSession('user-a');
    const b = createSession('user-b');

    await a.session.start({ symbols: ['AAPL'], tickIntervalMs: 1_000 }, { runImmediately: false });
    await b.session.start({ symbols: ['MSFT'], tickIntervalMs: 5_000 }, { runImmediately: false });

    expect(a.state.status).toBe('running');
    expect(b.state.status).toBe('running');
    expect(a.state.config.mode).toBe('simulated');
    a.session.stop();
    expect(a.state.status).toBe('stopped');
    expect(b.state.status).toBe('running');
  });

  it('downgrades real mode to the isolated paper broker', async () => {
    const { state, session } = createSession('user-a');
    await session.start({ mode: 'real' }, { runImmediately: false });
    expect(state.config.mode).toBe('simulated');
    expect(state.logs().some((log) => log.source === 'RISK')).toBe(true);
  });

  it('holds a per-session tick lock and persists after the tick', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { session, persist } = createSession('user-a', {
      analyze: async () => {
        await gate;
        return { action: 'HOLD', confidence: 0, price: 100 };
      },
    });
    await session.start({ symbols: ['AAPL'] }, { runImmediately: false });
    persist.mockClear();

    const first = session.runTick();
    await vi.waitFor(() => expect(session.isTickRunning()).toBe(true));
    await expect(session.runTick()).resolves.toBe(false);
    release();
    await expect(first).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('persists and reuses ScriptStrategy runtime cursors across ticks', async () => {
    const evaluateStrategyVersion = vi.fn(async (input) => ({
      strategyVersionId: input.versionId,
      sourceHash: 'a'.repeat(64),
      engineVersion: 'hermes-quant-1',
      symbol: input.symbol,
      action: 'HOLD' as const,
      confidence: 0,
      price: 100,
      marketTimestamp: '2026-01-02T00:00:00.000Z',
      runtimeState: { seen: (input.runtimeContext.runtimeState?.seen as number ?? 0) + 1 },
      lastProcessedTimestamp: '2026-01-02T00:00:00.000Z',
    }));
    const { state, session, persist } = createSession('user-a', {
      analyze: undefined,
      evaluateStrategyVersion,
    });
    state.strategyRuntimeStates.set('old-version:AAPL', {
      runtimeState: { stale: true },
      lastProcessedTimestamp: '2025-01-01T00:00:00.000Z',
    });
    await session.start({
      symbols: ['AAPL'],
      strategyVersionId: 'version-script-1',
    }, { runImmediately: false });
    expect(state.strategyRuntimeStates.has('old-version:AAPL')).toBe(false);
    persist.mockClear();

    await session.runTick();
    await session.runTick();

    expect(evaluateStrategyVersion).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        runtimeContext: expect.objectContaining({
          runtimeState: undefined,
          lastProcessedTimestamp: undefined,
        }),
      }),
    );
    expect(evaluateStrategyVersion).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        runtimeContext: expect.objectContaining({
          runtimeState: { seen: 1 },
          lastProcessedTimestamp: '2026-01-02T00:00:00.000Z',
        }),
      }),
    );
    expect(state.strategyRuntimeStates.get('version-script-1:AAPL')).toEqual({
      runtimeState: { seen: 2 },
      lastProcessedTimestamp: '2026-01-02T00:00:00.000Z',
    });
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('resumes after a scoped cooldown without changing another session', async () => {
    vi.useFakeTimers();
    const a = createSession('user-a');
    const b = createSession('user-b');
    await a.session.start({
      circuitBreaker: {
        enabled: true,
        maxLossStreak: 3,
        maxDailyLossPct: 2,
        cooldownMinutes: 1,
      },
    }, { runImmediately: false });
    await b.session.start(undefined, { runImmediately: false });

    a.session.activateCooldown('test');
    expect(a.state.status).toBe('cooldown');
    expect(b.state.status).toBe('running');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(a.state.status).toBe('running');
    expect(b.state.status).toBe('running');
  });
});

describe('AutonomousTradingSession safety ordering', () => {
  it('forces proactive stop-loss before an ordinary BUY signal can execute', async () => {
    const { state, session } = createSession('user-a', {
      analyze: async () => ({ action: 'BUY', confidence: 100, price: 90 }),
    });
    await state.paperBroker.connect({} as never);
    await state.paperBroker.placeOrder({
      symbol: 'AAPL',
      side: 'BUY',
      qty: 10,
      price: 100,
      orderType: 'LIMIT',
      marketType: 'US_STOCK',
    });
    state.posTrack.set('AAPL', { qty: 10, avgCost: 100 });
    await session.start({
      symbols: ['AAPL'],
      params: {
        ...state.config.params,
        stopLossPct: 5,
      },
    }, { runImmediately: false });

    await session.runTick();

    expect(state.posTrack.has('AAPL')).toBe(false);
    expect(state.logs().some((log) => log.source === 'STOP_LOSS')).toBe(true);
    expect(await state.paperBroker.getPositions()).toEqual([]);
  });

  it('does not erase protected local cost state when the broker returns no positions', async () => {
    const { state, session } = createSession('user-a');
    state.posTrack.set('AAPL', { qty: 10, avgCost: 100 });
    await session.start({ symbols: ['AAPL'] }, { runImmediately: false });

    await session.runTick();

    expect(state.posTrack.get('AAPL')).toEqual({ qty: 10, avgCost: 100 });
    expect(state.logs().some((log) => log.message.includes('空庫存'))).toBe(true);
  });

  it('keeps logs scoped to the owning session', async () => {
    const a = createSession('user-a', {
      analyze: async () => ({ action: 'HOLD', confidence: 0, price: 101 }),
    });
    const b = createSession('user-b');
    await a.session.start({ symbols: ['AAPL'] }, { runImmediately: false });
    await b.session.start({ symbols: ['MSFT'] }, { runImmediately: false });

    await a.session.runTick();

    expect(a.state.logs().some((log) => log.symbol === 'AAPL')).toBe(true);
    expect(b.state.logs().some((log) => log.symbol === 'AAPL')).toBe(false);
  });

  it('liquidates only the owning paper broker when the kill switch fires', async () => {
    const a = createSession('user-a');
    const b = createSession('user-b');
    for (const item of [a, b]) {
      await item.state.paperBroker.connect({} as never);
      await item.state.paperBroker.placeOrder({
        symbol: 'AAPL',
        side: 'BUY',
        qty: 2,
        price: 100,
        orderType: 'LIMIT',
        marketType: 'US_STOCK',
      });
      item.state.posTrack.set('AAPL', { qty: 2, avgCost: 100 });
    }

    await a.session.emergencyKillSwitch();

    expect(a.state.paperBroker.exportState().positions).toEqual([]);
    expect(a.state.posTrack.size).toBe(0);
    expect(b.state.paperBroker.exportState().positions).toHaveLength(1);
    expect(b.state.riskManager.isKillSwitchActive()).toBe(false);
  });
});
