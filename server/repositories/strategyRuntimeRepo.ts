import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import {
  backtestJobs,
  strategies,
  strategyVersions,
  type BacktestJob,
  type StrategyVersion,
} from '../../src/db/schema.js';
import type { StrategyDiagnostic, StrategyRuntime } from '../types/strategyRuntime.js';

export type BacktestJobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type StrategyValidationStatus = 'pending' | 'valid' | 'invalid';
export type StrategyProvenance = 'human' | 'ai' | 'imported';

const ALLOWED_TRANSITIONS: Record<BacktestJobStatus, ReadonlySet<BacktestJobStatus>> = {
  queued: new Set(['running', 'failed']),
  running: new Set(['completed', 'failed']),
  completed: new Set(),
  failed: new Set(),
};

export function isBacktestTransitionAllowed(
  from: BacktestJobStatus,
  to: BacktestJobStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}

export interface CreateStrategyVersionInput {
  userId: string;
  strategyId: number;
  runtime: StrategyRuntime;
  source: string;
  sourceHash: string;
  parameterSchema?: Record<string, unknown>;
  defaultParameters?: Record<string, unknown>;
  executionPolicy?: Record<string, unknown>;
  provenance?: StrategyProvenance;
}

export async function createVersion(
  input: CreateStrategyVersionInput,
): Promise<StrategyVersion | null> {
  const owner = await db.query.strategies.findFirst({
    where: and(
      eq(strategies.id, input.strategyId),
      eq(strategies.userId, input.userId),
    ),
  });
  if (!owner) return null;

  const [created] = await db
    .insert(strategyVersions)
    .values({
      strategyId: input.strategyId,
      userId: input.userId,
      version: sql<number>`(
        SELECT COALESCE(MAX(${strategyVersions.version}), 0) + 1
        FROM ${strategyVersions}
        WHERE ${strategyVersions.strategyId} = ${input.strategyId}
      )`,
      runtime: input.runtime,
      source: input.source,
      sourceHash: input.sourceHash,
      parameterSchema: input.parameterSchema ?? {},
      defaultParameters: input.defaultParameters ?? {},
      executionPolicy: input.executionPolicy ?? {},
      provenance: input.provenance ?? 'human',
    })
    .returning();
  return created;
}

export async function getVersionForUser(
  userId: string,
  versionId: string,
): Promise<StrategyVersion | null> {
  const [row] = await db
    .select()
    .from(strategyVersions)
    .where(and(
      eq(strategyVersions.id, versionId),
      eq(strategyVersions.userId, userId),
    ))
    .limit(1);
  return row ?? null;
}

export async function listVersionsForUser(
  userId: string,
  strategyId: number,
): Promise<StrategyVersion[]> {
  return db
    .select()
    .from(strategyVersions)
    .where(and(
      eq(strategyVersions.userId, userId),
      eq(strategyVersions.strategyId, strategyId),
    ))
    .orderBy(desc(strategyVersions.version));
}

export async function updateValidationResult(
  userId: string,
  versionId: string,
  status: Exclude<StrategyValidationStatus, 'pending'>,
  diagnostics: StrategyDiagnostic[],
): Promise<StrategyVersion | null> {
  const [row] = await db
    .update(strategyVersions)
    .set({ validationStatus: status, diagnostics })
    .where(and(
      eq(strategyVersions.id, versionId),
      eq(strategyVersions.userId, userId),
    ))
    .returning();
  return row ?? null;
}

export interface CreateBacktestJobInput {
  userId: string;
  strategyVersionId: string;
  symbol: string;
  request: Record<string, unknown>;
  sourceHash: string;
  dataHash: string;
}

export async function createBacktestJob(
  input: CreateBacktestJobInput,
): Promise<BacktestJob> {
  const [row] = await db
    .insert(backtestJobs)
    .values({
      userId: input.userId,
      strategyVersionId: input.strategyVersionId,
      symbol: input.symbol,
      request: input.request,
      sourceHash: input.sourceHash,
      dataHash: input.dataHash,
      status: 'queued',
    })
    .returning();
  return row;
}

export async function markBacktestRunning(
  userId: string,
  jobId: string,
): Promise<BacktestJob | null> {
  const [row] = await db
    .update(backtestJobs)
    .set({ status: 'running', startedAt: new Date(), error: null })
    .where(and(
      eq(backtestJobs.id, jobId),
      eq(backtestJobs.userId, userId),
      eq(backtestJobs.status, 'queued'),
    ))
    .returning();
  return row ?? null;
}

export async function completeBacktestJob(
  userId: string,
  jobId: string,
  result: Record<string, unknown>,
): Promise<BacktestJob | null> {
  const [row] = await db
    .update(backtestJobs)
    .set({
      status: 'completed',
      result,
      error: null,
      completedAt: new Date(),
    })
    .where(and(
      eq(backtestJobs.id, jobId),
      eq(backtestJobs.userId, userId),
      eq(backtestJobs.status, 'running'),
    ))
    .returning();
  return row ?? null;
}

export async function failBacktestJob(
  userId: string,
  jobId: string,
  error: string,
): Promise<BacktestJob | null> {
  const [row] = await db
    .update(backtestJobs)
    .set({
      status: 'failed',
      error,
      completedAt: new Date(),
    })
    .where(and(
      eq(backtestJobs.id, jobId),
      eq(backtestJobs.userId, userId),
      inArray(backtestJobs.status, ['queued', 'running']),
    ))
    .returning();
  return row ?? null;
}

export async function getBacktestJobForUser(
  userId: string,
  jobId: string,
): Promise<BacktestJob | null> {
  const [row] = await db
    .select()
    .from(backtestJobs)
    .where(and(
      eq(backtestJobs.id, jobId),
      eq(backtestJobs.userId, userId),
    ))
    .limit(1);
  return row ?? null;
}

export const strategyRuntimeRepo = {
  createVersion,
  getVersionForUser,
  listVersionsForUser,
  updateValidationResult,
  createBacktestJob,
  markBacktestRunning,
  completeBacktestJob,
  failBacktestJob,
  getBacktestJobForUser,
};

export type StrategyRuntimeRepository = typeof strategyRuntimeRepo;
