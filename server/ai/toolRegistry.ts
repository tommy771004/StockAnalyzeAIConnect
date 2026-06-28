import { z } from 'zod';

import {
  ToolDefinitionSchema,
  ToolResultSchema,
  type AgentScope,
  type ToolDefinition,
  type ToolResult,
} from './contracts.js';
import type { DataMarket } from '../data/types.js';

export interface AgentToolContext {
  userId: string;
  scopes: AgentScope[];
  paperOnly: true;
  allowedMarkets: DataMarket[];
  allowedInstruments: string[];
}

export class ToolAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolAccessDeniedError';
  }
}

interface InternalTool {
  definition: ToolDefinition;
  input: z.ZodType;
  execute(input: any, context: AgentToolContext): Promise<unknown>;
}

export interface AgentToolRegistration<Input extends z.ZodType> {
  definition: ToolDefinition;
  input: Input;
  execute(
    input: z.output<Input>,
    context: AgentToolContext,
  ): Promise<unknown>;
}

export class AgentToolRegistry {
  private readonly tools = new Map<string, InternalTool>();

  register<Input extends z.ZodType>(
    registration: AgentToolRegistration<Input>,
  ): void {
    const definition = ToolDefinitionSchema.parse(registration.definition);
    if (this.tools.has(definition.name)) {
      throw new Error(`Agent tool ${definition.name} is already registered`);
    }
    this.tools.set(definition.name, {
      definition,
      input: registration.input,
      execute: registration.execute,
    });
  }

  describe(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown agent tool: ${name}`);
    return tool.definition;
  }

  async execute(
    name: string,
    rawInput: unknown,
    context: AgentToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown agent tool: ${name}`);
    const missingScopes = tool.definition.requiredScopes.filter(
      (scope) => !context.scopes.includes(scope),
    );
    if (missingScopes.length) {
      throw new ToolAccessDeniedError(
        `Tool ${name} requires scopes: ${missingScopes.join(', ')}`,
      );
    }
    if (tool.definition.riskClass === 'paper_trade' && !context.paperOnly) {
      throw new ToolAccessDeniedError('Agent trading tools are paper-only');
    }

    const input = tool.input.parse(rawInput);
    const result = ToolResultSchema.parse(await tool.execute(input, context));
    if (
      result.toolName !== tool.definition.name
      || result.toolVersion !== tool.definition.version
    ) {
      throw new Error(`Tool ${name} returned mismatched identity`);
    }
    return result;
  }

  openRouterTools(scopes?: AgentScope[]) {
    return [...this.tools.values()]
      .filter(({ definition }) => (
        scopes === undefined
        || definition.requiredScopes.every((scope) => scopes.includes(scope))
      ))
      .map(({ definition }) => ({
      type: 'function' as const,
      function: {
        name: definition.name,
        description: definition.description,
        parameters: definition.inputSchema,
      },
      }));
  }
}
