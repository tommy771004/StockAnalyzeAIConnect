import { describe, expect, it, vi } from 'vitest';

import { createAiStrategyDraft } from '../aiStrategyDraftService.js';

describe('AI strategy draft service', () => {
  it('persists generated source as an AI draft without executing it', async () => {
    const generateSource = vi.fn(async () => [
      '```python',
      'def run(data, params):',
      '    return {"buy": [], "sell": []}',
      '```',
    ].join('\n'));
    const createVersion = vi.fn(async () => ({
      id: 'version-1',
      validationStatus: 'pending',
    }));

    const result = await createAiStrategyDraft({
      userId: 'user-1',
      strategyId: 7,
      runtime: 'indicator',
      prompt: 'Create a moving-average strategy',
    }, {
      generateSource,
      createVersion,
    });

    expect(generateSource).toHaveBeenCalledWith(expect.objectContaining({
      runtime: 'indicator',
      prompt: 'Create a moving-average strategy',
    }));
    expect(createVersion).toHaveBeenCalledWith('user-1', 7, {
      runtime: 'indicator',
      source: [
        'def run(data, params):',
        '    return {"buy": [], "sell": []}',
      ].join('\n'),
      provenance: 'ai',
    });
    expect(result).toMatchObject({
      id: 'version-1',
      validationStatus: 'pending',
    });
  });

  it('rejects empty generated source', async () => {
    await expect(createAiStrategyDraft({
      userId: 'user-1',
      strategyId: 7,
      runtime: 'script',
      prompt: 'Create a script',
    }, {
      generateSource: async () => '```python\n```',
      createVersion: vi.fn(),
    })).rejects.toThrow('empty strategy source');
  });
});
