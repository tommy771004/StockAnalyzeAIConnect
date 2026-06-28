import { z } from 'zod';

import type { CreateVersionCommand } from './strategyRuntimeService.js';

const AiStrategyDraftCommandSchema = z.object({
  userId: z.string().min(1),
  strategyId: z.number().int().positive(),
  runtime: z.enum(['indicator', 'script']),
  prompt: z.string().trim().min(1).max(20_000),
});

interface AiStrategyDraftDependencies {
  generateSource(input: {
    runtime: 'indicator' | 'script';
    prompt: string;
  }): Promise<string>;
  createVersion(
    userId: string,
    strategyId: number,
    command: CreateVersionCommand,
  ): Promise<unknown>;
}

function cleanGeneratedSource(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:python|py)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export async function createAiStrategyDraft(
  command: z.input<typeof AiStrategyDraftCommandSchema>,
  dependencies: AiStrategyDraftDependencies,
): Promise<unknown> {
  const parsed = AiStrategyDraftCommandSchema.parse(command);
  const generated = await dependencies.generateSource({
    runtime: parsed.runtime,
    prompt: parsed.prompt,
  });
  const source = cleanGeneratedSource(generated);
  if (!source) throw new Error('AI returned empty strategy source');

  return dependencies.createVersion(parsed.userId, parsed.strategyId, {
    runtime: parsed.runtime,
    source,
    provenance: 'ai',
  });
}
