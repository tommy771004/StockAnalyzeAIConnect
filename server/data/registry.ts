import { TtlCache } from './cache.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { FixedWindowRateLimiter } from './rateLimiter.js';
import {
  DataRequestSchema,
  ProviderDescriptorSchema,
  ProviderPayloadSchema,
  type DataEnvelope,
  type DataProvider,
  type DataRegistryHealth,
  type DataRequest,
  type DataRequestInput,
  type ProviderAttempt,
  type ProviderPayload,
} from './types.js';

interface RegistryOptions {
  now?: () => number;
  cacheMaxEntries?: number;
}

interface CachedResolution {
  data: unknown;
  provenance: Omit<DataEnvelope['provenance'], 'cache'>;
  warnings: string[];
}

interface ProviderRuntime {
  provider: DataProvider;
  limiter: FixedWindowRateLimiter;
  breaker: CircuitBreaker;
  lastSuccessAt?: string;
  lastFailureAt?: string;
}

class ProviderTimeoutError extends Error {}

export class DataResolutionError extends Error {
  constructor(
    request: DataRequest,
    public readonly attempts: ProviderAttempt[],
  ) {
    super(`No provider could resolve ${request.operation}:${request.symbol}`);
    this.name = 'DataResolutionError';
  }
}

export class DataProviderRegistry {
  private readonly now: () => number;
  private readonly cache: TtlCache<CachedResolution>;
  private readonly runtimes: ProviderRuntime[];

  constructor(providers: DataProvider[], options: RegistryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.cache = new TtlCache(options.cacheMaxEntries ?? 500, this.now);

    const ids = new Set<string>();
    this.runtimes = providers.map((provider) => {
      ProviderDescriptorSchema.parse(provider);
      if (ids.has(provider.id)) {
        throw new Error(`Duplicate data provider ID: ${provider.id}`);
      }
      ids.add(provider.id);
      return {
        provider,
        limiter: new FixedWindowRateLimiter(provider.policy.rateLimit, this.now),
        breaker: new CircuitBreaker(provider.policy.circuitBreaker, this.now),
      };
    }).sort((left, right) => left.provider.priority - right.provider.priority);
  }

  async resolve(input: DataRequestInput): Promise<DataEnvelope> {
    const request = DataRequestSchema.parse(input);
    const cacheKey = this.cacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        request,
        data: cached.data,
        provenance: { ...cached.provenance, cache: 'hit' },
        attempts: [],
        warnings: [...cached.warnings],
      };
    }

    const attempts: ProviderAttempt[] = [];
    const candidates = this.runtimes.filter(({ provider }) => (
      provider.operations.includes(request.operation)
      && provider.markets.includes(request.market)
    ));

    for (const runtime of candidates) {
      const { provider } = runtime;
      const startedAtMs = this.now();
      const startedAt = this.toIso(startedAtMs);

      if (!runtime.breaker.canRequest()) {
        attempts.push(this.attempt(
          provider.id,
          'circuit_open',
          startedAt,
          startedAtMs,
          'CIRCUIT_OPEN',
        ));
        continue;
      }

      if (!runtime.limiter.consume()) {
        attempts.push(this.attempt(
          provider.id,
          'rate_limited',
          startedAt,
          startedAtMs,
          'RATE_LIMITED',
        ));
        continue;
      }

      try {
        const payload = await this.fetchWithTimeout(provider, request);
        const validated = ProviderPayloadSchema.parse(payload);
        const freshnessReference = request.operation === 'bars'
          && typeof request.params.end === 'string'
          ? Date.parse(request.params.end)
          : this.now();
        const maxAgeMs = provider.policy.maxAgeByOperation?.[request.operation]
          ?? provider.policy.maxAgeMs;
        if (
          freshnessReference - Date.parse(validated.marketTimestamp)
          > maxAgeMs
        ) {
          runtime.breaker.recordFailure();
          runtime.lastFailureAt = this.toIso(this.now());
          attempts.push(this.attempt(
            provider.id,
            'stale',
            startedAt,
            startedAtMs,
            'STALE_DATA',
          ));
          continue;
        }

        runtime.breaker.recordSuccess();
        runtime.lastSuccessAt = this.toIso(this.now());
        attempts.push(this.attempt(provider.id, 'success', startedAt, startedAtMs));

        const provenance = {
          providerId: provider.id,
          providerVersion: provider.version,
          retrievedAt: validated.retrievedAt,
          marketTimestamp: validated.marketTimestamp,
          delayed: validated.delayed,
        };
        const cachedResolution: CachedResolution = {
          data: validated.data,
          provenance,
          warnings: [...validated.warnings],
        };
        this.cache.set(cacheKey, cachedResolution, provider.policy.cacheTtlMs);

        return {
          request,
          data: validated.data,
          provenance: { ...provenance, cache: 'miss' },
          attempts,
          warnings: [...validated.warnings],
        };
      } catch (error) {
        runtime.breaker.recordFailure();
        runtime.lastFailureAt = this.toIso(this.now());
        const timedOut = error instanceof ProviderTimeoutError;
        attempts.push(this.attempt(
          provider.id,
          timedOut ? 'timeout' : 'error',
          startedAt,
          startedAtMs,
          timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
        ));
      }
    }

    throw new DataResolutionError(request, attempts);
  }

  health(): DataRegistryHealth {
    return {
      providers: this.runtimes.map((runtime) => ({
        id: runtime.provider.id,
        version: runtime.provider.version,
        operations: [...runtime.provider.operations],
        markets: [...runtime.provider.markets],
        breaker: runtime.breaker.state(),
        rateRemaining: runtime.limiter.remaining(),
        lastSuccessAt: runtime.lastSuccessAt,
        lastFailureAt: runtime.lastFailureAt,
      })),
      cache: this.cache.metrics(),
    };
  }

  private async fetchWithTimeout(
    provider: DataProvider,
    request: DataRequest,
  ): Promise<ProviderPayload> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ProviderTimeoutError('Provider request timed out'));
      }, provider.policy.timeoutMs);
    });

    try {
      return await Promise.race([
        provider.fetch(request, controller.signal),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private attempt(
    providerId: string,
    outcome: ProviderAttempt['outcome'],
    startedAt: string,
    startedAtMs: number,
    reasonCode?: string,
  ): ProviderAttempt {
    return {
      providerId,
      outcome,
      startedAt,
      durationMs: Math.max(0, this.now() - startedAtMs),
      ...(reasonCode ? { reasonCode } : {}),
    };
  }

  private cacheKey(request: DataRequest): string {
    const params = Object.fromEntries(
      Object.entries(request.params).sort(([left], [right]) => left.localeCompare(right)),
    );
    return JSON.stringify([
      request.operation,
      request.market,
      request.symbol,
      params,
    ]);
  }

  private toIso(timestamp: number): string {
    return new Date(timestamp).toISOString();
  }
}
