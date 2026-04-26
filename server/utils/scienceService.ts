const PYTHON_SERVICE_URL = process.env.SCIENCE_SERVICE_URL || 'http://127.0.0.1:8788';
const SCIENCE_TIMEOUT_MS = Number(process.env.SCIENCE_SERVICE_TIMEOUT_MS || 7000);
const SCIENCE_RETRY = Number(process.env.SCIENCE_SERVICE_RETRY || 1);
const CACHE_TTL_MS = Number(process.env.SCIENCE_SERVICE_CACHE_TTL_MS || 60_000);

export interface ScienceResponse<T> {
  status: 'success' | 'error';
  data: T | null;
  meta?: Record<string, unknown>;
  errors?: string[];
  message?: string;
}

const cacheStore = new Map<string, { expiresAt: number; payload: unknown }>();

function getCache<T>(key: string): T | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cacheStore.delete(key);
    return null;
  }
  return entry.payload as T;
}

function setCache<T>(key: string, payload: T, ttl = CACHE_TTL_MS) {
  cacheStore.set(key, { payload, expiresAt: Date.now() + ttl });
}

async function requestScience<T>(
  path: string,
  init?: RequestInit,
  opts?: { retries?: number; timeoutMs?: number; cacheKey?: string; cacheTtlMs?: number },
): Promise<ScienceResponse<T>> {
  const retries = Math.max(0, opts?.retries ?? SCIENCE_RETRY);
  const timeoutMs = Math.max(1000, opts?.timeoutMs ?? SCIENCE_TIMEOUT_MS);
  const cacheKey = opts?.cacheKey;

  if (cacheKey) {
    const cached = getCache<ScienceResponse<T>>(cacheKey);
    if (cached) return cached;
  }

  let lastError = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}${path}`, {
        ...init,
        signal: controller.signal,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = json?.message || `${res.status} ${res.statusText}`;
        lastError = `HTTP ${message}`;
      } else {
        const payload: ScienceResponse<T> = {
          status: json?.status === 'error' ? 'error' : 'success',
          data: json?.data ?? null,
          meta: json?.meta,
          errors: Array.isArray(json?.errors) ? json.errors : undefined,
          message: json?.message,
        };
        if (cacheKey && payload.status === 'success') {
          setCache(cacheKey, payload, opts?.cacheTtlMs);
        }
        return payload;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    status: 'error',
    data: null,
    errors: [lastError || 'Science service request failed'],
  };
}

export async function searchArxiv(query: string, maxResults: number = 3) {
  const cacheKey = `arxiv:${query}:${maxResults}`;
  return requestScience<any[]>(
    `/arxiv/search?query=${encodeURIComponent(query)}&max_results=${maxResults}`,
    { method: 'GET' },
    { cacheKey, cacheTtlMs: 5 * 60_000 },
  );
}

export async function scrapeUrls(urls: string[]) {
  const normalized = urls.map((u) => u.trim()).filter(Boolean).sort();
  const cacheKey = `scrape:${normalized.join('|')}`;
  return requestScience<Record<string, string>>(
    `/web/scrape?urls=${encodeURIComponent(normalized.join(','))}`,
    { method: 'GET' },
    { cacheKey, cacheTtlMs: 2 * 60_000 },
  );
}

export async function polarsBacktest(payload: any) {
  return requestScience<any>(
    '/polars/backtest',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { retries: 0, timeoutMs: Math.max(10_000, SCIENCE_TIMEOUT_MS) },
  );
}

export async function aggregateFeatures(payload: any) {
  return requestScience<any>(
    '/features/aggregate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { retries: 0, timeoutMs: Math.max(10_000, SCIENCE_TIMEOUT_MS) },
  );
}

export async function timesFmPredict(symbol: string, ticks: number = 10, history: number[] = []) {
  return requestScience<any>(
    '/timesfm/predict',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, ticks, history }),
    },
    { retries: 0, timeoutMs: Math.max(8_000, SCIENCE_TIMEOUT_MS) },
  );
}

export async function getQuantumSignal(payload: {
  symbol: string;
  prices?: number[];
  features?: Record<string, number>;
  shots?: number;
}) {
  return requestScience<any>(
    '/quantum/signal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { retries: 0, timeoutMs: Math.max(6_000, SCIENCE_TIMEOUT_MS) },
  );
}
