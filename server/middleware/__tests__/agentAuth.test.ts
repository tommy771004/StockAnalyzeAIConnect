import { describe, expect, it, vi } from 'vitest';

import {
  AgentAuthenticationError,
  AgentRateGate,
  authenticateAgentAuthorization,
  constantTimeEqualHex,
} from '../agentAuth.js';
import { sha256Hex } from '../../utils/hash.js';

const plaintext = 'hagt_ab12cd34_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-1',
    userId: 'user-1',
    name: 'Research bot',
    prefix: 'hagt_ab12cd34',
    tokenHash: '',
    scopes: ['R', 'B'],
    expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    allowedMarkets: ['us_stock'],
    allowedInstruments: ['AAPL'],
    paperOnly: true,
    rateLimitPerMinute: 2,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('agent authorization', () => {
  it('rejects missing credentials and browser JWT bearer values', async () => {
    const findByHash = vi.fn();
    await expect(authenticateAgentAuthorization(undefined, { findByHash }))
      .rejects.toBeInstanceOf(AgentAuthenticationError);
    await expect(authenticateAgentAuthorization('Bearer eyJhbGciOiJIUzI1NiJ9.jwt', {
      findByHash,
    })).rejects.toThrow('Invalid agent token');
    expect(findByHash).not.toHaveBeenCalled();
  });

  it('authenticates an active hashed token without returning its hash', async () => {
    const hash = await sha256Hex(plaintext);
    const touch = vi.fn(async () => undefined);
    const principal = await authenticateAgentAuthorization(`Bearer ${plaintext}`, {
      findByHash: async (candidate) => (
        candidate === hash ? tokenRow({ tokenHash: hash }) as never : null
      ),
      touch,
    }, new Date('2026-01-02T00:00:00.000Z'));

    expect(principal).toMatchObject({
      tokenId: 'token-1',
      userId: 'user-1',
      prefix: 'hagt_ab12cd34',
      scopes: ['R', 'B'],
      paperOnly: true,
    });
    expect(JSON.stringify(principal)).not.toContain(hash);
    expect(touch).toHaveBeenCalledWith('token-1');
  });

  it('rejects expired and revoked tokens', async () => {
    const hash = await sha256Hex(plaintext);
    for (const row of [
      tokenRow({ tokenHash: hash, expiresAt: new Date('2026-01-01T00:00:00.000Z') }),
      tokenRow({ tokenHash: hash, revokedAt: new Date('2026-01-01T00:00:00.000Z') }),
    ]) {
      await expect(authenticateAgentAuthorization(`Bearer ${plaintext}`, {
        findByHash: async () => row as never,
      }, new Date('2026-01-02T00:00:00.000Z'))).rejects.toThrow('Invalid agent token');
    }
  });

  it('compares token hashes without early mismatch exits', () => {
    expect(constantTimeEqualHex('ab'.repeat(32), 'ab'.repeat(32))).toBe(true);
    expect(constantTimeEqualHex('ab'.repeat(32), 'ac'.repeat(32))).toBe(false);
    expect(constantTimeEqualHex('ab', 'abcd')).toBe(false);
  });
});

describe('AgentRateGate', () => {
  it('enforces each token fixed-window budget', () => {
    let now = 1_000;
    const gate = new AgentRateGate(() => now);
    expect(gate.consume('token-1', 2)).toBe(true);
    expect(gate.consume('token-1', 2)).toBe(true);
    expect(gate.consume('token-1', 2)).toBe(false);
    now += 60_000;
    expect(gate.consume('token-1', 2)).toBe(true);
  });
});
