import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_AGENT_CONFIG, DEFAULT_SLIPPAGE_BPS } from '../autotradingDefaults.js';
import { AutonomousTradingSession } from '../AutonomousTradingSession.js';
import type { IBrokerAdapter, Order } from '../brokers/BrokerAdapter.js';
import { SimulatedAdapter } from '../brokers/SimulatedAdapter.js';
import { OrderExecutor } from '../orderExecutor.js';
import { TradingSessionState } from '../tradingSessionState.js';
import { applySlippage, computeTwStockFees } from '../twFees.js';

describe('paper/backtest execution assumptions', () => {
  it('applies the shared market slippage and Taiwan fee model to paper fills', async () => {
    const broker = new SimulatedAdapter();
    await broker.connect({} as never);
    const result = await broker.placeOrder({
      symbol: '2330.TW',
      side: 'BUY',
      qty: 1_000,
      price: 100,
      orderType: 'MARKET',
      marketType: 'TW_STOCK',
    });
    const expectedFill = applySlippage(100, 'BUY', DEFAULT_SLIPPAGE_BPS);
    const expectedFees = computeTwStockFees(expectedFill * 1_000, { side: 'BUY' });

    expect(result.filledPrice).toBe(expectedFill);
    expect(broker.exportState().balance).toBe(
      10_000_000 - expectedFill * 1_000 - expectedFees.totalFee,
    );
  });

  it('blocks stale market evidence before creating a paper order', async () => {
    const state = new TradingSessionState('user-a');
    const session = new AutonomousTradingSession(state, {
      isMarketOpen: () => true,
      analyze: async () => ({
        action: 'BUY',
        confidence: 100,
        price: 100,
        marketTimestamp: '2020-01-01T00:00:00.000Z',
        dataProvenance: {
          providerId: 'test-feed',
          retrievedAt: '2020-01-01T00:00:00.000Z',
          delayed: false,
        },
      }),
    });
    await session.start({ symbols: ['AAPL'] }, { runImmediately: false });

    await session.runTick();

    expect(state.paperBroker.exportState().positions).toEqual([]);
    expect(state.logs().some((log) => log.source === 'STALE_DATA')).toBe(true);
  });

  it('carries user, strategy version, decision, evidence, and provider provenance into lifecycle events', async () => {
    const state = new TradingSessionState('user-a');
    state.config.strategyVersionId = 'version-1';
    const events: Array<{ type: string; data: any }> = [];
    const session = new AutonomousTradingSession(state, {
      isMarketOpen: () => true,
      analyze: async () => ({
        action: 'BUY',
        confidence: 100,
        price: 100,
        decisionId: 'decision-1',
        evidenceIds: ['E1'],
        marketTimestamp: new Date().toISOString(),
        dataProvenance: {
          providerId: 'test-feed',
          retrievedAt: new Date().toISOString(),
          delayed: false,
        },
      }),
      publish: (event) => events.push(event),
    });
    await session.start({
      symbols: ['AAPL'],
      params: { maxAllocationPerTrade: 0.01 },
    }, { runImmediately: false });

    await session.runTick();

    const lifecycle = events.find((event) => event.type === 'order_lifecycle');
    expect(lifecycle?.data).toEqual(expect.objectContaining({
      userId: 'user-a',
      strategyVersionId: 'version-1',
      decisionId: 'decision-1',
      evidenceIds: ['E1'],
      dataProvenance: expect.objectContaining({ providerId: 'test-feed' }),
    }));
  });

  it('rejects a duplicate broker order id', async () => {
    const placeOrder = vi.fn(async (order: Order) => ({
      orderId: 'DUPLICATE',
      status: 'FILLED' as const,
      filledQty: order.qty,
      filledPrice: order.price ?? 100,
      timestamp: Date.now(),
    }));
    const broker: IBrokerAdapter = {
      brokerId: 'fake',
      isConnected: true,
      connect: async () => ({ ok: true, message: 'ok' }),
      disconnect: async () => undefined,
      getBalance: async () => ({
        totalAssets: 1_000_000,
        availableMargin: 1_000_000,
        usedMargin: 0,
        dailyPnl: 0,
        currency: 'TWD',
      }),
      placeOrder,
      cancelOrder: async () => ({ ok: true }),
      getPositions: async () => [],
      getOpenOrders: async () => [],
    };
    const lifecycle: any[] = [];
    const executor = new OrderExecutor(
      broker,
      broker,
      vi.fn(),
      (event) => lifecycle.push(event),
      { enableCopyTrading: false },
    );
    const context = {
      userId: 'user-a',
      strategyVersionId: 'version-1',
      decisionId: 'decision-1',
      evidenceIds: ['E1'],
      dataProvenance: {
        providerId: 'test',
        retrievedAt: new Date().toISOString(),
        delayed: false,
      },
    };

    await expect(executor.executeTrade(
      { ...structuredClone(DEFAULT_AGENT_CONFIG), userId: 'user-a' },
      { symbol: 'AAPL', side: 'BUY', qty: 1, price: 100 },
      context,
    )).resolves.toEqual(expect.objectContaining({ status: 'FILLED' }));
    await expect(executor.executeTrade(
      { ...structuredClone(DEFAULT_AGENT_CONFIG), userId: 'user-a' },
      { symbol: 'AAPL', side: 'BUY', qty: 1, price: 100 },
      context,
    )).resolves.toBeNull();
    expect(lifecycle.at(-1)).toEqual(expect.objectContaining({
      status: 'REJECTED',
      message: expect.stringContaining('duplicate'),
    }));
  });
});
