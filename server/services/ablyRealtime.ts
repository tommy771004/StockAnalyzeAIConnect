/**
 * server/services/ablyRealtime.ts
 * Ably Realtime bridge for AutoTrading events.
 *
 * Why this exists:
 * - Vercel environments may not keep raw WebSocket upgrades reliably for custom paths.
 * - Ably provides managed realtime transport; server publishes, clients subscribe directly.
 */

import { recordAutotradingDiagnostic } from './autotradingDiagnostics.js';

const ABLY_REST_BASE = 'https://rest.ably.io';
const ABLY_AUTH_URL = '/api/autotrading/ably/token';
const ABLY_CHANNEL = (process.env.ABLY_AUTOTRADING_CHANNEL ?? 'autotrading:global').trim();
const ABLY_API_KEY = (process.env.ABLY_API_KEY ?? '').trim();
const ABLY_TOKEN_TTL_MS = Math.max(60_000, Number(process.env.ABLY_TOKEN_TTL_MS ?? 60 * 60 * 1000));
const ABLY_PUBLISH_TIMEOUT_MS = Math.max(2000, Number(process.env.ABLY_PUBLISH_TIMEOUT_MS ?? 8000));
const ABLY_ERROR_LOG_COOLDOWN_MS = Math.max(5000, Number(process.env.ABLY_ERROR_LOG_COOLDOWN_MS ?? 60_000));

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

  // Ably REST requestToken 需要 timestamp 做新鮮度檢查 (錯誤碼 40001)
  // 即使使用 master key Basic auth，timestamp 也是必填欄位
  const body: Record<string, unknown> = {
    keyName: KEY_NAME,
    ttl: ABLY_TOKEN_TTL_MS,
    capability,
    timestamp: Date.now(),
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

// High-frequency event types that would overwhelm Ably REST if published individually.
// Clients retrieve logs via the REST polling endpoint instead.
const SKIP_ABLY_TYPES = new Set(['log_history']);

let _lastPublishErrorAt = 0;
function logAblyPublishError(message: string) {
  const now = Date.now();
  if (now - _lastPublishErrorAt < ABLY_ERROR_LOG_COOLDOWN_MS) return;
  _lastPublishErrorAt = now;
  console.warn(message);
}

// Batch queue: events are collected here and flushed together in a single Ably REST call,
// avoiding concurrent HTTP requests that cause "operation aborted due to timeout" errors.
let _pendingMessages: Array<{ name: string; data: unknown }> = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_FLUSH_MS = 300;

async function flushPendingMessages(): Promise<void> {
  _flushTimer = null;
  if (_pendingMessages.length === 0) return;
  const batch = _pendingMessages.splice(0); // drain atomically before any await

  const endpoint = `${ABLY_REST_BASE}/channels/${encodeURIComponent(ABLY_CHANNEL)}/messages`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: getBasicAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(ABLY_PUBLISH_TIMEOUT_MS),
    });
    if (!res.ok) {
      recordAutotradingDiagnostic(`ably.publish_http_${res.status}`);
      if (res.status === 429) recordAutotradingDiagnostic('ably.publish_rate_limited');
      const text = await res.text().catch(() => '');
      logAblyPublishError(`[Ably] publish failed (${res.status}): ${text || res.statusText}`);
      return;
    }
    recordAutotradingDiagnostic('ably.publish_success');
  } catch (err) {
    const msg = (err as Error).message;
    recordAutotradingDiagnostic(/aborted|timeout/i.test(msg) ? 'ably.publish_timeout' : 'ably.publish_error');
    logAblyPublishError(`[Ably] publish error: ${msg}`);
  }
}

// Synchronous enqueue — never blocks the agent tick.
// Events are batched and sent in a single HTTP call BATCH_FLUSH_MS after the first enqueue.
export function publishAutotradingEvent(data: unknown): void {
  if (!isAblyEnabled()) return;

  const type = (data && typeof data === 'object' && 'type' in (data as Record<string, unknown>))
    ? String((data as Record<string, unknown>).type)
    : 'autotrading_event';

  if (SKIP_ABLY_TYPES.has(type)) return;

  _pendingMessages.push({ name: type, data });

  if (!_flushTimer) {
    _flushTimer = setTimeout(() => { void flushPendingMessages(); }, BATCH_FLUSH_MS);
  }
}
