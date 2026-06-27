import type { z } from 'zod';

import { RateLimitPolicySchema } from './types.js';

type RateLimitPolicy = z.infer<typeof RateLimitPolicySchema>;

export class FixedWindowRateLimiter {
  private windowStartedAt: number;
  private used = 0;

  constructor(
    private readonly policy: RateLimitPolicy,
    private readonly now: () => number = Date.now,
  ) {
    this.policy = RateLimitPolicySchema.parse(policy);
    this.windowStartedAt = now();
  }

  consume(): boolean {
    this.refreshWindow();
    if (this.used >= this.policy.limit) return false;
    this.used += 1;
    return true;
  }

  remaining(): number {
    this.refreshWindow();
    return Math.max(0, this.policy.limit - this.used);
  }

  private refreshWindow(): void {
    const now = this.now();
    if (now - this.windowStartedAt >= this.policy.windowMs) {
      this.windowStartedAt = now;
      this.used = 0;
    }
  }
}
