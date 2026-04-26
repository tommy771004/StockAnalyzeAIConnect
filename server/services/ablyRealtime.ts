/**
 * server/services/ablyRealtime.ts
 * Ably Realtime bridge for AutoTrading events.
 *
 * Why this exists:
 * - Vercel environments may not keep raw WebSocket upgrades reliably for custom paths.
 * - Ably provides managed realtime transport; server publishes, clients subscribe directly.
 */

const ABLY_REST_BASE = 'https://rest.ably.io';
const ABLY_AUTH_URL = '/api/autotrading/ably/token';
const ABLY_CHANNEL = (process.env.ABLY_AUTOTRADING_CHANNEL ?? 'autotrading:global').trim();
const ABLY_API_KEY = (process.env.ABLY_API_KEY ?? '').trim();
const ABLY_TOKEN_TTL_MS = Math.max(60_000, Number(process.env.ABLY_TOKEN_TTL_MS ?? 60 * 60 * 1000));

const KEY_NAME = ABLY_API_KEY.includes(':') ? ABLY_API_KEY.split(':')[0] : '';

function getAblyDisabledReason(): string {
  if (!ABLY_API_KEY) return 'ABLY_API_KEY is empty';
  if (!ABLY_API_KEY.includes(':')) return 'ABLY_API_KEY format invalid (expected keyName:keySecret)';
  if (!KEY_NAME) return 'ABLY_API_KEY keyName is empty';
  return '';
}

function getBasicAuthHeader(): string {
  return `Basic ${Buffer.from(ABLY_API_KEY).toString('base64')}`;
}

export function isAblyEnabled(): boolean {
  return !!ABLY_API_KEY && !!KEY_NAME && ABLY_API_KEY.includes(':');
}

export function getAutotradingRealtimeMeta() {
  const reason = getAblyDisabledReason();
  return {
    provider: isAblyEnabled() ? 'ably' : 'ws',
    ably: {
      enabled: isAblyEnabled(),
      channel: ABLY_CHANNEL,
      authUrl: ABLY_AUTH_URL,
      reason: reason || undefined,
      keyName: KEY_NAME || undefined,
    },
    fallback: 'polling',
  };
}

export async function createAutotradingToken(clientId?: string) {
  if (!isAblyEnabled()) {
    throw new Error('ABLY_API_KEY is not configured');
  }

  const capability = JSON.stringify({
    [ABLY_CHANNEL]: ['subscribe'],
  });

  const body: Record<string, unknown> = {
    ttl: ABLY_TOKEN_TTL_MS,
    capability,
  };
  if (clientId) body.clientId = clientId;

  const endpoint = `${ABLY_REST_BASE}/keys/${encodeURIComponent(KEY_NAME)}/requestToken`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: getBasicAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ably requestToken failed (${res.status}): ${text || res.statusText}`);
  }

  return await res.json();
}

export async function publishAutotradingEvent(data: unknown): Promise<void> {
  if (!isAblyEnabled()) return;

  const payload = [
    {
      name: (data && typeof data === 'object' && 'type' in (data as Record<string, unknown>))
        ? String((data as Record<string, unknown>).type)
        : 'autotrading_event',
      data,
    },
  ];

  const endpoint = `${ABLY_REST_BASE}/channels/${encodeURIComponent(ABLY_CHANNEL)}/messages`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: getBasicAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[Ably] publish failed (${res.status}): ${text || res.statusText}`);
    }
  } catch (err) {
    console.warn('[Ably] publish error:', (err as Error).message);
  }
}
