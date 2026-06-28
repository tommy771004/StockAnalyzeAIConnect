import { describe, expect, it, vi } from 'vitest';

import { answerGroundedChat } from '../chatService.js';

describe('grounded chat service', () => {
  it('collects and globally renumbers quote, news, and fundamental evidence before the model', async () => {
    const execute = vi.fn(async (toolName: string) => ({
      toolName,
      toolVersion: '1',
      data: { toolName },
      evidence: [{
        id: 'E1',
        title: `${toolName} evidence`,
        content: JSON.stringify({ toolName }),
        source: {
          providerId: toolName,
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

    expect(execute.mock.calls.map(([toolName]) => toolName)).toEqual([
      'show_stock_chart',
      'show_news_sentiment',
      'get_fundamentals',
    ]);
    expect(answer).toHaveBeenCalledWith(expect.objectContaining({
      question: 'What is AAPL trading at?',
      evidence: [
        expect.objectContaining({ id: 'E1', source: expect.objectContaining({ providerId: 'show_stock_chart' }) }),
        expect.objectContaining({ id: 'E2', source: expect.objectContaining({ providerId: 'show_news_sentiment' }) }),
        expect.objectContaining({ id: 'E3', source: expect.objectContaining({ providerId: 'get_fundamentals' }) }),
      ],
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

  it('continues with attributable evidence when another research source fails', async () => {
    const answer = vi.fn(async (input) => input);
    const execute = vi.fn(async (toolName: string) => {
      if (toolName === 'show_stock_chart') throw new Error('quote provider offline');
      if (toolName === 'get_fundamentals') {
        return {
          toolName,
          toolVersion: '1',
          evidence: [],
          dataUnavailable: {
            code: 'NO_PROVIDER_DATA',
            message: 'No fundamentals are available.',
          },
          warnings: [],
        };
      }
      return {
        toolName,
        toolVersion: '1',
        data: { articles: 2 },
        evidence: [{
          id: 'E1',
          title: 'AAPL news',
          content: '{"articles":2}',
          source: {
            providerId: 'news-provider',
            providerVersion: '1',
            retrievedAt: '2026-01-02T00:00:01.000Z',
            marketTimestamp: '2026-01-02T00:00:00.000Z',
            delayed: false,
          },
        }],
        warnings: [],
      };
    });

    const result = await answerGroundedChat({
      userId: 'user-1',
      message: 'What changed for AAPL?',
      symbol: 'AAPL',
    }, {
      tools: { execute } as never,
      gateway: { answer } as never,
    });

    expect(result).toMatchObject({
      evidence: [
        expect.objectContaining({
          id: 'E1',
          source: expect.objectContaining({ providerId: 'news-provider' }),
        }),
      ],
    });
    expect(result).toHaveProperty('dataUnavailable', undefined);
  });
});
