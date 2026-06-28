import {
  EvidenceItemSchema,
  redactSensitiveText,
  type EvidenceItem,
} from './contracts.js';

export function createEvidenceContext(items: EvidenceItem[]): string {
  return items.map((raw) => {
    const item = EvidenceItemSchema.parse(raw);
    const source = item.source;
    return [
      `[${item.id}] ${redactSensitiveText(item.title)}`,
      `provider=${source.providerId}@${source.providerVersion}`,
      `retrievedAt=${source.retrievedAt}`,
      `marketTimestamp=${source.marketTimestamp}`,
      `delayed=${source.delayed}`,
      redactSensitiveText(item.content),
    ].join('\n');
  }).join('\n\n');
}

export function assertKnownCitations(
  evidence: EvidenceItem[],
  citations: Array<{ evidenceId: string }>,
  answer: string,
): void {
  const known = new Set(evidence.map((item) => item.id));
  for (const citation of citations) {
    if (!known.has(citation.evidenceId)) {
      throw new Error(`Unknown evidence citation: ${citation.evidenceId}`);
    }
    if (!answer.includes(`[${citation.evidenceId}]`)) {
      throw new Error(`Answer is missing citation marker: ${citation.evidenceId}`);
    }
  }
  if (evidence.length > 0 && citations.length === 0) {
    throw new Error('Evidence-backed answers require at least one citation');
  }
}
