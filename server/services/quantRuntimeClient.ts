import {
  StrategyBacktestRequestSchema,
  StrategyBacktestResultSchema,
  StrategySignalRequestSchema,
  StrategySignalResultSchema,
  StrategyValidationRequestSchema,
  StrategyValidationResultSchema,
  type StrategyBacktestRequest,
  type StrategyBacktestResult,
  type StrategySignalRequest,
  type StrategySignalResult,
  type StrategyValidationRequest,
  type StrategyValidationResult,
} from '../types/strategyRuntime.js';
import { requestScience } from '../utils/scienceService.js';
import { sha256Hex } from '../utils/hash.js';

const VALIDATION_TIMEOUT_MS = 30_000;
const DEFAULT_BACKTEST_TIMEOUT_MS = 120_000;
const MAX_BACKTEST_TIMEOUT_MS = 300_000;

async function assertSourceHash(source: string, claimedHash: string): Promise<void> {
  const calculatedHash = await sha256Hex(source);
  if (calculatedHash !== claimedHash) {
    throw new Error('Strategy source hash does not match source');
  }
}

function errorMessage(
  response: { message?: string; errors?: string[] },
  fallback: string,
): string {
  return response.errors?.[0] || response.message || fallback;
}

function backtestTimeoutMs(): number {
  const configured = Number(process.env.STRATEGY_BACKTEST_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_BACKTEST_TIMEOUT_MS;
  }
  return Math.min(MAX_BACKTEST_TIMEOUT_MS, Math.max(30_000, configured));
}

export async function validateStrategy(
  input: StrategyValidationRequest,
): Promise<StrategyValidationResult> {
  const request = StrategyValidationRequestSchema.parse(input);
  await assertSourceHash(request.source, request.sourceHash);
  const response = await requestScience<unknown>(
    '/strategy/validate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
    { retries: 0, timeoutMs: VALIDATION_TIMEOUT_MS },
  );
  if (response.status !== 'success' || response.data === null) {
    throw new Error(errorMessage(response, 'Strategy validation failed'));
  }
  const result = StrategyValidationResultSchema.parse(response.data);
  if (result.sourceHash !== request.sourceHash) {
    throw new Error('Strategy validation returned a mismatched source hash');
  }
  return result;
}

export async function runStrategyBacktest(
  input: StrategyBacktestRequest,
): Promise<StrategyBacktestResult> {
  const request = StrategyBacktestRequestSchema.parse(input);
  await assertSourceHash(request.source, request.sourceHash);
  const response = await requestScience<unknown>(
    '/strategy/backtest',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
    { retries: 0, timeoutMs: backtestTimeoutMs() },
  );
  if (response.status !== 'success' || response.data === null) {
    throw new Error(errorMessage(response, 'Strategy backtest failed'));
  }
  const result = StrategyBacktestResultSchema.parse(response.data);
  if (
    result.runId !== request.runId
    || result.strategyVersionId !== request.strategyVersionId
    || result.sourceHash !== request.sourceHash
  ) {
    throw new Error('Strategy backtest returned mismatched immutable identity');
  }
  return result;
}

export async function runStrategySignal(
  input: StrategySignalRequest,
): Promise<StrategySignalResult> {
  const request = StrategySignalRequestSchema.parse(input);
  await assertSourceHash(request.source, request.sourceHash);
  const response = await requestScience<unknown>(
    '/strategy/signal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
    { retries: 0, timeoutMs: VALIDATION_TIMEOUT_MS },
  );
  if (response.status !== 'success' || response.data === null) {
    throw new Error(errorMessage(response, 'Strategy signal failed'));
  }
  const result = StrategySignalResultSchema.parse(response.data);
  if (
    result.strategyVersionId !== request.strategyVersionId
    || result.sourceHash !== request.sourceHash
    || result.symbol !== request.symbol
  ) {
    throw new Error('Strategy signal returned mismatched immutable identity');
  }
  return result;
}
