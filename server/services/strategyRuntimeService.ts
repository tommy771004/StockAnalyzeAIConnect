import type { BacktestJob, StrategyVersion } from '../../src/db/schema.js';
import {
  strategyRuntimeRepo,
  type CreateBacktestJobInput,
  type CreateStrategyVersionInput,
  type StrategyRuntimeRepository,
} from '../repositories/strategyRuntimeRepo.js';
import {
  ExecutionPolicySchema,
  StrategyBacktestRequestSchema,
  StrategyRuntimeSchema,
  type ExecutionPolicy,
  type StrategyBacktestRequest,
  type StrategyBacktestResult,
  type StrategyBar,
  type StrategyValidationRequest,
  type StrategyValidationResult,
} from '../types/strategyRuntime.js';
import { sha256Hex, stableJsonHash } from '../utils/hash.js';
import {
  runStrategyBacktest,
  validateStrategy,
} from './quantRuntimeClient.js';

export type StrategyRuntimeRepoPort = Pick<
  StrategyRuntimeRepository,
  | 'createVersion'
  | 'getVersionForUser'
  | 'listVersionsForUser'
  | 'updateValidationResult'
  | 'createBacktestJob'
  | 'markBacktestRunning'
  | 'completeBacktestJob'
  | 'failBacktestJob'
  | 'getBacktestJobForUser'
>;

export interface LoadStrategyBarsInput {
  symbol: string;
  period1?: string | number;
  period2?: string | number;
}

export type LoadStrategyBars = (
  input: LoadStrategyBarsInput,
) => Promise<StrategyBar[]>;

export interface CreateVersionCommand {
  runtime: 'indicator' | 'script';
  source: string;
  parameterSchema?: Record<string, unknown>;
  defaultParameters?: Record<string, unknown>;
  executionPolicy?: Record<string, unknown>;
  provenance?: 'human' | 'ai' | 'imported';
}

export interface StartBacktestCommand {
  strategyVersionId: string;
  symbol: string;
  period1?: string | number;
  period2?: string | number;
  parameters?: Record<string, unknown>;
  execution?: Partial<ExecutionPolicy>;
}

export interface StrategyRuntimeServiceDependencies {
  repo: StrategyRuntimeRepoPort;
  loadBars: LoadStrategyBars;
  validate: (
    request: StrategyValidationRequest,
  ) => Promise<StrategyValidationResult>;
  backtest: (
    request: StrategyBacktestRequest,
  ) => Promise<StrategyBacktestResult>;
  schedule?: (task: () => Promise<void>) => void;
}

function defaultSchedule(task: () => Promise<void>): void {
  queueMicrotask(() => {
    void task();
  });
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Backtest worker failed';
  return message.slice(0, 2_000);
}

export class StrategyRuntimeService {
  private readonly repo: StrategyRuntimeRepoPort;
  private readonly loadBars: LoadStrategyBars;
  private readonly validate: StrategyRuntimeServiceDependencies['validate'];
  private readonly backtest: StrategyRuntimeServiceDependencies['backtest'];
  private readonly schedule: NonNullable<StrategyRuntimeServiceDependencies['schedule']>;

  constructor(dependencies: StrategyRuntimeServiceDependencies) {
    this.repo = dependencies.repo;
    this.loadBars = dependencies.loadBars;
    this.validate = dependencies.validate;
    this.backtest = dependencies.backtest;
    this.schedule = dependencies.schedule ?? defaultSchedule;
  }

  async createVersion(
    userId: string,
    strategyId: number,
    command: CreateVersionCommand,
  ): Promise<StrategyVersion> {
    const runtime = StrategyRuntimeSchema.parse(command.runtime);
    if (!command.source.trim()) {
      throw new Error('Strategy source is required');
    }
    const sourceHash = await sha256Hex(command.source);
    const input: CreateStrategyVersionInput = {
      userId,
      strategyId,
      runtime,
      source: command.source,
      sourceHash,
      parameterSchema: command.parameterSchema,
      defaultParameters: command.defaultParameters,
      executionPolicy: command.executionPolicy,
      provenance: command.provenance,
    };
    const created = await this.repo.createVersion(input);
    if (!created) throw new Error('Strategy not found');
    return created;
  }

