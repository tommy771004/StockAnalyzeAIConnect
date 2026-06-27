import {
  StrategyBacktestRequestSchema,
  StrategyBacktestResultSchema,
  StrategyValidationRequestSchema,
  StrategyValidationResultSchema,
  type StrategyBacktestRequest,
  type StrategyBacktestResult,
  type StrategyValidationRequest,
  type StrategyValidationResult,
} from '../types/strategyRuntime.js';
import { requestScience } from '../utils/scienceService.js';

const VALIDATION_TIMEOUT_MS = 30_000;
const DEFAULT_BACKTEST_TIMEOUT_MS = 120_000;
const MAX_BACKTEST_TIMEOUT_MS = 300_000;

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

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
