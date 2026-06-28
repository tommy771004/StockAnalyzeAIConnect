import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStrategiesRouter } from '../strategies.js';

const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function testServer(service: Record<string, any>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = 'user-1';
    next();
  });
  app.use('/api', createStrategiesRouter(service as any));
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  return `http://127.0.0.1:${port}`;
}

describe('strategy runtime API', () => {
  it('creates a user-owned immutable strategy version', async () => {
    const createVersion = vi.fn(async () => ({
      id: 'version-1',
      strategyId: 7,
      userId: 'user-1',
      version: 1,
    }));
    const baseUrl = await testServer({
      createVersion,
      listVersions: vi.fn(),
      validateVersion: vi.fn(),
      startBacktest: vi.fn(),
      getBacktestJob: vi.fn(),
    });

    const response = await fetch(`${baseUrl}/api/strategies/7/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runtime: 'indicator',
        source: 'def run(data, params): return {"buy": [], "sell": []}',
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: 'version-1', version: 1 });
    expect(createVersion).toHaveBeenCalledWith(
      'user-1',
      7,
      expect.objectContaining({ runtime: 'indicator' }),
    );
  });

  it('returns 404 without revealing a cross-user backtest job', async () => {
    const baseUrl = await testServer({
      createVersion: vi.fn(),
      listVersions: vi.fn(),
      validateVersion: vi.fn(),
      startBacktest: vi.fn(),
      getBacktestJob: vi.fn(async () => null),
    });

    const response = await fetch(`${baseUrl}/api/backtest-jobs/other-users-job`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Backtest job not found' });
  });

  it('returns a queued job without waiting for worker completion', async () => {
    const startBacktest = vi.fn(async () => ({
      id: 'job-1',
      status: 'queued',
      userId: 'user-1',
    }));
    const baseUrl = await testServer({
      createVersion: vi.fn(),
      listVersions: vi.fn(),
      validateVersion: vi.fn(),
      startBacktest,
      getBacktestJob: vi.fn(),
    });

    const response = await fetch(`${baseUrl}/api/strategy-versions/version-1/backtests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: '2330.TW',
        execution: { initialCapital: 1_000_000 },
      }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ id: 'job-1', status: 'queued' });
    expect(startBacktest).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        strategyVersionId: 'version-1',
        symbol: '2330.TW',
      }),
    );
  });

  it('accepts a cross-sectional universe without a single-symbol shortcut', async () => {
    const startBacktest = vi.fn(async () => ({
      id: 'job-cross-1',
      status: 'queued',
      userId: 'user-1',
    }));
    const baseUrl = await testServer({
      createVersion: vi.fn(),
      listVersions: vi.fn(),
      validateVersion: vi.fn(),
      startBacktest,
      getBacktestJob: vi.fn(),
    });

    const response = await fetch(`${baseUrl}/api/strategy-versions/version-1/backtests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crossSectional: {
          symbols: ['aapl', 'msft', 'nvda'],
          portfolioSize: 2,
          longRatio: 0.5,
          rebalanceFrequency: 'weekly',
        },
      }),
    });

    expect(response.status).toBe(202);
    expect(startBacktest).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        strategyVersionId: 'version-1',
        crossSectional: {
          symbols: ['AAPL', 'MSFT', 'NVDA'],
          portfolioSize: 2,
          longRatio: 0.5,
          rebalanceFrequency: 'weekly',
        },
      }),
    );
  });
});
