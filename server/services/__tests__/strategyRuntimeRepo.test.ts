import { describe, expect, it } from 'vitest';
import {
  isBacktestTransitionAllowed,
  type BacktestJobStatus,
} from '../../repositories/strategyRuntimeRepo.js';

describe('backtest job state transitions', () => {
  const allowed: Array<[BacktestJobStatus, BacktestJobStatus]> = [
    ['queued', 'running'],
    ['queued', 'failed'],
    ['running', 'completed'],
    ['running', 'failed'],
  ];

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(isBacktestTransitionAllowed(from, to)).toBe(true);
  });

  const rejected: Array<[BacktestJobStatus, BacktestJobStatus]> = [
    ['queued', 'completed'],
    ['running', 'queued'],
    ['completed', 'running'],
    ['completed', 'failed'],
    ['failed', 'running'],
    ['failed', 'completed'],
  ];

  it.each(rejected)('rejects %s -> %s', (from, to) => {
    expect(isBacktestTransitionAllowed(from, to)).toBe(false);
  });
});
