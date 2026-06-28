import type { EvidenceItem } from './contracts.js';
import type { EvidenceModelGateway } from './modelGateway.js';
import type { AgentToolRegistry } from './toolRegistry.js';

interface GroundedChatInput {
  userId: string;
  message: string;
  symbol?: string;
  memoryContext?: string;
  personaContext?: string;
}

interface GroundedChatDependencies {
  tools: Pick<AgentToolRegistry, 'execute'>;
  gateway: Pick<EvidenceModelGateway, 'answer'>;
}

export async function answerGroundedChat(
  input: GroundedChatInput,
  dependencies: GroundedChatDependencies,
) {
  let evidence: EvidenceItem[] = [];
  let dataUnavailable: string | undefined;

  if (input.symbol?.trim()) {
    try {
      const toolResult = await dependencies.tools.execute(
        'show_stock_chart',
        { ticker: input.symbol.trim().toUpperCase() },
        {
          userId: input.userId,
          scopes: ['R'],
          paperOnly: true,
          allowedMarkets: [],
          allowedInstruments: [],
        },
      );
      evidence = toolResult.evidence;
      dataUnavailable = toolResult.dataUnavailable?.message;
    } catch {
      dataUnavailable = 'Market evidence could not be resolved.';
    }
  }

  return dependencies.gateway.answer({
    question: input.message,
    evidence,
    dataUnavailable,
    memoryContext: input.memoryContext,
    personaContext: input.personaContext,
  });
}
