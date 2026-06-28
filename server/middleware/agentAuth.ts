import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

import { AgentScopeSchema } from '../ai/contracts.js';
import { DataMarketSchema } from '../data/types.js';
import { FixedWindowRateLimiter } from '../data/rateLimiter.js';
import {
  findAgentTokenByHash,
  isAgentTokenUsable,
  touchAgentToken,
} from '../repositories/agentGatewayRepo.js';
import type { AgentToken } from '../../src/db/schema.js';
import { sha256Hex } from '../utils/hash.js';
import type { AgentPrincipal } from '../services/agentPolicy.js';

const AgentTokenPattern = /^(hagt_[a-f0-9]{8})_[A-Za-z0-9_-]{20,}$/;

export class AgentAuthenticationError extends Error {
  constructor(
    message = 'Invalid agent token',
    public readonly status = 401,
  ) {
    super(message);
    this.name = 'AgentAuthenticationError';
  }
}

export function constantTimeEqualHex(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export class AgentRateGate {
  private readonly limits = new Map<string, {
    limit: number;
    limiter: FixedWindowRateLimiter;
  }>();

  constructor(private readonly now: () => number = Date.now) {}

  consume(tokenId: string, limit: number): boolean {
    let entry = this.limits.get(tokenId);
    if (!entry || entry.limit !== limit) {
      entry = {
        limit,
        limiter: new FixedWindowRateLimiter(
          { limit, windowMs: 60_000 },
          this.now,
        ),
      };
      this.limits.set(tokenId, entry);
    }
    return entry.limiter.consume();
  }
}

interface AgentAuthDependencies {
  findByHash(tokenHash: string): Promise<AgentToken | null>;
  touch?(tokenId: string): Promise<void>;
  rateGate?: AgentRateGate;
}

export async function authenticateAgentAuthorization(
  authorization: string | undefined,
  dependencies: AgentAuthDependencies,
  now = new Date(),
): Promise<AgentPrincipal> {
  const raw = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  const match = AgentTokenPattern.exec(raw);
  if (!match) throw new AgentAuthenticationError();

  const tokenHash = await sha256Hex(raw);
  const row = await dependencies.findByHash(tokenHash);
  if (
    !row
    || !constantTimeEqualHex(tokenHash, row.tokenHash)
    || row.prefix !== match[1]
    || !isAgentTokenUsable(row, now)
    || row.paperOnly !== true
  ) {
    throw new AgentAuthenticationError();
  }

  const scopes = z.array(AgentScopeSchema).parse(row.scopes);
  const allowedMarkets = z.array(DataMarketSchema).parse(row.allowedMarkets);
  const allowedInstruments = row.allowedInstruments.map(
    (symbol) => symbol.toUpperCase(),
  );
  if (
    dependencies.rateGate
    && !dependencies.rateGate.consume(row.id, row.rateLimitPerMinute)
  ) {
    throw new AgentAuthenticationError('Agent token rate limit exceeded', 429);
  }
  await dependencies.touch?.(row.id);

  return {
    tokenId: row.id,
    userId: row.userId,
    prefix: row.prefix,
    scopes,
    allowedMarkets,
    allowedInstruments,
    paperOnly: true,
    rateLimitPerMinute: row.rateLimitPerMinute,
  };
}

export interface AgentRequest extends Request {
  agent?: AgentPrincipal;
}

const defaultRateGate = new AgentRateGate();

export function createAgentAuthMiddleware(
  dependencies: AgentAuthDependencies = {
    findByHash: findAgentTokenByHash,
    touch: touchAgentToken,
    rateGate: defaultRateGate,
  },
): RequestHandler {
  return async (request: AgentRequest, response: Response, next: NextFunction) => {
    try {
      request.agent = await authenticateAgentAuthorization(
        request.header('authorization'),
        dependencies,
      );
      next();
    } catch (error) {
      const status = error instanceof AgentAuthenticationError ? error.status : 401;
      response.status(status).json({ error: 'Invalid agent token' });
    }
  };
}

export const agentAuthMiddleware = createAgentAuthMiddleware();
