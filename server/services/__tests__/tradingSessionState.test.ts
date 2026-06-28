import { describe, expect, it } from 'vitest';

import { TradingSessionState } from '../tradingSessionState.js';

describe('TradingSessionState isolation', () => {
  it('does not share mutable trading, risk, broker, log, or lock state', async () => {
    const userA = new TradingSessionState('user-a');
    const userB = new TradingSessionState('user-b');
    await userA.paperBroker.connect({} as never);
    await userB.paperBroker.connect({} as never);

    userA.config.symbols = ['AAPL'];
    userA.posTrack.set('AAPL', { qty: 10, avgCost: 100 });
    userA.peakPriceTrack.set('AAPL', 110);
    userA.lossStreakCount = 2;
    userA.riskManager.activateKillSwitch();
    userA.appendLog({
      level: 'INFO',
      source: 'TEST',
      symbol: 'AAPL',
      message: 'user-a only',
    });
    await userA.paperBroker.placeOrder({
      symbol: 'AAPL',
      side: 'BUY',
      qty: 10,
      price: 100,
      orderType: 'LIMIT',
      marketType: 'US_STOCK',
    });

    expect(userB.config.symbols).not.toContain('AAPL');
    expect(userB.posTrack.size).toBe(0);
    expect(userB.peakPriceTrack.size).toBe(0);
    expect(userB.lossStreakCount).toBe(0);
    expect(userB.riskManager.isKillSwitchActive()).toBe(false);
    expect(userB.logs()).toEqual([]);
    expect(await userB.paperBroker.getPositions()).toEqual([]);
    expect(userA.beginTick()).toBe(true);
    expect(userA.beginTick()).toBe(false);
    expect(userB.beginTick()).toBe(true);
  });
});

describe('TradingSessionState snapshots', () => {
  it('round-trips protected positions, risk, paper broker, and equity state', async () => {
    const original = new TradingSessionState('user-a');
    await original.paperBroker.connect({} as never);
    original.status = 'cooldown';
    original.posTrack.set('AAPL', { qty: 10, avgCost: 100 });
    original.peakPriceTrack.set('AAPL', 112);
    original.lossStreakCount = 3;
    original.equityHistory.push({
      timestamp: '2026-01-02T00:00:00.000Z',
      equity: 9_900_000,
    });
    original.riskManager.restoreDailyState({
      dailyLoss: 100_000,
      killSwitchActive: true,
    });
    await original.paperBroker.placeOrder({
      symbol: 'AAPL',
      side: 'BUY',
      qty: 10,
      price: 100,
      orderType: 'LIMIT',
      marketType: 'US_STOCK',
    });

    const restored = TradingSessionState.restore(original.snapshot());

    expect(restored.userId).toBe('user-a');
    expect(restored.status).toBe('cooldown');
    expect(restored.posTrack.get('AAPL')).toEqual({ qty: 10, avgCost: 100 });
    expect(restored.peakPriceTrack.get('AAPL')).toBe(112);
    expect(restored.lossStreakCount).toBe(3);
    expect(restored.riskManager.getStats().dailyLoss).toBe(100_000);
    expect(restored.riskManager.isKillSwitchActive()).toBe(true);
    expect(restored.equityHistory).toEqual(original.equityHistory);
    expect(await restored.paperBroker.getPositions()).toEqual(
      await original.paperBroker.getPositions(),
    );
  });

  it('rejects a snapshot whose user identity is missing', () => {
    const state = new TradingSessionState('user-a');
    const snapshot = { ...state.snapshot(), userId: '' };
    expect(() => TradingSessionState.restore(snapshot)).toThrow('userId');
  });

  it('rejects a snapshot whose config belongs to another user', () => {
    const state = new TradingSessionState('user-a');
    const snapshot = state.snapshot();
    snapshot.config.userId = 'user-b';
    expect(() => TradingSessionState.restore(snapshot)).toThrow('userId');
  });
});
