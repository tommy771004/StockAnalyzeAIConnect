import type { z } from 'zod';

import { CircuitBreakerPolicySchema } from './types.js';

type CircuitBreakerPolicy = z.infer<typeof CircuitBreakerPolicySchema>;
export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export class CircuitBreaker {
  private failures = 0;
  private openedAt?: number;
  private halfOpenProbeActive = false;

  constructor(
    private readonly policy: CircuitBreakerPolicy,
    private readonly now: () => number = Date.now,
  ) {
    this.policy = CircuitBreakerPolicySchema.parse(policy);
  }

  state(): CircuitBreakerState {
    if (this.openedAt === undefined) return 'closed';
    if (this.now() - this.openedAt >= this.policy.cooldownMs) return 'half_open';
    return 'open';
  }

  canRequest(): boolean {
    const state = this.state();
    if (state === 'closed') return true;
    if (state === 'open' || this.halfOpenProbeActive) return false;
    this.halfOpenProbeActive = true;
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = undefined;
    this.halfOpenProbeActive = false;
  }

  recordFailure(): void {
    if (this.state() === 'half_open') {
      this.open();
      return;
    }

    this.halfOpenProbeActive = false;
    this.failures += 1;
    if (this.failures >= this.policy.failureThreshold) this.open();
  }

  private open(): void {
    this.openedAt = this.now();
    this.failures = this.policy.failureThreshold;
    this.halfOpenProbeActive = false;
  }
}
