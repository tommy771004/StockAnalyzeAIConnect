import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { PromptRegistry } from '../promptRegistry.js';
import {
  AgentToolRegistry,
  ToolAccessDeniedError,
} from '../toolRegistry.js';

const evidence = [{
  id: 'E1',
  title: 'AAPL quote',
  content: 'AAPL price: 200',
  source: {
    providerId: 'yahoo',
    providerVersion: '1',
    retrievedAt: '2026-01-02T00:00:01.000Z',
    marketTimestamp: '2026-01-02T00:00:00.000Z',
    delayed: false,
  },
}];

function context(scopes: Array<'R' | 'W' | 'B' | 'T' | 'A'> = ['R']) {
  return {
    userId: 'user-1',
    scopes,
    paperOnly: true as const,
    allowedMarkets: [],
    allowedInstruments: [],
  };
}

describe('PromptRegistry', () => {
  it('hashes and resolves immutable prompt versions', async () => {
    const registry = new PromptRegistry();
    const prompt = await registry.register({
      id: 'agent.research.system',
      version: '1.0.0',
      template: 'Use only supplied evidence.',
    });

    expect(prompt.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(registry.get('agent.research.system', '1.0.0')).toEqual(prompt);
    await expect(registry.register({
      id: 'agent.research.system',
      version: '1.0.0',
      template: 'Changed silently.',
    })).rejects.toThrow('already registered');
  });
});

describe('AgentToolRegistry', () => {
  it('validates input, scopes, output evidence, and duplicate names', async () => {
    const registry = new AgentToolRegistry();
    const execute = vi.fn(async ({ symbol }: { symbol: string }) => ({
      toolName: 'market_snapshot',
      toolVersion: '1',
      data: { symbol, price: 200 },
      evidence,
      warnings: [],
    }));
    registry.register({
      definition: {
        name: 'market_snapshot',
        version: '1',
        description: 'Fetch an attributable market quote.',
        riskClass: 'read',
        requiredScopes: ['R'],
        inputSchema: {
          type: 'object',
          properties: { symbol: { type: 'string' } },
          required: ['symbol'],
        },
      },
      input: z.object({ symbol: z.string().min(1) }),
      execute,
    });

    await expect(registry.execute('market_snapshot', {}, context()))
      .rejects.toThrow();
    await expect(registry.execute('market_snapshot', { symbol: 'AAPL' }, context([])))
      .rejects.toBeInstanceOf(ToolAccessDeniedError);
    await expect(registry.execute('unknown', {}, context()))
      .rejects.toThrow('Unknown agent tool');

    const result = await registry.execute(
      'market_snapshot',
      { symbol: 'AAPL' },
      context(),
    );
    expect(result.evidence[0]?.source.providerId).toBe('yahoo');
    expect(execute).toHaveBeenCalledWith(
      { symbol: 'AAPL' },
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(() => registry.register({
      definition: registry.describe('market_snapshot'),
      input: z.object({}),
      execute: async () => result,
    })).toThrow('already registered');
  });

  it('derives OpenRouter function schemas from registered definitions', () => {
    const registry = new AgentToolRegistry();
    registry.register({
      definition: {
        name: 'portfolio',
        version: '2',
        description: 'Inspect portfolio.',
        riskClass: 'read',
        requiredScopes: ['R'],
        inputSchema: { type: 'object', properties: {} },
      },
      input: z.object({}),
      execute: async () => ({
        toolName: 'portfolio',
        toolVersion: '2',
        data: { positions: [] },
        evidence,
        warnings: [],
      }),
    });

    expect(registry.openRouterTools()).toEqual([{
      type: 'function',
      function: {
        name: 'portfolio',
        description: 'Inspect portfolio.',
        parameters: { type: 'object', properties: {} },
      },
    }]);
  });
});
