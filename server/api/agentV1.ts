import { Router, type Response } from 'express';
import { z } from 'zod';

import type { AuthRequest } from '../middleware/auth.js';
import type { AgentRequest } from '../middleware/agentAuth.js';
import type { AgentToolRegistry } from '../ai/toolRegistry.js';
import {
  assertPaperOnlyRequest,
  requireAgentIdempotencyKey,
  requireAgentScopes,
  AgentPolicyError,
  type AgentPrincipal,
} from '../services/agentPolicy.js';
import {
  appendAgentAuditEvent,
  beginAgentIdempotency,
  completeAgentIdempotency,
  createAgentToken,
  failAgentIdempotency,
  listAgentAuditEvents,
  listAgentTokens,
  revokeAgentToken,
} from '../repositories/agentGatewayRepo.js';
import { stableJsonHash } from '../utils/hash.js';
import { createDefaultAgentTools } from '../ai/defaultTools.js';
import { getDataRegistry } from '../data/configure.js';
import * as positionsRepo from '../repositories/positionsRepo.js';
import * as tradesRepo from '../repositories/tradesRepo.js';
import { queueAgentBacktest } from '../services/agentBacktestTool.js';
import { getStrategyRuntimeService } from '../services/strategyRuntimeService.js';
import type { ToolRiskClass } from '../ai/contracts.js';
import {
  inspectPaperOrders,
  inspectPaperSession,
  startPaperStrategy,
  stopPaperStrategy,
} from '../services/paperSessionTools.js';

interface AgentAdminDependencies {
  createToken: typeof createAgentToken;
  listTokens: typeof listAgentTokens;
  revokeToken: typeof revokeAgentToken;
}

const CreateTokenBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(['R', 'W', 'B', 'T', 'A'])).min(1).max(5),
  expiresAt: z.string().datetime({ offset: true }),
  allowedMarkets: z.array(z.string()).max(6).default([]),
  allowedInstruments: z.array(z.string()).max(500).default([]),
  rateLimitPerMinute: z.number().int().positive().max(10_000).default(60),
});

