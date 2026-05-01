export interface BridgeCallOptions {
  baseUrl: string;
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export async function bridgeCall<T>(opts: BridgeCallOptions): Promise<T> {
  const {
    baseUrl,
    path,
    method = 'GET',
    body,
    timeoutMs = 12_000,
  } = opts;

  const endpoint = `${normalizeBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message = payload?.message || payload?.error || payload?.detail || `HTTP ${res.status}`;
    throw new Error(message);
  }

  return payload as T;
}
