import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { createDataSourcesRouter } from '../dataSources.js';

const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

describe('data source health API', () => {
  it('returns sanitized provider and cache health', async () => {
    const app = express();
    app.use('/api', createDataSourcesRouter({
      health: () => ({
        providers: [{
          id: 'yahoo',
          version: '1',
          operations: ['quote'],
          markets: ['us_stock'],
          breaker: 'closed',
          rateRemaining: 89,
          lastSuccessAt: '2026-01-02T00:00:00.000Z',
          apiKey: 'must-not-leak',
          lastError: 'raw upstream body',
        }],
        cache: {
          entries: 2,
          hits: 4,
          misses: 1,
          evictions: 0,
          internalKeys: ['secret'],
        },
      }),
    } as never));
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/data-sources/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      providers: [{
        id: 'yahoo',
        version: '1',
        operations: ['quote'],
        markets: ['us_stock'],
        breaker: 'closed',
        rateRemaining: 89,
        lastSuccessAt: '2026-01-02T00:00:00.000Z',
      }],
      cache: {
        entries: 2,
        hits: 4,
        misses: 1,
        evictions: 0,
      },
    });
    expect(JSON.stringify(body)).not.toContain('must-not-leak');
    expect(JSON.stringify(body)).not.toContain('raw upstream body');
  });
});