export function createAgentAdminRouter(
  dependencies: AgentAdminDependencies,
): Router {
  const router = Router();
  router.post('/', async (request: AuthRequest, response) => {
    if (!request.userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const input = CreateTokenBodySchema.parse(request.body);
      response.status(201).json(await dependencies.createToken(request.userId, input));
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 500;
      response.status(status).json({
        error: status === 400 ? 'Invalid agent token request' : 'Token creation failed',
      });
    }
  });

  router.get('/', async (request: AuthRequest, response) => {
    if (!request.userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
    response.json(await dependencies.listTokens(request.userId));
  });

  router.delete('/:tokenId', async (request: AuthRequest, response) => {
    if (!request.userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const revoked = await dependencies.revokeToken(
      request.userId,
      String(request.params.tokenId),
    );
    response.status(revoked ? 204 : 404).end();
  });
  return router;
}

interface AgentAuditAdminDependencies {
  listAuditEvents: typeof listAgentAuditEvents;
}

export function createAgentAuditAdminRouter(
  dependencies: AgentAuditAdminDependencies,
): Router {
  const router = Router();
  router.get('/', async (request: AuthRequest, response) => {
    if (!request.userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const parsedLimit = Number(request.query.limit ?? 100);
    const limit = Number.isInteger(parsedLimit)
      ? Math.max(1, Math.min(500, parsedLimit))
      : 100;
    response.json(await dependencies.listAuditEvents(request.userId, limit));
  });
  return router;
}

interface AgentV1Dependencies {
  tools: Pick<AgentToolRegistry, 'describe' | 'execute' | 'openRouterTools'>;
  beginIdempotency: typeof beginAgentIdempotency;
  completeIdempotency: typeof completeAgentIdempotency;
  failIdempotency: typeof failAgentIdempotency;
  appendAudit: typeof appendAgentAuditEvent;
  getBacktestJob(userId: string, jobId: string): Promise<unknown | null>;
}

function requirePrincipal(request: AgentRequest): AgentPrincipal {
  if (!request.agent) throw new AgentPolicyError('Agent principal is missing');
  return request.agent;
}

function routePath(request: AgentRequest): string {
  return request.originalUrl.split('?')[0] ?? '/api/agent/v1/unknown';
}

function resourceIds(result: unknown): string[] {
  const data = result && typeof result === 'object'
    ? (result as { data?: unknown }).data
    : undefined;
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  return [record.jobId, record.id, record.sessionId]
    .filter((value): value is string => typeof value === 'string');
}

function errorStatus(error: unknown): number {
  if (error instanceof z.ZodError) return 400;
  if (error instanceof AgentPolicyError) return 403;
  if (error instanceof Error && error.name === 'IdempotencyConflictError') return 409;
  if (error instanceof Error && error.message.startsWith('Unknown agent tool')) return 404;
  return 500;
}

export function createAgentV1Router(
  dependencies: AgentV1Dependencies,
): Router {
  const router = Router();

  const executeTool = async (
    request: AgentRequest,
    response: Response,
    toolName: string,
    args: Record<string, unknown>,
    successStatus = 200,
  ) => {
    const startedAt = Date.now();
    let principal: AgentPrincipal | undefined;
    let requestHash = '0'.repeat(64);
    let idempotencyRecordId: string | undefined;
    let riskClass: ToolRiskClass = 'read';
    let toolVersion: string | undefined;
    try {
      principal = requirePrincipal(request);
      const definition = dependencies.tools.describe(toolName);
      riskClass = definition.riskClass;
      toolVersion = definition.version;
      requestHash = await stableJsonHash({
        route: routePath(request),
        toolName,
        args,
      });
      requireAgentScopes(principal, definition.requiredScopes);
      assertPaperOnlyRequest(principal, args);

      const idempotencyKey = requireAgentIdempotencyKey(
        definition.riskClass,
        request.header('idempotency-key'),
      );
      if (idempotencyKey) {
        const resolution = await dependencies.beginIdempotency({
          tokenId: principal.tokenId,
          userId: principal.userId,
          key: idempotencyKey,
          route: routePath(request),
          requestHash,
        });
        if (resolution.kind === 'replay') {
          await dependencies.appendAudit({
            tokenId: principal.tokenId,
            tokenPrefix: principal.prefix,
            userId: principal.userId,
            route: routePath(request),
            riskClass,
            requestHash,
            status: 'success',
            latencyMs: Date.now() - startedAt,
            toolVersion,
            resourceIds: [],
            metadata: { toolName, replay: true },
          });
          response.status(resolution.responseStatus).json(resolution.responseBody);
          return;
        }
        if (resolution.kind !== 'started') {
          await dependencies.appendAudit({
            tokenId: principal.tokenId,
            tokenPrefix: principal.prefix,
            userId: principal.userId,
            route: routePath(request),
            riskClass,
            requestHash,
            status: 'denied',
            latencyMs: Date.now() - startedAt,
            toolVersion,
            resourceIds: [],
            metadata: { toolName, idempotencyState: resolution.kind },
          });
          response.status(409).json({ error: 'Agent request is already in progress or failed' });
          return;
        }
        idempotencyRecordId = resolution.record.id;
      }

      const result = await dependencies.tools.execute(toolName, args, {
        userId: principal.userId,
        scopes: [...principal.scopes],
        paperOnly: true,
        allowedMarkets: [...principal.allowedMarkets],
        allowedInstruments: [...principal.allowedInstruments],
      });
      const body = { result };
      const ids = resourceIds(result);
      if (idempotencyRecordId) {
        await dependencies.completeIdempotency({
          id: idempotencyRecordId,
          tokenId: principal.tokenId,
          userId: principal.userId,
          responseStatus: successStatus,
          responseBody: body,
          resourceIds: ids,
        });
      }
      await dependencies.appendAudit({
        tokenId: principal.tokenId,
        tokenPrefix: principal.prefix,
        userId: principal.userId,
        route: routePath(request),
        riskClass,
        requestHash,
        status: 'success',
        latencyMs: Date.now() - startedAt,
        toolVersion,
        resourceIds: ids,
        metadata: { toolName },
      });
      response.status(successStatus).json(body);
    } catch (error) {
      const status = errorStatus(error);
      if (principal && idempotencyRecordId) {
        await Promise.resolve(dependencies.failIdempotency({
          id: idempotencyRecordId,
          tokenId: principal.tokenId,
          userId: principal.userId,
          responseStatus: status,
          responseBody: { error: 'Agent request failed' },
        })).catch(() => undefined);
      }
      if (principal) {
        await Promise.resolve(dependencies.appendAudit({
          tokenId: principal.tokenId,
          tokenPrefix: principal.prefix,
          userId: principal.userId,
          route: routePath(request),
          riskClass,
          requestHash,
          status: status === 403 ? 'denied'
            : status === 400 ? 'validation_error'
              : 'server_error',
          latencyMs: Date.now() - startedAt,
          toolVersion,
          resourceIds: [],
          metadata: { toolName },
        })).catch(() => undefined);
      }
      response.status(status).json({
        error: status === 403 ? (error as Error).message : 'Agent request failed',
      });
    }
  };

  router.get('/tools', (request: AgentRequest, response) => {
    try {
      const principal = requirePrincipal(request);
      response.json({
        tools: dependencies.tools.openRouterTools([...principal.scopes]),
      });
    } catch {
      response.status(401).json({ error: 'Invalid agent token' });
    }
  });

  router.post('/tools/:name', (request: AgentRequest, response) => {
    void executeTool(
      request,
      response,
      String(request.params.name),
      request.body ?? {},
    );
  });
  router.post('/strategy-drafts', (request: AgentRequest, response) => {
    void executeTool(request, response, 'create_strategy_draft', request.body ?? {}, 201);
  });
  router.post('/strategy-versions/:versionId/validate', (
    request: AgentRequest,
    response,
  ) => {
    void executeTool(request, response, 'validate_strategy', {
      strategyVersionId: String(request.params.versionId),
    });
  });
  router.post('/backtests', (request: AgentRequest, response) => {
    void executeTool(request, response, 'execute_backtest', request.body ?? {}, 202);
  });
  router.post('/paper-sessions', (request: AgentRequest, response) => {
    void executeTool(request, response, 'start_paper_strategy', request.body ?? {}, 201);
  });
  router.delete('/paper-sessions/current', (request: AgentRequest, response) => {
    void executeTool(request, response, 'stop_paper_strategy', {});
  });
  router.get('/paper-sessions/current', (request: AgentRequest, response) => {
    void executeTool(request, response, 'inspect_paper_session', {});
  });
  router.get('/paper-sessions/current/orders', (request: AgentRequest, response) => {
    void executeTool(request, response, 'inspect_paper_orders', {});
  });

  router.get('/backtests/:jobId', async (request: AgentRequest, response) => {
    const startedAt = Date.now();
    let principal: AgentPrincipal | undefined;
    let requestHash = '0'.repeat(64);
    try {
      principal = requirePrincipal(request);
      requireAgentScopes(principal, ['R']);
      requestHash = await stableJsonHash({
        route: routePath(request),
        jobId: String(request.params.jobId),
      });
      const job = await dependencies.getBacktestJob(
        principal.userId,
        String(request.params.jobId),
      );
      if (!job) {
        await dependencies.appendAudit({
          tokenId: principal.tokenId,
          tokenPrefix: principal.prefix,
          userId: principal.userId,
          route: routePath(request),
          riskClass: 'read',
          requestHash,
          status: 'denied',
          latencyMs: Date.now() - startedAt,
          resourceIds: [],
          metadata: { reason: 'not_found' },
        });
        response.status(404).json({ error: 'Backtest job not found' });
        return;
      }
      await dependencies.appendAudit({
        tokenId: principal.tokenId,
        tokenPrefix: principal.prefix,
        userId: principal.userId,
        route: routePath(request),
        riskClass: 'read',
        requestHash,
        status: 'success',
        latencyMs: Date.now() - startedAt,
        resourceIds: [String(request.params.jobId)],
        metadata: { transport: 'json' },
      });
      response.json(job);
    } catch (error) {
      const status = errorStatus(error);
      if (principal) {
        await Promise.resolve(dependencies.appendAudit({
          tokenId: principal.tokenId,
          tokenPrefix: principal.prefix,
          userId: principal.userId,
          route: routePath(request),
          riskClass: 'read',
          requestHash,
          status: status === 403 ? 'denied' : 'server_error',
          latencyMs: Date.now() - startedAt,
          resourceIds: [],
          metadata: {},
        })).catch(() => undefined);
      }
      response.status(status === 500 ? 500 : status).json({
        error: status === 403 ? (error as Error).message : 'Agent request failed',
      });
    }
  });

  router.get('/backtests/:jobId/events', async (
    request: AgentRequest,
    response,
  ) => {
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      const principal = requirePrincipal(request);
      requireAgentScopes(principal, ['R']);
      const startedAt = Date.now();
      const requestHash = await stableJsonHash({
        route: routePath(request),
        jobId: String(request.params.jobId),
      });
      let audited = false;
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const poll = async () => {
        const job = await dependencies.getBacktestJob(
          principal.userId,
          String(request.params.jobId),
        ) as { status?: string } | null;
        if (!job) {
          response.write('event: error\ndata: {"error":"Backtest job not found"}\n\n');
          if (timer) clearInterval(timer);
          response.end();
          return;
        }
        response.write(`event: status\ndata: ${JSON.stringify(job)}\n\n`);
        if (!audited) {
          audited = true;
          await Promise.resolve(dependencies.appendAudit({
            tokenId: principal.tokenId,
            tokenPrefix: principal.prefix,
            userId: principal.userId,
            route: routePath(request),
            riskClass: 'read',
            requestHash,
            status: 'success',
            latencyMs: Date.now() - startedAt,
            resourceIds: [String(request.params.jobId)],
            metadata: { transport: 'sse' },
          })).catch(() => undefined);
        }
        if (['completed', 'failed'].includes(String(job.status))) {
          if (timer) clearInterval(timer);
          response.end();
        }
      };
      await poll();
      if (!response.writableEnded) timer = setInterval(() => void poll(), 1_000);
      request.on('close', () => {
        if (timer) clearInterval(timer);
      });
    } catch {
      if (timer) clearInterval(timer);
      if (!response.headersSent) {
        response.status(401).json({ error: 'Invalid agent token' });
      } else {
        response.end();
      }
    }
  });

  return router;
}

export const agentAdminRouter = createAgentAdminRouter({
  createToken: createAgentToken,
  listTokens: listAgentTokens,
  revokeToken: revokeAgentToken,
});

export const agentAuditAdminRouter = createAgentAuditAdminRouter({
  listAuditEvents: listAgentAuditEvents,
});

const defaultAgentV1Tools = createDefaultAgentTools({
  resolveData: (request) => getDataRegistry().resolve(request),
  getPortfolio: positionsRepo.getPositionsByUser,
  getTrades: tradesRepo.getTradesByUser,
  getDataHealth: () => getDataRegistry().health(),
  queueBacktest: (userId, args) => queueAgentBacktest(userId, args),
  createStrategyVersion: (userId, strategyId, command) => (
    getStrategyRuntimeService().createVersion(userId, strategyId, command)
  ),
  validateStrategyVersion: (userId, versionId) => (
    getStrategyRuntimeService().validateVersion(userId, versionId)
  ),
  getBacktestJob: (userId, jobId) => (
    getStrategyRuntimeService().getBacktestJob(userId, jobId)
  ),
  startPaperStrategy,
  stopPaperStrategy,
  inspectPaperSession,
  inspectPaperOrders,
});

export const agentV1Router = createAgentV1Router({
  tools: defaultAgentV1Tools,
  beginIdempotency: beginAgentIdempotency,
  completeIdempotency: completeAgentIdempotency,
  failIdempotency: failAgentIdempotency,
  appendAudit: appendAgentAuditEvent,
  getBacktestJob: (userId, jobId) => (
    getStrategyRuntimeService().getBacktestJob(userId, jobId)
  ),
});
