import type { EvidenceItem } from './contracts.js';
import type { EvidenceModelGateway } from './modelGateway.js';
import type { AgentToolContext, AgentToolRegistry } from './toolRegistry.js';

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

const SYMBOL_RESEARCH_TOOLS = [
  ['show_stock_chart', (symbol: string) => ({ ticker: symbol })],
  ['show_news_sentiment', (symbol: string) => ({ ticker: symbol, limit: 8 })],
  ['get_fundamentals', (symbol: string) => ({ ticker: symbol })],
] as const;

async function collectSymbolEvidence(
  userId: string,
  symbol: string,
  tools: Pick<AgentToolRegistry, 'execute'>,
): Promise<{ evidence: EvidenceItem[]; dataUnavailable?: string }> {
  const context: AgentToolContext = {
    userId,
    scopes: ['R'],
    paperOnly: true,
    allowedMarkets: [],
    allowedInstruments: [],
  };
  const results = await Promise.allSettled(
    SYMBOL_RESEARCH_TOOLS.map(([toolName, input]) => (
      tools.execute(toolName, input(symbol), context)
    )),
  );
  const evidence: EvidenceItem[] = [];
  const unavailable = new Set<string>();

  for (const result of results) {
    if (result.status === 'rejected') continue;
    for (const item of result.value.evidence) {
      evidence.push({ ...item, id: `E${evidence.length + 1}` });
    }
    if (result.value.dataUnavailable?.message) {
      unavailable.add(result.value.dataUnavailable.message);
    }
  }

  return {
    evidence,
    dataUnavailable: evidence.length > 0
      ? undefined
      : [...unavailable][0] ?? 'Market evidence could not be resolved.',
  };
}

export async function answerGroundedChat(
  input: GroundedChatInput,
  dependencies: GroundedChatDependencies,
) {
  let evidence: EvidenceItem[] = [];
  let dataUnavailable: string | undefined;

  if (input.symbol?.trim()) {
    const bundle = await collectSymbolEvidence(
      input.userId,
      input.symbol.trim().toUpperCase(),
      dependencies.tools,
    );
    evidence = bundle.evidence;
    dataUnavailable = bundle.dataUnavailable;
  }

  return dependencies.gateway.answer({
    question: input.message,
    evidence,
    dataUnavailable,
    memoryContext: input.memoryContext,
    personaContext: input.personaContext,
  });
}
