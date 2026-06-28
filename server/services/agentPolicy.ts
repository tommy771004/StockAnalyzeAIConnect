import type { AgentScope, ToolRiskClass } from '../ai/contracts.js';
import type { DataMarket } from '../data/types.js';

export interface AgentPrincipal {
  tokenId: string;
  userId: string;
  prefix: string;
  scopes: readonly AgentScope[];
  allowedMarkets: readonly DataMarket[];
  allowedInstruments: readonly string[];
  paperOnly: true;
  rateLimitPerMinute: number;
}

export class AgentPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentPolicyError';
  }
}

export function requireAgentScopes(
  principal: AgentPrincipal,
  required: readonly AgentScope[],
): void {
  const missing = required.filter((scope) => !principal.scopes.includes(scope));
  if (missing.length) {
    throw new AgentPolicyError(`Agent token requires scopes: ${missing.join(', ')}`);
  }
}

export function assertAgentInstrumentAllowed(
  principal: AgentPrincipal,
  symbol: string,
  market: DataMarket,
): void {
  const normalized = symbol.trim().toUpperCase();
  if (
    principal.allowedMarkets.length
    && !principal.allowedMarkets.includes(market)
  ) {
    throw new AgentPolicyError(`${market} is outside the market allowlist`);
  }
  if (
    principal.allowedInstruments.length
    && !principal.allowedInstruments.includes(normalized)
  ) {
    throw new AgentPolicyError(`${normalized} is outside the instrument allowlist`);
  }
}

export function requireAgentIdempotencyKey(
  riskClass: ToolRiskClass,
  value: string | undefined,
): string | undefined {
  if (riskClass === 'read') return undefined;
  const key = value?.trim();
  if (!key || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new AgentPolicyError(
      'A valid Idempotency-Key is required for agent mutations',
    );
  }
  return key;
}

function containsLiveIntent(value: unknown, depth = 0): boolean {
  if (depth > 12 || value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => containsLiveIntent(entry, depth + 1));
  }
  if (typeof value !== 'object') return false;

  for (const [rawKey, child] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.toLowerCase();
    if (key === 'paperonly' && child === false) return true;
    if ((key === 'live' || key === 'real') && child === true) return true;
    if (
      ['mode', 'brokermode', 'executionmode', 'tradingmode'].includes(key)
      && typeof child === 'string'
      && ['live', 'real'].includes(child.toLowerCase())
    ) return true;
    if (containsLiveIntent(child, depth + 1)) return true;
  }
  return false;
}

export function assertPaperOnlyRequest(
  principal: AgentPrincipal,
  request: unknown,
): void {
  if (!principal.paperOnly || containsLiveIntent(request)) {
    throw new AgentPolicyError('Agent commands are paper-only');
  }
}
