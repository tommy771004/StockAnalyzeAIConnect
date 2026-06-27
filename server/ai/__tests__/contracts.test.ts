import { describe, expect, it } from 'vitest';

import {
  AgentAuditEventSchema,
  AgentTokenPublicSchema,
  GatewayMutationSchema,
  PromptDefinitionSchema,
  ToolResultSchema,
  redactAuditMetadata,
} from '../contracts.js';

const source = {
  providerId: 'yahoo',
  providerVersion: '1',
  retrievedAt: '2026-01-02T00:00:01.000Z',
  marketTimestamp: '2026-01-02T00:00:00.000Z',
  delayed: false,
};

describe('AI evidence contracts', () => {
  it('requires fact-bearing tool results to carry valid unique evidence', () => {
    expect(() => ToolResultSchema.parse({
      toolName: 'market_snapshot',
      toolVersion: '1',
      data: { price: 200 },
      evidence: [],
    })).toThrow();

    const parsed = ToolResultSchema.parse({
      toolName: 'market_snapshot',
      toolVersion: '1',
      data: { price: 200 },
      evidence: [{
        id: 'E1',
        title: 'AAPL quote',
        content: 'AAPL price: 200',
        source,
      }],
    });
    expect(parsed.evidence[0]?.id).toBe('E1');

    expect(() => ToolResultSchema.parse({
      toolName: 'market_snapshot',
      toolVersion: '1',
      data: { price: 200 },
      evidence: [
        { id: 'E1', title: 'one', content: 'one', source },
        { id: 'E1', title: 'two', content: 'two', source },
      ],
    })).toThrow();
  });

  it('allows explicit unavailability without fabricated evidence', () => {
    const parsed = ToolResultSchema.parse({
      toolName: 'market_snapshot',
      toolVersion: '1',
      evidence: [],
      dataUnavailable: {
        code: 'NO_PROVIDER_DATA',
        message: 'No provider returned a fresh quote',
      },
    });
    expect(parsed.dataUnavailable?.code).toBe('NO_PROVIDER_DATA');
  });
});

describe('prompt and gateway contracts', () => {
  it('requires immutable prompt identity and hash', () => {
    const prompt = PromptDefinitionSchema.parse({
      id: 'agent.research.system',
      version: '1.0.0',
      sha256: 'a'.repeat(64),
      template: 'Use only supplied evidence.',
    });
    expect(prompt.version).toBe('1.0.0');
  });

  it('defaults tokens to paper-only and validates scopes and allowlists', () => {
    const token = AgentTokenPublicSchema.parse({
      id: 'token-1',
      prefix: 'hagt_ab12cd34',
      name: 'Research bot',
      scopes: ['R', 'B'],
      expiresAt: '2026-12-31T00:00:00.000Z',
      allowedMarkets: ['us_stock'],
      allowedInstruments: ['AAPL', 'MSFT'],
    });
    expect(token.paperOnly).toBe(true);
    expect(token.allowedInstruments).toEqual(['AAPL', 'MSFT']);

    expect(() => AgentTokenPublicSchema.parse({
      ...token,
      scopes: ['LIVE'],
    })).toThrow();
  });

  it('requires bounded idempotency keys for mutations', () => {
    expect(GatewayMutationSchema.parse({
      idempotencyKey: 'backtest-2026-0001',
      request: { symbol: 'AAPL' },
    }).idempotencyKey).toBe('backtest-2026-0001');
    expect(() => GatewayMutationSchema.parse({
      idempotencyKey: 'x',
      request: {},
    })).toThrow();
  });
});

describe('agent audit redaction', () => {
  it('removes credentials recursively before audit validation', () => {
    const metadata = redactAuditMetadata({
      symbol: 'AAPL',
      authorization: 'Bearer top-secret',
      nested: {
        apiKey: 'sk-secret',
        prompt: 'Use token=hagt_deadbeef_secret and analyze AAPL',
      },
    });
    const event = AgentAuditEventSchema.parse({
      tokenPrefix: 'hagt_ab12cd34',
      userId: 'user-1',
      route: '/api/agent/v1/tools/market_snapshot',
      riskClass: 'read',
      requestHash: 'b'.repeat(64),
      status: 'success',
      latencyMs: 12,
      metadata,
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    expect(JSON.stringify(event)).not.toContain('top-secret');
    expect(JSON.stringify(event)).not.toContain('sk-secret');
    expect(JSON.stringify(event)).not.toContain('hagt_deadbeef_secret');
    expect(event.metadata).toMatchObject({ symbol: 'AAPL' });
  });
});
