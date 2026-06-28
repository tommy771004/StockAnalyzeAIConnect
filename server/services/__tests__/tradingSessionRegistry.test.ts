import { describe, expect, it, vi } from 'vitest';

import { TradingSessionRegistry } from '../TradingSessionRegistry.js';
import { TradingSessionState, type TradingSessionSnapshot } from '../tradingSessionState.js';

class MemorySessionRepo {
  readonly snapshots = new Map<string, TradingSessionSnapshot>();
  readonly configs = new Map<string, unknown>();

  async saveConfig(userId: string, config: unknown, status: string) {
    this.configs.set(userId, { config, status });
  }

  async saveSessionSnapshot(snapshot: TradingSessionSnapshot) {
    this.snapshots.set(snapshot.userId, structuredClone(snapshot));
  }

  async getAllActiveSessionSnapshots() {
    return Array.from(this.snapshots.values())
      .filter((snapshot) => snapshot.status === 'running' || snapshot.status === 'cooldown')
      .map((snapshot) => structuredClone(snapshot));
  }
}

describe('TradingSessionRegistry isolation', () => {
  it('runs, trades, and stops two users independently', async () => {
    const repo = new MemorySessionRepo();
    const registry = new TradingSessionRegistry({
      repo,
      isMarketOpen: () => true,
      analyze: async ({ userId }) => ({
        action: 'BUY',
        confidence: 100,
        price: userId === 'user-a' ? 100 : 200,
      }),
    });

    await registry.start('user-a', {
      symbols: ['AAPL'],
      params: { maxAllocationPerTrade: 0.01 },
    }, { runImmediately: false });
    await registry.start('user-b', {
      symbols: ['MSFT'],
      params: { maxAllocationPerTrade: 0.01 },
    }, { runImmediately: false });
    await Promise.all([
      registry.require('user-a').runTick(),
      registry.require('user-b').runTick(),
    ]);

    expect(registry.require('user-a').state.posTrack.has('AAPL')).toBe(true);
    expect(registry.require('user-a').state.posTrack.has('MSFT')).toBe(false);
    expect(registry.require('user-b').state.posTrack.has('MSFT')).toBe(true);
    expect(registry.require('user-b').state.posTrack.has('AAPL')).toBe(false);

    registry.stop('user-a');
    expect(registry.require('user-a').state.status).toBe('stopped');
    expect(registry.require('user-b').state.status).toBe('running');
  });
});

describe('TradingSessionRegistry recovery', () => {
  it('restores every running and cooldown session with broker and risk state', async () => {
    vi.useFakeTimers();
    try {
      const repo = new MemorySessionRepo();
      const running = new TradingSessionState('user-running');
      running.status = 'running';
      running.posTrack.set('AAPL', { qty: 10, avgCost: 100 });
      running.lossStreakCount = 2;
      running.riskManager.restoreDailyState({ dailyLoss: 25_000 });
      await running.paperBroker.connect({} as never);
      await running.paperBroker.placeOrder({
        symbol: 'AAPL',
        side: 'BUY',
        qty: 10,
        price: 100,
        orderType: 'LIMIT',
        marketType: 'US_STOCK',
      });

      const cooldown = new TradingSessionState('user-cooldown');
      cooldown.status = 'cooldown';
      cooldown.cooldownUntil = new Date(Date.now() + 60_000).toISOString();
      cooldown.posTrack.set('MSFT', { qty: 4, avgCost: 200 });
      cooldown.peakPriceTrack.set('MSFT', 220);
      cooldown.riskManager.restoreDailyState({
        dailyLoss: 50_000,
        killSwitchActive: true,
      });
      repo.snapshots.set(running.userId, running.snapshot());
      repo.snapshots.set(cooldown.userId, cooldown.snapshot());

      const registry = new TradingSessionRegistry({ repo });
      await registry.restoreAll({ runImmediately: false });

      expect(registry.size).toBe(2);
      expect(registry.require('user-running').state.posTrack.get('AAPL'))
        .toEqual({ qty: 10, avgCost: 100 });
      expect(registry.require('user-running').state.lossStreakCount).toBe(2);
      expect(registry.require('user-running').state.riskManager.getStats().dailyLoss).toBe(25_000);
      expect(registry.require('user-cooldown').state.status).toBe('cooldown');
      expect(registry.require('user-cooldown').state.peakPriceTrack.get('MSFT')).toBe(220);
      expect(registry.require('user-cooldown').state.riskManager.isKillSwitchActive()).toBe(true);
      expect(await registry.require('user-running').state.paperBroker.getPositions()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an invalid persisted snapshot instead of crossing user boundaries', async () => {
    const repo = new MemorySessionRepo();
    const snapshot = new TradingSessionState('user-a').snapshot();
    repo.snapshots.set('row-user-a', { ...snapshot, userId: '', status: 'running' });
    const registry = new TradingSessionRegistry({ repo });

    await expect(registry.restoreAll()).rejects.toThrow('userId');
    expect(registry.size).toBe(0);
  });
});
