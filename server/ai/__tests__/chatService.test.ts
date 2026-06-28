import { describe, expect, it, vi } from 'vitest';

import { answerGroundedChat } from '../chatService.js';

describe('grounded chat service', () => {
  it('resolves symbol evidence through a registered tool before the model', async () => {
    const execute = vi.fn(async () => ({
      toolName: 'show_stock_chart',
      toolVersion: '1',
      data: { quote: { price: 200 } },
      evidence: [{
        id: 'E1',
        title: 'AAPL quote',
        content: '{"price":200}',
        source: {
          providerId: 'yahoo',
          providerVersion: '1',
          retrievedAt: '2026-01-02T00:00:01.000Z',
          marketTimestamp: '2026-01-02T00:00:00.000Z',
          delayed: false,
        },
      }],
      warnings: [],
    }));
    const answer = vi.fn(async () => ({
      answer: 'AAPL price is 200. [E1]',
      citations: [{ evidenceId: 'E1', claim: 'price' }],
      promptVersion: 'agent.research.system@1.0.0',
      model: 'test',
    }));

    const result = await answerGroundedChat({
      userId: 'user-1',
      message: 'What is AAPL trading at?',
      symbol: 'aapl',
      memoryContext: 'User prefers conservative analysis.',
    }, {
      tools: { execute } as never,
      gateway: { answer } as never,
    });

    expect(execute).toHaveBeenCalledWith(
      'show_stock_chart',
      { ticker: 'AAPL' },
      expect.objectContaining({ scopes: ['R'] }),
    );
    expect(answer).toHaveBeenCalledWith(expect.objectContaining({
      question: 'What is AAPL trading at?',
      evidence: expect.arrayContaining([
        expect.objectContaining({ id: 'E1' }),
      ]),
      memoryContext: 'User prefers conservative analysis.',
    }));
    expect(result.citations[0]?.evidenceId).toBe('E1');
  });

  it('passes explicit unavailability when a source tool has no data', async () => {
    const answer = vi.fn(async (input) => input);
    const result = await answerGroundedChat({
      userId: 'user-1',
      message: 'What is AAPL trading at?',
      symbol: 'AAPL',
    }, {
      tools: {
        execute: async () => ({
          toolName: 'show_stock_chart',
          toolVersion: '1',
          evidence: [],
          dataUnavailable: {
            code: 'NO_PROVIDER_DATA',
            message: 'No attributable data is currently available.',
          },
          warnings: [],
        }),
      } as never,
      gateway: { answer } as never,
    });

    expect(result).toMatchObject({
      evidence: [],
      dataUnavailable: 'No attributable data is currently available.',
    });
  });
});
