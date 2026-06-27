import { z } from 'zod';

export const DataOperationSchema = z.enum([
  'quote',
  'bars',
  'technical',
  'news',
  'fundamentals',
  'institutional',
  'congress',
  'macroSeries',
  'economicCalendar',
  'search',
]);
export type DataOperation = z.infer<typeof DataOperationSchema>;

export const DataMarketSchema = z.enum([
  'tw_stock',
  'us_stock',
  'crypto',
  'forex',
  'macro',
  'global',
]);
export type DataMarket = z.infer<typeof DataMarketSchema>;

export const DataRequestParamsSchema = z.object({
  interval: z.string().trim().min(1).max(16).optional(),
  limit: z.number().int().positive().max(10_000).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  query: z.string().trim().min(1).max(500).optional(),
}).catchall(z.unknown()).default({});

export const DataRequestSchema = z.object({
  operation: DataOperationSchema,
  symbol: z.string().trim().min(1).max(64)
    .transform((symbol) => symbol.toUpperCase()),
  market: DataMarketSchema,
  params: DataRequestParamsSchema,
});
export type DataRequest = z.infer<typeof DataRequestSchema>;
export type DataRequestInput = z.input<typeof DataRequestSchema>;

const TimestampSchema = z.string().datetime({ offset: true });

export const ProviderPayloadSchema = z.object({
  data: z.unknown(),
  retrievedAt: TimestampSchema,
  marketTimestamp: TimestampSchema,
  delayed: z.boolean(),
  warnings: z.array(z.string()).default([]),
});
export type ProviderPayload = z.infer<typeof ProviderPayloadSchema>;

export const ProviderAttemptOutcomeSchema = z.enum([
  'success',
  'error',
  'timeout',
  'stale',
  'rate_limited',
  'circuit_open',
  'unsupported',
]);

export const ProviderAttemptSchema = z.object({
  providerId: z.string().min(1),
  outcome: ProviderAttemptOutcomeSchema,
  startedAt: TimestampSchema,
  durationMs: z.number().finite().nonnegative(),
  reasonCode: z.string().min(1).optional(),
});
export type ProviderAttempt = z.infer<typeof ProviderAttemptSchema>;

export const DataProvenanceSchema = z.object({
  providerId: z.string().min(1),
  providerVersion: z.string().min(1),
  retrievedAt: TimestampSchema,
  marketTimestamp: TimestampSchema,
  delayed: z.boolean(),
  cache: z.enum(['hit', 'miss']),
});
export type DataProvenance = z.infer<typeof DataProvenanceSchema>;

export const DataEnvelopeSchema = z.object({
  request: DataRequestSchema,
  data: z.unknown(),
  provenance: DataProvenanceSchema,
  attempts: z.array(ProviderAttemptSchema),
  warnings: z.array(z.string()).default([]),
});
export type DataEnvelope = z.infer<typeof DataEnvelopeSchema>;

export const RateLimitPolicySchema = z.object({
  limit: z.number().int().positive(),
  windowMs: z.number().int().positive(),
});

export const CircuitBreakerPolicySchema = z.object({
  failureThreshold: z.number().int().positive(),
  cooldownMs: z.number().int().positive(),
});

export const ProviderPolicySchema = z.object({
  timeoutMs: z.number().int().positive(),
  cacheTtlMs: z.number().int().nonnegative(),
  maxAgeMs: z.number().int().nonnegative(),
  rateLimit: RateLimitPolicySchema,
  circuitBreaker: CircuitBreakerPolicySchema,
});
export type ProviderPolicy = z.infer<typeof ProviderPolicySchema>;

export const ProviderDescriptorSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  operations: z.array(DataOperationSchema).min(1),
  markets: z.array(DataMarketSchema).min(1),
  priority: z.number().int(),
  policy: ProviderPolicySchema,
});
export type ProviderDescriptor = z.infer<typeof ProviderDescriptorSchema>;

export interface DataProvider extends ProviderDescriptor {
  fetch(request: DataRequest, signal: AbortSignal): Promise<ProviderPayload>;
}

export const ProviderHealthSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  operations: z.array(DataOperationSchema),
  markets: z.array(DataMarketSchema),
  breaker: z.enum(['closed', 'open', 'half_open']),
  rateRemaining: z.number().int().nonnegative(),
  lastSuccessAt: TimestampSchema.optional(),
  lastFailureAt: TimestampSchema.optional(),
});
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;

export const DataRegistryHealthSchema = z.object({
  providers: z.array(ProviderHealthSchema),
  cache: z.object({
    entries: z.number().int().nonnegative(),
    hits: z.number().int().nonnegative(),
    misses: z.number().int().nonnegative(),
    evictions: z.number().int().nonnegative(),
  }),
});
export type DataRegistryHealth = z.infer<typeof DataRegistryHealthSchema>;
