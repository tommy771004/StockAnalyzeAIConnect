import type { BacktestJob, StrategyVersion } from '../../src/db/schema.js';
import {
  strategyRuntimeRepo,
  type CreateBacktestJobInput,
  type CreateStrategyVersionInput,
  type StrategyRuntimeRepository,
} from '../repositories/strategyRuntimeRepo.js';
import {
  CrossSectionalConfigSchema,
  ExecutionPolicySchema,
  StrategyBacktestRequestSchema,
  StrategySignalRequestSchema,
  StrategyRuntimeSchema,
  type CrossSectionalConfig,
  type ExecutionPolicy,
  type StrategyBacktestRequest,
  type StrategyBacktestResult,
  type StrategyBar,
  type StrategyValidationRequest,
  type StrategyValidationResult,
  type StrategySignalResult,
} from '../types/strategyRuntime.js';
import { sha256Hex, stableJsonHash } from '../utils/hash.js';
import {
  runStrategyBacktest,
  runStrategySignal,
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
  interval?: string;
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
  symbol?: string;
  crossSectional?: CrossSectionalConfig;
  period1?: string | number;
  period2?: string | number;
  parameters?: Record<string, unknown>;
  execution?: Partial<ExecutionPolicy>;
}

interface PreparedBacktestRequest {
  symbol: string;
  bars: StrategyBar[];
  parameters: Record<string, unknown>;
  execution: ExecutionPolicy;
  crossSectional?: CrossSectionalConfig;
  universeBars?: Record<string, StrategyBar[]>;
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

function alignUniverseBars(
  loaded: ReadonlyArray<readonly [string, StrategyBar[]]>,
): Record<string, StrategyBar[]> {
  const first = loaded[0];
  if (!first) throw new Error('Cross-sectional universe is empty');
  let common = new Set(first[1].map((bar) => bar.timestamp));
  const indexed = loaded.map(([symbol, bars]) => {
    const byTimestamp = new Map(bars.map((bar) => [bar.timestamp, bar]));
    if (byTimestamp.size !== bars.length) {
      throw new Error(`Duplicate cross-sectional timestamp for ${symbol}`);
    }
    common = new Set([...common].filter((timestamp) => byTimestamp.has(timestamp)));
    return [symbol, byTimestamp] as const;
  });
  const timestamps = first[1]
    .map((bar) => bar.timestamp)
    .filter((timestamp) => common.has(timestamp));
  if (timestamps.length < 2) {
    throw new Error('Cross-sectional universe has fewer than two aligned bars');
  }
  return Object.fromEntries(indexed.map(([symbol, bars]) => [
    symbol,
    timestamps.map((timestamp) => bars.get(timestamp)!),
  ]));
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
    const crossSectional = command.crossSectional
      ? CrossSectionalConfigSchema.parse(command.crossSectional)
      : undefined;
    if (crossSectional && version.runtime !== 'indicator') {
      throw new Error('Cross-sectional backtests require indicator runtime');
    }
    const singleSymbol = command.symbol?.trim().toUpperCase();
    if (!crossSectional && !singleSymbol) {
      throw new Error('Backtest symbol is required');
    }
    const symbols = crossSectional?.symbols ?? [singleSymbol!];
    const loaded = await Promise.all(symbols.map(async (symbol) => [
      symbol,
      await this.loadBars({
        symbol,
        period1: command.period1,
        period2: command.period2,
      }),
    ] as const));
    const universeBars = crossSectional
      ? alignUniverseBars(loaded)
      : Object.fromEntries(loaded);
    const bars = universeBars[symbols[0]!]!;
    const dataHash = await stableJsonHash(
      crossSectional ? universeBars : bars,
    );
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
      symbol: crossSectional ? crossSectional.symbols.join(',') : singleSymbol!,
      bars,
      parameters,
      execution,
      ...(crossSectional ? { crossSectional, universeBars } : {}),
    };
    const createInput: CreateBacktestJobInput = {
      userId,
      strategyVersionId: version.id,
      symbol: persistedRequest.symbol,
      request: persistedRequest,
      sourceHash: version.sourceHash,
      dataHash,
    };
    const queued = await this.repo.createBacktestJob(createInput);
    this.schedule(() => this.processBacktest(
      userId,
      queued,
      version,
      persistedRequest,
    ));
    return queued;
  }

  getBacktestJob(userId: string, jobId: string): Promise<BacktestJob | null> {
    return this.repo.getBacktestJobForUser(userId, jobId);
  }

  async assertPaperExecutableVersion(
    userId: string,
    versionId: string,
  ): Promise<StrategyVersion> {
    const version = await this.requireVersion(userId, versionId);
    if (version.validationStatus !== 'valid') {
      throw new Error('Strategy version must be validated before paper execution');
    }
    if (version.runtime !== 'indicator') {
      throw new Error('Paper execution currently supports indicator strategy versions only');
    }
    return version;
  }

  async evaluateVersionSignal(
    userId: string,
    versionId: string,
    symbol: string,
  ): Promise<StrategySignalResult> {
    const version = await this.assertPaperExecutableVersion(userId, versionId);
    const bars = await this.loadBars({
      symbol,
      period1: Math.floor(Date.now() / 1_000) - 30 * 86_400,
      interval: '15m',
    });
    const request = StrategySignalRequestSchema.parse({
      strategyVersionId: version.id,
      runtime: version.runtime,
      source: version.source,
      sourceHash: version.sourceHash,
      parameters: asRecord(version.defaultParameters),
      symbol,
      bars,
    });
    return runStrategySignal(request);
  }

  private async processBacktest(
    userId: string,
    job: BacktestJob,
    version: StrategyVersion,
    prepared: PreparedBacktestRequest,
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
        ...prepared,
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
