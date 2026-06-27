import {
  PromptDefinitionSchema,
  type PromptDefinition,
} from './contracts.js';
import { sha256Hex } from '../utils/hash.js';

type PromptRegistration = Omit<PromptDefinition, 'sha256'>;

export class PromptRegistry {
  private readonly prompts = new Map<string, PromptDefinition>();

  async register(registration: PromptRegistration): Promise<PromptDefinition> {
    const prompt = PromptDefinitionSchema.parse({
      ...registration,
      sha256: await sha256Hex(registration.template),
    });
    const key = this.key(prompt.id, prompt.version);
    if (this.prompts.has(key)) {
      throw new Error(`Prompt ${key} is already registered`);
    }
    this.prompts.set(key, prompt);
    return prompt;
  }

  get(id: string, version: string): PromptDefinition {
    const prompt = this.prompts.get(this.key(id, version));
    if (!prompt) throw new Error(`Unknown prompt ${id}@${version}`);
    return prompt;
  }

  list(): PromptDefinition[] {
    return [...this.prompts.values()];
  }

  private key(id: string, version: string): string {
    return `${id}@${version}`;
  }
}
