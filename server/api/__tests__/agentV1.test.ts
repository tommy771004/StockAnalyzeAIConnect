import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentAdminRouter,
  createAgentAuditAdminRouter,
  createAgentV1Router,
} from '../agentV1.js';

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

const principal = {
  tokenId: 'token-1',
  userId: 'user-1',
  prefix: 'hagt_ab12cd34',
  scopes: ['R', 'W', 'B', 'T'],
  allowedMarkets: ['us_stock'],
  allowedInstruments: ['AAPL'],
  paperOnly: true,
  rateLimitPerMinute: 60,
};

describe('agent token administration', () => {
  it('shows plaintext only in the create response', async () => {
    const createToken = vi.fn(async () => ({
      token: {
        id: 'token-1',
        prefix: 'hagt_ab12cd34',
        name: 'Bot',
        scopes: ['R'],
        expiresAt: '2026-12-31T00:00:00.000Z',
        allowedMarkets: [],
        allowedInstruments: [],
        paperOnly: true,
      },
      plaintext: 'hagt_ab12cd34_once-only-secret',
    }));
    const listTokens = vi.fn(async () => [{
      id: 'token-1',
      prefix: 'hagt_ab12cd34',
      name: 'Bot',
      scopes: ['R'],
      expiresAt: '2026-12-31T00:00:00.000Z',
      allowedMarkets: [],
      allowedInstruments: [],
      paperOnly: true,
    }]);
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
      (request as any).userId = 'user-1';
      next();
    });
    app.use('/api/agent/v1/tokens', createAgentAdminRouter({
      createToken,
      listTokens,
      revokeToken: vi.fn(),
    } as never));
    const baseUrl = await listen(app);

    const created = await fetch(`${baseUrl}/api/agent/v1/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bot',
        scopes: ['R'],
        expiresAt: '2026-12-31T00:00:00.000Z',
      }),
    });
    const listed = await fetch(`${baseUrl}/api/agent/v1/tokens`);

    expect((await created.json()).plaintext).toBe('hagt_ab12cd34_once-only-secret');
    expect(JSON.stringify(await listed.json())).not.toContain('once-only-secret');
    expect(createToken).toHaveBeenCalledWith('user-1', expect.objectContaining({
      name: 'Bot',
      scopes: ['R'],
    }));
  });

  it('lists the current user audit trail through browser authentication', async () => {
    const listAuditEvents = vi.fn(async () => [{
      id: 1,
      userId: 'user-1',
      tokenPrefix: 'hagt_ab12cd34',
      route: '/api/agent/v1/backtests',
      status: 'success',
    }]);
    const app = express();
    app.use((request, _response, next) => {
      (request as any).userId = 'user-1';
      next();
    });
    app.use('/api/agent/v1/audit', createAgentAuditAdminRouter({
      listAuditEvents,
    } as never));
    const baseUrl = await listen(app);

    const response = await fetch(`${baseUrl}/api/agent/v1/audit?limit=25`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ route: '/api/agent/v1/backtests' }),
    ]);
    expect(listAuditEvents).toHaveBeenCalledWith('user-1', 25);
  });
});

describe('external agent v1 routes', () => {
  it('executes an idempotent backtest once and audits it', async () => {
    const execute = vi.fn(async () => ({
      toolName: 'execute_backtest',
      toolVersion: '1',
      data: { jobId: 'job-1', status: 'queued' },
      evidence: [{
        id: 'E1',
        title: 'job',
        content: '{"jobId":"job-1"}',
        source: {
          providerId: 'hermes-strategy-runtime',
          providerVersion: '1',
          retrievedAt: '2026-01-02T00:00:00.000Z',
          marketTimestamp: '2026-01-02T00:00:00.000Z',
          delayed: false,
        },
      }],
      warnings: [],
    }));
    const completeIdempotency = vi.fn(async () => undefined);
    const appendAudit = vi.fn(async () => undefined);
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
      (request as any).agent = principal;
      next();
    });
    app.use('/api/agent/v1', createAgentV1Router({
      tools: {
        describe: () => ({
          name: 'execute_backtest',
          version: '1',
          description: 'backtest',
          riskClass: 'backtest',
          requiredScopes: ['B'],
          inputSchema: {},
        }),
        execute,
        openRouterTools: () => [],
      } as never,
      beginIdempotency: async () => ({
        kind: 'started',
        record: { id: 'idem-1' },
      }) as never,
      completeIdempotency,
      failIdempotency: vi.fn(),
      appendAudit,
      getBacktestJob: vi.fn(),
    }));
    const baseUrl = await listen(app);

    const response = await fetch(`${baseUrl}/api/agent/v1/backtests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'backtest-0001',
      },
      body: JSON.stringify({
        ticker: 'AAPL',
        strategyVersionId: 'version-1',
      }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      result: { data: { jobId: 'job-1', status: 'queued' } },
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(completeIdempotency).toHaveBeenCalledWith(expect.objectContaining({
      id: 'idem-1',
      responseStatus: 202,
      resourceIds: ['job-1'],
    }));
    expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      riskClass: 'backtest',
      tokenPrefix: 'hagt_ab12cd34',
    }));
  });

  it('denies live intent before tool execution', async () => {
    const execute = vi.fn();
    const appendAudit = vi.fn();
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
      (request as any).agent = principal;
      next();
    });
    app.use('/api/agent/v1', createAgentV1Router({
      tools: {
        describe: () => ({
          name: 'execute_backtest',
          version: '1',
          description: 'backtest',
          riskClass: 'backtest',
          requiredScopes: ['B'],
          inputSchema: {},
        }),
        execute,
        openRouterTools: () => [],
      } as never,
      beginIdempotency: vi.fn(),
      completeIdempotency: vi.fn(),
      failIdempotency: vi.fn(),
      appendAudit,
      getBacktestJob: vi.fn(),
    }));
    const baseUrl = await listen(app);

    const response = await fetch(`${baseUrl}/api/agent/v1/backtests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'backtest-live-1',
      },
      body: JSON.stringify({
        ticker: 'AAPL',
        strategyVersionId: 'version-1',
        mode: 'real',
      }),
    });

    expect(response.status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
    expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'denied',
      riskClass: 'backtest',
    }));
  });

  it('replays a completed idempotent response without executing again', async () => {
    const execute = vi.fn();
    const appendAudit = vi.fn(async () => undefined);
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
      (request as any).agent = principal;
      next();
    });
    app.use('/api/agent/v1', createAgentV1Router({
      tools: {
        describe: () => ({
          name: 'execute_backtest',
          version: '1',
          description: 'backtest',
          riskClass: 'backtest',
          requiredScopes: ['B'],
          inputSchema: {},
        }),
        execute,
        openRouterTools: () => [],
      } as never,
      beginIdempotency: async () => ({
        kind: 'replay',
        responseStatus: 202,
        responseBody: { result: { data: { jobId: 'job-existing' } } },
      }),
      completeIdempotency: vi.fn(),
      failIdempotency: vi.fn(),
      appendAudit,
      getBacktestJob: vi.fn(),
    } as never));
    const baseUrl = await listen(app);

    const response = await fetch(`${baseUrl}/api/agent/v1/backtests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'backtest-replay-1',
      },
      body: JSON.stringify({
        ticker: 'AAPL',
        strategyVersionId: 'version-1',
      }),
    });

    expect(response.status).toBe(202);
    expect(execute).not.toHaveBeenCalled();
    expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      riskClass: 'backtest',
      metadata: expect.objectContaining({ replay: true }),
    }));
  });

  it('streams only the authenticated user terminal backtest state', async () => {
    const getBacktestJob = vi.fn(async (userId, jobId) => (
      userId === 'user-1' && jobId === 'job-1'
        ? { id: 'job-1', status: 'completed', result: { roi: 12 } }
        : null
    ));
    const app = express();
    app.use((request, _response, next) => {
      (request as any).agent = principal;
      next();
    });
    const appendAudit = vi.fn(async () => undefined);
    app.use('/api/agent/v1', createAgentV1Router({
      tools: {} as never,
      beginIdempotency: vi.fn(),
      completeIdempotency: vi.fn(),
      failIdempotency: vi.fn(),
      appendAudit,
      getBacktestJob,
    }));
    const baseUrl = await listen(app);

    const readResponse = await fetch(`${baseUrl}/api/agent/v1/backtests/job-1`);
    const response = await fetch(`${baseUrl}/api/agent/v1/backtests/job-1/events`);
    const text = await response.text();

    expect(readResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expect(text).toContain('event: status');
    expect(text).toContain('"status":"completed"');
    expect(getBacktestJob).toHaveBeenCalledWith('user-1', 'job-1');
    expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      riskClass: 'read',
      route: '/api/agent/v1/backtests/job-1/events',
    }));
    expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      riskClass: 'read',
      route: '/api/agent/v1/backtests/job-1',
    }));
  });
});
