import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../src/db/index.js';
import {
  agentAuditEvents,
  agentIdempotency,
  agentTokens,
  type AgentIdempotencyRecord,
  type AgentToken,
} from '../../src/db/schema.js';
import {
  AgentAuditEventSchema,
  AgentScopeSchema,
  AgentTokenPublicSchema,
  redactAuditMetadata,
  type AgentAuditEvent,
  type AgentTokenPublic,
} from '../ai/contracts.js';
import { sha256Hex } from '../utils/hash.js';

export interface AgentTokenMaterial {
  plaintext: string;
  prefix: string;
  tokenHash: string;
}

export async function createAgentTokenMaterial(
  suppliedEntropy?: Uint8Array,
): Promise<AgentTokenMaterial> {
  const entropy = suppliedEntropy ?? globalThis.crypto.getRandomValues(new Uint8Array(32));
  if (entropy.byteLength !== 32) {
    throw new Error('Agent token entropy must be exactly 32 bytes');
  }
  const prefixHex = Array.from(entropy.slice(0, 4))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const prefix = `hagt_${prefixHex}`;
  const secret = Buffer.from(entropy).toString('base64url');
  const plaintext = `${prefix}_${secret}`;
  return {
    plaintext,
    prefix,
    tokenHash: await sha256Hex(plaintext),
  };
}

export function isAgentTokenUsable(
  token: Pick<AgentToken, 'expiresAt' | 'revokedAt'>,
  now = new Date(),
): boolean {
  return token.revokedAt === null && token.expiresAt.getTime() > now.getTime();
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key was already used for a different request');
    this.name = 'IdempotencyConflictError';
  }
}

export type IdempotencyResolution =
  | { kind: 'replay'; responseStatus: number; responseBody: unknown }
  | { kind: 'in_progress' }
  | { kind: 'retry_failed' };

export function resolveIdempotencyRecord(
  record: Pick<
    AgentIdempotencyRecord,
    'requestHash' | 'status' | 'responseStatus' | 'responseBody'
  >,
  requestHash: string,
): IdempotencyResolution {
  if (record.requestHash !== requestHash) throw new IdempotencyConflictError();
  if (record.status === 'completed' && record.responseStatus !== null) {
    return {
      kind: 'replay',
      responseStatus: record.responseStatus,
      responseBody: record.responseBody,
    };
  }
  if (record.status === 'in_progress') return { kind: 'in_progress' };
  return { kind: 'retry_failed' };
}

function requireDb() {
  if (!db) throw new Error('Database is unavailable');
  return db;
}

const CreateTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(AgentScopeSchema).min(1).max(5),
  expiresAt: z.coerce.date(),
  allowedMarkets: z.array(z.string()).max(6).default([]),
  allowedInstruments: z.array(z.string().trim().min(1).max(64))
    .max(500)
    .default([]),
  rateLimitPerMinute: z.number().int().positive().max(10_000).default(60),
});

