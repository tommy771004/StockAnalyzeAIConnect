import { describe, expect, it, vi } from 'vitest';

import { createEvidenceContext } from '../evidence.js';
import { EvidenceModelGateway } from '../modelGateway.js';

const prompt = {
  id: 'agent.research.system',
  version: '1.0.0',
  sha256: 'a'.repeat(64),
  template: 'Answer only from supplied evidence and cite every factual claim.',
};

const evidence = [{
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
}];

describe('evidence context', () => {
  it('renders stable evidence labels and provider provenance', () => {
    const context = createEvidenceContext(evidence);
    expect(context).toContain('[E1] AAPL quote');
    expect(context).toContain('provider=yahoo@1');
    expect(context).toContain('marketTimestamp=2026-01-02T00:00:00.000Z');
  });
});

describe('EvidenceModelGateway', () => {
  it('returns structured answers only when citations exist', async () => {
    const complete = vi.fn(async () => ({
      model: 'test-model',
      content: JSON.stringify({
        answer: 'AAPL 的價格是 200。[E1]',
        citations: [{ evidenceId: 'E1', claim: 'AAPL price is 200' }],
      }),
    }));
    const gateway = new EvidenceModelGateway(prompt, complete);

    const result = await gateway.answer({
      question: 'AAPL price?',
      evidence,
    });

    expect(result).toEqual({
      answer: 'AAPL 的價格是 200。[E1]',
      citations: [{ evidenceId: 'E1', claim: 'AAPL price is 200' }],
      promptVersion: 'agent.research.system@1.0.0',
      model: 'test-model',
    });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('[E1] AAPL quote'),
        }),
      ]),
    }));
  });

  it('rejects citations that are absent from the evidence bundle', async () => {
    const gateway = new EvidenceModelGateway(prompt, async () => ({
      model: 'test-model',
      content: JSON.stringify({
        answer: 'Invented claim. [E2]',
        citations: [{ evidenceId: 'E2', claim: 'Invented' }],
      }),
    }));

    await expect(gateway.answer({
      question: 'AAPL price?',
      evidence,
    })).rejects.toThrow('Unknown evidence citation: E2');
  });

  it('redacts credentials before calling the model', async () => {
    const complete = vi.fn(async () => ({
      model: 'test-model',
      content: JSON.stringify({
        answer: 'I cannot inspect credentials.',
        citations: [],
      }),
    }));
    const gateway = new EvidenceModelGateway(prompt, complete);

    await gateway.answer({
      question: 'Use Bearer top-secret and api_key=sk-secret',
      evidence: [],
      dataUnavailable: 'No provider data requested.',
    });

    const serialized = JSON.stringify(complete.mock.calls[0]);
    expect(serialized).not.toContain('top-secret');
    expect(serialized).not.toContain('sk-secret');
    expect(serialized).toContain('[REDACTED]');
  });

  it('rejects fabricated citations when evidence is unavailable', async () => {
    const gateway = new EvidenceModelGateway(prompt, async () => ({
      model: 'test-model',
      content: JSON.stringify({
        answer: 'The price is 200. [E1]',
        citations: [{ evidenceId: 'E1', claim: 'price' }],
      }),
    }));

    await expect(gateway.answer({
      question: 'AAPL price?',
      evidence: [],
      dataUnavailable: 'No fresh quote.',
    })).rejects.toThrow('Unknown evidence citation: E1');
  });
});
