import { describe, expect, it } from 'vitest';

import {
  IdempotencyConflictError,
  createAgentTokenMaterial,
  isAgentTokenUsable,
  resolveIdempotencyRecord,
  toAgentTokenPublic,
} from '../agentGatewayRepo.js';
import { sha256Hex } from '../../utils/hash.js';

describe('agent token material', () => {
  it('returns plaintext once while deriving a stable prefix and SHA-256 hash', async () => {
    const entropy = Uint8Array.from({ length: 32 }, (_, index) => index);
    const material = await createAgentTokenMaterial(entropy);

    expect(material.plaintext).toMatch(/^hagt_[a-f0-9]{8}_[A-Za-z0-9_-]+$/);
    expect(material.prefix).toMatch(/^hagt_[a-f0-9]{8}$/);
    expect(material.tokenHash).toBe(await sha256Hex(material.plaintext));
    expect(JSON.stringify({
      prefix: material.prefix,
      tokenHash: material.tokenHash,
    })).not.toContain(material.plaintext);
  });
});

describe('agent token lifecycle', () => {
  it('maps database dates to the public ISO contract without exposing the hash', () => {
    const publicToken = toAgentTokenPublic({
      id: 'token-1',
      prefix: 'hagt_ab12cd34',
      tokenHash: 'a'.repeat(64),
      userId: 'user-1',
      name: 'Research bot',
      scopes: ['R'],
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      allowedMarkets: ['us_stock'],
      allowedInstruments: ['AAPL'],
      paperOnly: true,
      rateLimitPerMinute: 60,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(publicToken.expiresAt).toBe('2026-12-31T00:00:00.000Z');
    expect(JSON.stringify(publicToken)).not.toContain('tokenHash');
    expect(JSON.stringify(publicToken)).not.toContain('a'.repeat(64));
  });

  it('rejects expired and revoked rows', () => {
    const now = new Date('2026-01-02T00:00:00.000Z');
    const active = {
      expiresAt: new Date('2026-01-03T00:00:00.000Z'),
      revokedAt: null,
    };

    expect(isAgentTokenUsable(active, now)).toBe(true);
    expect(isAgentTokenUsable({
      ...active,
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    }, now)).toBe(false);
    expect(isAgentTokenUsable({
      ...active,
      revokedAt: new Date('2026-01-01T12:00:00.000Z'),
    }, now)).toBe(false);
  });
});

describe('agent idempotency', () => {
  it('replays only completed records with the same request hash', () => {
    const record = {
      requestHash: 'a'.repeat(64),
      status: 'completed',
      responseStatus: 202,
      responseBody: { jobId: 'job-1' },
    };

    expect(resolveIdempotencyRecord(record, 'a'.repeat(64))).toEqual({
      kind: 'replay',
      responseStatus: 202,
      responseBody: { jobId: 'job-1' },
    });
    expect(() => resolveIdempotencyRecord(record, 'b'.repeat(64)))
      .toThrow(IdempotencyConflictError);
  });

  it('does not execute a duplicate request still in progress', () => {
    expect(resolveIdempotencyRecord({
      requestHash: 'a'.repeat(64),
      status: 'in_progress',
      responseStatus: null,
      responseBody: null,
    }, 'a'.repeat(64))).toEqual({ kind: 'in_progress' });
  });
});
