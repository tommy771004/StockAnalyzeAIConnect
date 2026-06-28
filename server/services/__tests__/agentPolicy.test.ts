import { describe, expect, it } from 'vitest';

import {
  AgentPolicyError,
  assertAgentInstrumentAllowed,
  assertPaperOnlyRequest,
  requireAgentIdempotencyKey,
  requireAgentScopes,
} from '../agentPolicy.js';

const principal = {
  tokenId: 'token-1',
  userId: 'user-1',
  prefix: 'hagt_ab12cd34',
  scopes: ['R', 'B', 'T'] as const,
  allowedMarkets: ['us_stock'] as const,
  allowedInstruments: ['AAPL'],
  paperOnly: true as const,
  rateLimitPerMinute: 60,
};

describe('agent policy', () => {
  it('denies missing scopes and out-of-allowlist instruments', () => {
    expect(() => requireAgentScopes(principal, ['W']))
      .toThrow(AgentPolicyError);
    expect(() => assertAgentInstrumentAllowed(principal, 'AAPL', 'us_stock'))
      .not.toThrow();
    expect(() => assertAgentInstrumentAllowed(principal, 'MSFT', 'us_stock'))
      .toThrow('instrument allowlist');
    expect(() => assertAgentInstrumentAllowed(principal, 'AAPL', 'tw_stock'))
      .toThrow('market allowlist');
  });

  it('requires idempotency for workspace, backtest, and trading mutations', () => {
    expect(requireAgentIdempotencyKey('read', undefined)).toBeUndefined();
    expect(() => requireAgentIdempotencyKey('backtest', undefined))
      .toThrow('Idempotency-Key');
    expect(requireAgentIdempotencyKey('workspace', 'draft-0001'))
      .toBe('draft-0001');
  });

  it('denies live intent even when the token has T scope', () => {
    for (const body of [
      { mode: 'real' },
      { live: true },
      { brokerMode: 'LIVE' },
      { paperOnly: false },
      { nested: { executionMode: 'real' } },
    ]) {
      expect(() => assertPaperOnlyRequest(principal, body))
        .toThrow('paper-only');
    }
    expect(() => assertPaperOnlyRequest(principal, {
      mode: 'paper',
      paperOnly: true,
    })).not.toThrow();
  });
});
