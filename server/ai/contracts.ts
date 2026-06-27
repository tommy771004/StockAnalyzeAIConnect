import { z } from 'zod';

import { DataMarketSchema } from '../data/types.js';

const TimestampSchema = z.string().datetime({ offset: true });
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const AgentScopeSchema = z.enum(['R', 'W', 'B', 'T', 'A']);
export type AgentScope = z.infer<typeof AgentScopeSchema>;

export const ToolRiskClassSchema = z.enum([
  'read',
  'workspace',
  'backtest',
  'paper_trade',
  'admin',
]);
export type ToolRiskClass = z.infer<typeof ToolRiskClassSchema>;

export const EvidenceSourceSchema = z.object({
  providerId: z.string().min(1),
  providerVersion: z.string().min(1),
  retrievedAt: TimestampSchema,
  marketTimestamp: TimestampSchema,
  delayed: z.boolean(),
});

export const EvidenceItemSchema = z.object({
  id: z.string().regex(/^E[1-9]\d*$/),
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(20_000),
  source: EvidenceSourceSchema,
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const DataUnavailableSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
  message: z.string().trim().min(1).max(500),
});

export const ToolResultSchema = z.object({
  toolName: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  toolVersion: z.string().trim().min(1).max(32),
  promptVersion: z.string().trim().min(1).max(64).optional(),
  data: z.unknown().optional(),
  evidence: z.array(EvidenceItemSchema).max(100),
  dataUnavailable: DataUnavailableSchema.optional(),
  warnings: z.array(z.string().max(500)).max(100).default([]),
}).superRefine((value, context) => {
  const hasData = Object.prototype.hasOwnProperty.call(value, 'data')
    && value.data !== undefined;
  const hasUnavailable = value.dataUnavailable !== undefined;
  if (hasData === hasUnavailable) {
    context.addIssue({
      code: 'custom',
      message: 'Tool result must contain either data or dataUnavailable',
    });
  }
  if (hasData && value.evidence.length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'Fact-bearing tool data requires evidence',
      path: ['evidence'],
    });
  }
  const evidenceIds = value.evidence.map((item) => item.id);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    context.addIssue({
      code: 'custom',
      message: 'Evidence IDs must be unique',
      path: ['evidence'],
    });
  }
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const PromptDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_.-]{2,127}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i),
  sha256: HashSchema,
  template: z.string().min(1).max(100_000),
});
export type PromptDefinition = z.infer<typeof PromptDefinitionSchema>;

export const ToolDefinitionSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  version: z.string().trim().min(1).max(32),
  description: z.string().trim().min(1).max(1_000),
  riskClass: ToolRiskClassSchema,
  requiredScopes: z.array(AgentScopeSchema).min(1).max(5)
    .refine((scopes) => new Set(scopes).size === scopes.length, {
      message: 'Required scopes must be unique',
    }),
  inputSchema: z.record(z.string(), z.unknown()),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const AgentTokenPrefixSchema = z.string().regex(/^hagt_[a-f0-9]{8}$/);

export const AgentTokenPublicSchema = z.object({
  id: z.string().min(1),
  prefix: AgentTokenPrefixSchema,
  name: z.string().trim().min(1).max(100),
  scopes: z.array(AgentScopeSchema).min(1).max(5)
    .refine((scopes) => new Set(scopes).size === scopes.length, {
      message: 'Token scopes must be unique',
    }),
  expiresAt: TimestampSchema,
  allowedMarkets: z.array(DataMarketSchema).max(6).default([]),
  allowedInstruments: z.array(
    z.string().trim().min(1).max(64).transform((symbol) => symbol.toUpperCase()),
  ).max(500).default([]),
  paperOnly: z.literal(true).default(true),
  revokedAt: TimestampSchema.optional(),
  createdAt: TimestampSchema.optional(),
});
export type AgentTokenPublic = z.infer<typeof AgentTokenPublicSchema>;

export const GatewayMutationSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128)
    .regex(/^[A-Za-z0-9._:-]+$/),
  request: z.unknown(),
});

export const AgentAuditEventSchema = z.object({
  tokenPrefix: AgentTokenPrefixSchema.optional(),
  userId: z.string().min(1),
  route: z.string().startsWith('/api/agent/v1/'),
  riskClass: ToolRiskClassSchema,
  requestHash: HashSchema,
  status: z.enum([
    'success',
    'denied',
    'validation_error',
    'server_error',
  ]),
  latencyMs: z.number().finite().nonnegative(),
  promptVersion: z.string().max(64).optional(),
  toolVersion: z.string().max(32).optional(),
  resourceIds: z.array(z.string().min(1).max(200)).max(100).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: TimestampSchema,
});
export type AgentAuditEvent = z.infer<typeof AgentAuditEventSchema>;

export const AgentCitationSchema = z.object({
  evidenceId: z.string().regex(/^E[1-9]\d*$/),
  claim: z.string().trim().min(1).max(1_000),
});

export const AgentAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(100_000),
  citations: z.array(AgentCitationSchema).max(100),
  promptVersion: z.string().min(1).max(64),
  model: z.string().min(1).max(200),
});

const SensitiveKey = /authorization|cookie|password|secret|api.?key|access.?token|refresh.?token/i;
const SensitiveStringPatterns = [
  /Bearer\s+\S+/gi,
  /\bsk-[A-Za-z0-9_-]{6,}\b/g,
  /\bhagt_[a-f0-9]{8}_[A-Za-z0-9_-]+\b/gi,
  /\b(?:token|api_?key|apikey|secret)\s*=\s*\S+/gi,
];

function redact(value: unknown, key?: string, depth = 0): unknown {
  if (key && SensitiveKey.test(key)) return '[REDACTED]';
  if (depth > 12) return '[TRUNCATED]';
  if (typeof value === 'string') {
    return SensitiveStringPatterns.reduce(
      (text, pattern) => text.replace(pattern, '[REDACTED]'),
      value,
    );
  }
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((item) => redact(item, undefined, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 500)
        .map(([entryKey, entryValue]) => [
          entryKey,
          redact(entryValue, entryKey, depth + 1),
        ]),
    );
  }
  return value;
}

export function redactAuditMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return redact(metadata) as Record<string, unknown>;
}
