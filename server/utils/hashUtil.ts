/**
 * server/utils/hashUtil.ts
 * Hash utilities for strategy parameter comparison
 */
import { createHash } from 'crypto';

export function hashStrategyParams(params: Record<string, any>): string {
  const jsonStr = JSON.stringify(params, Object.keys(params).sort());
  return createHash('sha256').update(jsonStr).digest('hex');
}
