import { Router, type Response } from 'express';
import { z } from 'zod';
import type { BacktestJob, StrategyVersion } from '../../src/db/schema.js';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getStrategyRuntimeService,
  type CreateVersionCommand,
  type StartBacktestCommand,
} from '../services/strategyRuntimeService.js';
import {
  CrossSectionalConfigSchema,
  ExecutionPolicySchema,
  StrategyRuntimeSchema,
  type StrategyValidationResult,
} from '../types/strategyRuntime.js';

interface StrategyRuntimeApiService {
  createVersion(
    userId: string,
    strategyId: number,
    command: CreateVersionCommand,
  ): Promise<StrategyVersion>;
  listVersions(userId: string, strategyId: number): Promise<StrategyVersion[]>;
  validateVersion(userId: string, versionId: string): Promise<StrategyValidationResult>;
  startBacktest(userId: string, command: StartBacktestCommand): Promise<BacktestJob>;
  getBacktestJob(userId: string, jobId: string): Promise<BacktestJob | null>;
}

const VersionBodySchema = z.object({
  runtime: StrategyRuntimeSchema,
  source: z.string().min(1).max(100_000),
  parameterSchema: z.record(z.string(), z.unknown()).optional(),
  defaultParameters: z.record(z.string(), z.unknown()).optional(),
  executionPolicy: z.record(z.string(), z.unknown()).optional(),
  provenance: z.enum(['human', 'ai', 'imported']).optional(),
});

const BacktestBodySchema = z.object({
  symbol: z.string().trim().min(1).max(64).optional(),
  crossSectional: CrossSectionalConfigSchema.optional(),
  period1: z.union([z.string(), z.number()]).optional(),
  period2: z.union([z.string(), z.number()]).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  execution: ExecutionPolicySchema.partial().optional(),
}).superRefine((body, context) => {
  if (!body.symbol && !body.crossSectional) {
    context.addIssue({
      code: 'custom',
      message: 'symbol or crossSectional configuration is required',
      path: ['symbol'],
    });
  }
});

function requireUserId(req: AuthRequest, res: Response): string | null {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return req.userId;
}

function positiveId(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function routeError(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', issues: error.issues });
    return;
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  if (message === 'Strategy not found' || message === 'Strategy version not found') {
    res.status(404).json({ error: message });
    return;
  }
  if (
    message.includes('must be validated')
    || message.includes('source is required')
  ) {
    res.status(400).json({ error: message });
    return;
  }
  console.error('[StrategyRuntimeAPI]', error);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
  });
}

export function createStrategiesRouter(service: StrategyRuntimeApiService): Router {
  const router = Router();

  router.post('/strategies/:strategyId/versions', async (req: AuthRequest, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const strategyId = positiveId(String(req.params.strategyId));
    if (!strategyId) {
      res.status(400).json({ error: 'Invalid strategy id' });
      return;
    }
    try {
      const command = VersionBodySchema.parse(req.body);
      const created = await service.createVersion(userId, strategyId, command);
      res.status(201).json(created);
    } catch (error) {
      routeError(res, error);
    }
  });

  router.get('/strategies/:strategyId/versions', async (req: AuthRequest, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const strategyId = positiveId(String(req.params.strategyId));
    if (!strategyId) {
      res.status(400).json({ error: 'Invalid strategy id' });
      return;
    }
    try {
      res.json(await service.listVersions(userId, strategyId));
    } catch (error) {
      routeError(res, error);
    }
  });

  router.post('/strategy-versions/:versionId/validate', async (req: AuthRequest, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    try {
      res.json(await service.validateVersion(userId, String(req.params.versionId)));
    } catch (error) {
      routeError(res, error);
    }
  });

  router.post('/strategy-versions/:versionId/backtests', async (req: AuthRequest, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    try {
      const body = BacktestBodySchema.parse(req.body);
      const queued = await service.startBacktest(userId, {
        strategyVersionId: String(req.params.versionId),
        ...body,
      });
      res.status(202).json(queued);
    } catch (error) {
      routeError(res, error);
    }
  });

  router.get('/backtest-jobs/:jobId', async (req: AuthRequest, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    try {
      const job = await service.getBacktestJob(userId, String(req.params.jobId));
      if (!job) {
        res.status(404).json({ error: 'Backtest job not found' });
        return;
      }
      res.json(job);
    } catch (error) {
      routeError(res, error);
    }
  });

  return router;
}

const configuredServiceProxy: StrategyRuntimeApiService = {
  createVersion: (...args) => getStrategyRuntimeService().createVersion(...args),
  listVersions: (...args) => getStrategyRuntimeService().listVersions(...args),
  validateVersion: (...args) => getStrategyRuntimeService().validateVersion(...args),
  startBacktest: (...args) => getStrategyRuntimeService().startBacktest(...args),
  getBacktestJob: (...args) => getStrategyRuntimeService().getBacktestJob(...args),
};

export const strategiesRouter = createStrategiesRouter(configuredServiceProxy);