export function toAgentTokenPublic(row: {
  id: string;
  prefix: string;
  name: string;
  scopes: string[];
  expiresAt: Date;
  allowedMarkets: string[];
  allowedInstruments: string[];
  paperOnly: boolean;
  revokedAt: Date | null;
  createdAt: Date;
  [key: string]: unknown;
}): AgentTokenPublic {
  return AgentTokenPublicSchema.parse({
    id: row.id,
    prefix: row.prefix,
    name: row.name,
    scopes: row.scopes,
    expiresAt: row.expiresAt.toISOString(),
    allowedMarkets: row.allowedMarkets,
    allowedInstruments: row.allowedInstruments,
    paperOnly: row.paperOnly,
    revokedAt: row.revokedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

export async function createAgentToken(
  userId: string,
  input: z.input<typeof CreateTokenSchema>,
): Promise<{ token: AgentTokenPublic; plaintext: string }> {
  const parsed = CreateTokenSchema.parse(input);
  const material = await createAgentTokenMaterial();
  const [row] = await requireDb()
    .insert(agentTokens)
    .values({
      userId,
      name: parsed.name,
      prefix: material.prefix,
      tokenHash: material.tokenHash,
      scopes: parsed.scopes,
      expiresAt: parsed.expiresAt,
      allowedMarkets: parsed.allowedMarkets,
      allowedInstruments: parsed.allowedInstruments.map((symbol) => symbol.toUpperCase()),
      paperOnly: true,
      rateLimitPerMinute: parsed.rateLimitPerMinute,
    })
    .returning();
  const token = toAgentTokenPublic(row);
  return { token, plaintext: material.plaintext };
}

export async function listAgentTokens(userId: string): Promise<AgentTokenPublic[]> {
  const rows = await requireDb()
    .select({
      id: agentTokens.id,
      prefix: agentTokens.prefix,
      name: agentTokens.name,
      scopes: agentTokens.scopes,
      expiresAt: agentTokens.expiresAt,
      allowedMarkets: agentTokens.allowedMarkets,
      allowedInstruments: agentTokens.allowedInstruments,
      paperOnly: agentTokens.paperOnly,
      revokedAt: agentTokens.revokedAt,
      createdAt: agentTokens.createdAt,
    })
    .from(agentTokens)
    .where(eq(agentTokens.userId, userId))
    .orderBy(desc(agentTokens.createdAt));
  return rows.map(toAgentTokenPublic);
}

export async function revokeAgentToken(
  userId: string,
  tokenId: string,
): Promise<boolean> {
  const rows = await requireDb()
    .update(agentTokens)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(agentTokens.id, tokenId),
      eq(agentTokens.userId, userId),
    ))
    .returning({ id: agentTokens.id });
  return rows.length > 0;
}

export async function findAgentTokenByHash(
  tokenHash: string,
): Promise<AgentToken | null> {
  const [row] = await requireDb()
    .select()
    .from(agentTokens)
    .where(eq(agentTokens.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

export async function touchAgentToken(tokenId: string): Promise<void> {
  await requireDb()
    .update(agentTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentTokens.id, tokenId));
}

export async function beginAgentIdempotency(input: {
  tokenId: string;
  userId: string;
  key: string;
  route: string;
  requestHash: string;
}): Promise<
  | { kind: 'started'; record: AgentIdempotencyRecord }
  | IdempotencyResolution
> {
  const database = requireDb();
  const [created] = await database
    .insert(agentIdempotency)
    .values({
      ...input,
      status: 'in_progress',
    })
    .onConflictDoNothing({
      target: [agentIdempotency.tokenId, agentIdempotency.key],
    })
    .returning();
  if (created) return { kind: 'started', record: created };

  const [existing] = await database
    .select()
    .from(agentIdempotency)
    .where(and(
      eq(agentIdempotency.tokenId, input.tokenId),
      eq(agentIdempotency.key, input.key),
    ))
    .limit(1);
  if (!existing) throw new Error('Idempotency record could not be loaded');
  return resolveIdempotencyRecord(existing, input.requestHash);
}

export async function completeAgentIdempotency(input: {
  id: string;
  tokenId: string;
  userId: string;
  responseStatus: number;
  responseBody: unknown;
  resourceIds?: string[];
}): Promise<void> {
  await requireDb()
    .update(agentIdempotency)
    .set({
      status: 'completed',
      responseStatus: input.responseStatus,
      responseBody: input.responseBody,
      resourceIds: input.resourceIds ?? [],
      updatedAt: new Date(),
    })
    .where(and(
      eq(agentIdempotency.id, input.id),
      eq(agentIdempotency.tokenId, input.tokenId),
      eq(agentIdempotency.userId, input.userId),
    ));
}

export async function failAgentIdempotency(input: {
  id: string;
  tokenId: string;
  userId: string;
  responseStatus: number;
  responseBody: unknown;
}): Promise<void> {
  await requireDb()
    .update(agentIdempotency)
    .set({
      status: 'failed',
      responseStatus: input.responseStatus,
      responseBody: input.responseBody,
      updatedAt: new Date(),
    })
    .where(and(
      eq(agentIdempotency.id, input.id),
      eq(agentIdempotency.tokenId, input.tokenId),
      eq(agentIdempotency.userId, input.userId),
    ));
}

export async function appendAgentAuditEvent(
  input: Omit<AgentAuditEvent, 'createdAt'> & {
    tokenId?: string;
    createdAt?: string;
  },
): Promise<void> {
  const event = AgentAuditEventSchema.parse({
    ...input,
    metadata: redactAuditMetadata(input.metadata),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  await requireDb().insert(agentAuditEvents).values({
    tokenId: input.tokenId,
    tokenPrefix: event.tokenPrefix,
    userId: event.userId,
    route: event.route,
    riskClass: event.riskClass,
    requestHash: event.requestHash,
    status: event.status,
    latencyMs: event.latencyMs,
    promptVersion: event.promptVersion,
    toolVersion: event.toolVersion,
    resourceIds: event.resourceIds,
    metadata: event.metadata,
    createdAt: new Date(event.createdAt),
  });
}

export async function listAgentAuditEvents(
  userId: string,
  limit = 100,
) {
  return requireDb()
    .select()
    .from(agentAuditEvents)
    .where(eq(agentAuditEvents.userId, userId))
    .orderBy(desc(agentAuditEvents.createdAt))
    .limit(Math.max(1, Math.min(500, limit)));
}
