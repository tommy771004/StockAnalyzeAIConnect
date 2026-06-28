import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { createAutotradingSessionsRouter } from '../autotradingSessions.js';
import { TradingSessionRegistry } from '../../services/TradingSessionRegistry.js';
import type { TradingSessionSnapshot } from '../../services/tradingSessionState.js';

const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function listen(app: ReturnType<typeof express>) {
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function createRegistry() {
  const snapshots = new Map<string, TradingSessionSnapshot>();
  return new TradingSessionRegistry({
    repo: {
      saveConfig: async () => undefined,
      saveSessionSnapshot: async (snapshot) => {
        snapshots.set(snapshot.userId, structuredClone(snapshot));
      },
      getAllActiveSessionSnapshots: async () => Array.from(snapshots.values()),
    },
    analyze: async () => ({ action: 'HOLD', confidence: 0, price: 100 }),
  });
}

describe('user-scoped auto-trading routes', () => {
  it('never returns another user symbols, logs, positions, risk, or status', async () => {
    const registry = createRegistry();
    const app = express();
    app.use(express.json());
    app.use((request, response, next) => {
      const userId = request.header('x-test-user');
      if (!userId) return response.status(401).json({ error: 'Unauthorized' });
      (request as any).userId = userId;
      next();
    });
    app.use('/api/autotrading', createAutotradingSessionsRouter({ registry }));
    const baseUrl = await listen(app);

    await fetch(`${baseUrl}/api/autotrading/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'user-a' },
      body: JSON.stringify({ symbols: ['AAPL'] }),
    });
    await fetch(`${baseUrl}/api/autotrading/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'user-b' },
      body: JSON.stringify({ symbols: ['MSFT'] }),
    });
    registry.require('user-a').state.appendLog({
      level: 'INFO',
      source: 'TEST',
      symbol: 'AAPL',
      message: 'only-user-a',
    });
    await registry.require('user-a').state.paperBroker.placeOrder({
      symbol: 'AAPL',
      side: 'BUY',
      qty: 2,
      price: 100,
      orderType: 'LIMIT',
      marketType: 'US_STOCK',
    });
    registry.require('user-a').state.riskManager.activateKillSwitch();

    for (const path of ['status', 'config', 'logs', 'positions', 'balance', 'broker/status']) {
      const response = await fetch(`${baseUrl}/api/autotrading/${path}`, {
        headers: { 'x-test-user': 'user-b' },
      });
      expect(response.status).toBe(200);
      const body = JSON.stringify(await response.json());
      expect(body).not.toContain('AAPL');
      expect(body).not.toContain('only-user-a');
      expect(body).not.toContain('user-a');
    }

    const statusB = await fetch(`${baseUrl}/api/autotrading/status`, {
      headers: { 'x-test-user': 'user-b' },
    }).then((response) => response.json());
    expect(statusB.status).toBe('running');
    expect(statusB.riskStats.killSwitchActive).toBe(false);
  });

  it('scopes reset, stop, and kill-switch mutations to the authenticated user', async () => {
    const registry = createRegistry();
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
      (request as any).userId = request.header('x-test-user');
      next();
    });
    app.use('/api/autotrading', createAutotradingSessionsRouter({ registry }));
    const baseUrl = await listen(app);
    for (const userId of ['user-a', 'user-b']) {
      await registry.start(userId, undefined, { runImmediately: false });
    }

    await fetch(`${baseUrl}/api/autotrading/kill-switch`, {
      method: 'POST',
      headers: { 'x-test-user': 'user-a' },
    });
    await fetch(`${baseUrl}/api/autotrading/stop`, {
      method: 'POST',
      headers: { 'x-test-user': 'user-b' },
    });

    expect(registry.require('user-a').state.riskManager.isKillSwitchActive()).toBe(true);
    expect(registry.require('user-b').state.riskManager.isKillSwitchActive()).toBe(false);
    expect(registry.require('user-a').state.status).toBe('paused');
    expect(registry.require('user-b').state.status).toBe('stopped');
  });

  it('rejects live broker connection attempts', async () => {
    const registry = createRegistry();
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
      (request as any).userId = 'user-a';
      next();
    });
    app.use('/api/autotrading', createAutotradingSessionsRouter({ registry }));
    const baseUrl = await listen(app);

    const response = await fetch(`${baseUrl}/api/autotrading/broker/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brokerId: 'kgi', mode: 'real' }),
    });

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain('沙盒');
  });
});