  listVersions(userId: string, strategyId: number): Promise<StrategyVersion[]> {
    return this.repo.listVersionsForUser(userId, strategyId);
  }

  async validateVersion(
    userId: string,
    versionId: string,
  ): Promise<StrategyValidationResult> {
    const version = await this.requireVersion(userId, versionId);
    const result = await this.validate({
      strategyVersionId: version.id,
      runtime: StrategyRuntimeSchema.parse(version.runtime),
      source: version.source,
      sourceHash: version.sourceHash,
      parameters: asRecord(version.defaultParameters),
    });
    await this.repo.updateValidationResult(
      userId,
      version.id,
      result.valid ? 'valid' : 'invalid',
      result.diagnostics,
    );
    return result;
  }

  async startBacktest(
    userId: string,
    command: StartBacktestCommand,
  ): Promise<BacktestJob> {
    const version = await this.requireVersion(userId, command.strategyVersionId);
    if (version.validationStatus !== 'valid') {
      throw new Error('Strategy version must be validated before backtesting');
    }
    const bars = await this.loadBars({
      symbol: command.symbol,
      period1: command.period1,
      period2: command.period2,
    });
    const dataHash = await stableJsonHash(bars);
    const parameters = {
      ...asRecord(version.defaultParameters),
      ...(command.parameters ?? {}),
    };
    const execution = ExecutionPolicySchema.parse({
      ...asRecord(version.executionPolicy),
      ...(command.execution ?? {}),
    });
    const persistedRequest = {
      strategyVersionId: version.id,
      symbol: command.symbol,
      bars,
      parameters,
      execution,
    };
    const createInput: CreateBacktestJobInput = {
      userId,
      strategyVersionId: version.id,
      symbol: command.symbol,
      request: persistedRequest,
      sourceHash: version.sourceHash,
      dataHash,
    };
    const queued = await this.repo.createBacktestJob(createInput);
    this.schedule(() => this.processBacktest(
      userId,
      queued,
      version,
      bars,
      parameters,
      execution,
    ));
    return queued;
  }

  getBacktestJob(userId: string, jobId: string): Promise<BacktestJob | null> {
    return this.repo.getBacktestJobForUser(userId, jobId);
  }

  private async processBacktest(
    userId: string,
    job: BacktestJob,
    version: StrategyVersion,
    bars: StrategyBar[],
    parameters: Record<string, unknown>,
    execution: ExecutionPolicy,
  ): Promise<void> {
    try {
      const running = await this.repo.markBacktestRunning(userId, job.id);
      if (!running) return;
      const request = StrategyBacktestRequestSchema.parse({
        runId: job.id,
        strategyVersionId: version.id,
        runtime: StrategyRuntimeSchema.parse(version.runtime),
        source: version.source,
        sourceHash: version.sourceHash,
        parameters,
        symbol: job.symbol,
        bars,
        execution,
      });
      const result = await this.backtest(request);
      await this.repo.completeBacktestJob(
        userId,
        job.id,
        result as unknown as Record<string, unknown>,
      );
    } catch (error) {
      await this.repo.failBacktestJob(userId, job.id, errorText(error));
    }
  }

  private async requireVersion(
    userId: string,
    versionId: string,
  ): Promise<StrategyVersion> {
    const version = await this.repo.getVersionForUser(userId, versionId);
    if (!version) throw new Error('Strategy version not found');
    return version;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

let configuredService: StrategyRuntimeService | null = null;

export function configureStrategyRuntimeService(
  loadBars: LoadStrategyBars,
): StrategyRuntimeService {
  configuredService = new StrategyRuntimeService({
    repo: strategyRuntimeRepo,
    loadBars,
    validate: validateStrategy,
    backtest: runStrategyBacktest,
  });
  return configuredService;
}

export function getStrategyRuntimeService(): StrategyRuntimeService {
  if (!configuredService) {
    throw new Error('Strategy runtime service is not configured');
  }
  return configuredService;
}
