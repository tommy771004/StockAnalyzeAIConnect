/**
 * src/workers/socket.worker.ts
 *
 * WebSocket connection pool — lives entirely off the React render thread.
 *
 * Rule: skills/01_Frontend_Performance.md §2 "高頻數據與 Web Worker 通訊 (The Golden Rule)"
 * - WebSocket connections are created here, never in the main thread.
 * - Ticks are forwarded via postMessage.
 * - When WS is unavailable (e.g. Vercel without a real WS backend), fallback to
 *   HTTP polling against TradingView overview endpoints.
 *
 * Inbound commands (main → worker):
 *   { type: 'SUBSCRIBE',   symbol: string }
 *   { type: 'UNSUBSCRIBE', symbol: string }
 *   { type: 'CONNECT',     wsUrl?: string, apiBaseUrl?: string }
 *   { type: 'DISCONNECT' }
 *
 * Outbound events (worker → main):
 *   { type: 'TICK_UPDATE',     symbol: string, data: TickData }
 *   { type: 'CONNECTED',       wsUrl: string }
 *   { type: 'DISCONNECTED',    code: number, reason: string }
 *   { type: 'ERROR',           message: string }
 *   { type: 'SUBSCRIPTION_OK', symbol: string }
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TickData {
  price:     number;
  vol:       number;
  bid:       number;
  ask:       number;
  timestamp: number;
}

type InboundMsg =
  | { type: 'SUBSCRIBE';   symbol: string }
  | { type: 'UNSUBSCRIBE'; symbol: string }
  | { type: 'CONNECT';     wsUrl?: string; apiBaseUrl?: string }
  | { type: 'DISCONNECT' };

type OutboundMsg =
  | { type: 'TICK_UPDATE';     symbol: string; data: TickData }
  | { type: 'CONNECTED';       wsUrl: string }
  | { type: 'DISCONNECTED';    code: number; reason: string }
  | { type: 'ERROR';           message: string }
  | { type: 'SUBSCRIPTION_OK'; symbol: string };

// ─── Worker state ─────────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let currentWsUrl = '';
let currentApiBaseUrl = '';
const subscriptions = new Set<string>();

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 6;
const BASE_RECONNECT_DELAY = 2000; // ms, doubled each attempt

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 4500;

function post(msg: OutboundMsg): void {
  self.postMessage(msg);
}

function normalizeBaseUrl(raw?: string): string {
  if (!raw) return '';
  return raw.trim().replace(/\/+$/, '');
}

function buildApiUrl(path: string): string {
  if (!currentApiBaseUrl) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${currentApiBaseUrl}${normalizedPath}`;
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function resolveTickFromOverview(payload: Record<string, unknown>): TickData | null {
  const price =
    toNum(payload.close) ??
    toNum(payload.regularMarketPrice) ??
    toNum(payload.last_price) ??
    toNum(payload.price);

  if (price == null) return null;

  const vol =
    toNum(payload.volume) ??
    toNum(payload.regularMarketVolume) ??
    0;

  const bid = toNum(payload.bid) ?? price;
  const ask = toNum(payload.ask) ?? price;
  const timestamp =
    toNum(payload.t) ??
    toNum(payload.timestamp) ??
    Date.now();

  return { price, vol, bid, ask, timestamp };
}

function unpackOverviewResponse(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const asRecord = body as Record<string, unknown>;

  // python microservice style: { status: 'success', data: {...} }
  if (
    typeof asRecord.status === 'string' &&
    'data' in asRecord &&
    asRecord.data &&
    typeof asRecord.data === 'object'
  ) {
    return asRecord.data as Record<string, unknown>;
  }

  return asRecord;
}

// ─── Polling fallback ─────────────────────────────────────────────────────────

async function pollSymbol(symbol: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), POLL_TIMEOUT_MS);

  try {
    const url = buildApiUrl(`/api/tv/overview/${encodeURIComponent(symbol)}`);
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return;

    const body = (await res.json()) as unknown;
    const overview = unpackOverviewResponse(body);
    if (!overview) return;

    const tick = resolveTickFromOverview(overview);
    if (!tick) return;

    post({ type: 'TICK_UPDATE', symbol, data: tick });
  } catch {
    // Silent fallback: we keep retrying in next poll cycle.
  } finally {
    clearTimeout(timer);
  }
}

async function pollOnce(): Promise<void> {
  if (pollInFlight) return;
  if (subscriptions.size === 0) return;

  pollInFlight = true;
  try {
    const symbols = Array.from(subscriptions);
    await Promise.all(symbols.map((sym) => pollSymbol(sym)));
  } finally {
    pollInFlight = false;
  }
}

function startPolling(): void {
  if (pollTimer || subscriptions.size === 0) return;
  pollTimer = setInterval(() => {
    void pollOnce();
  }, POLL_INTERVAL_MS);
  void pollOnce();
}

function stopPolling(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

// ─── Reconnection logic ───────────────────────────────────────────────────────

function scheduleReconnect(): void {
  if (!currentWsUrl) {
    startPolling();
    return;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    post({ type: 'ERROR', message: 'WebSocket max reconnect attempts exceeded; switched to HTTP polling fallback' });
    startPolling();
    return;
  }

  const delay = BASE_RECONNECT_DELAY * 2 ** reconnectAttempts;
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => connect(currentWsUrl), delay);
  startPolling();
}

// ─── Connection management ────────────────────────────────────────────────────

function connect(wsUrl?: string): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws) {
    ws.onclose = null; // prevent old socket from triggering reconnect
    ws.close();
    ws = null;
  }

  currentWsUrl = (wsUrl ?? '').trim();
  if (!currentWsUrl) {
    startPolling();
    return;
  }

  try {
    ws = new WebSocket(currentWsUrl);
  } catch {
    post({ type: 'ERROR', message: 'Invalid WebSocket URL; switched to HTTP polling fallback' });
    startPolling();
    return;
  }

  ws.onopen = () => {
    reconnectAttempts = 0;
    stopPolling();
    post({ type: 'CONNECTED', wsUrl: currentWsUrl });
    for (const symbol of subscriptions) {
      sendSubscribe(symbol);
    }
  };

  ws.onmessage = (event: MessageEvent<string>) => {
    handleServerMessage(event.data);
  };

  ws.onerror = () => {
    post({ type: 'ERROR', message: 'WebSocket connection error; falling back to HTTP polling' });
    startPolling();
  };

  ws.onclose = (event: CloseEvent) => {
    post({ type: 'DISCONNECTED', code: event.code, reason: event.reason });
    if (event.code !== 1000) {
      scheduleReconnect();
    }
  };
}

function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onclose = null;
    ws.close(1000, 'Client disconnect');
    ws = null;
  }
  stopPolling();
  subscriptions.clear();
}

// ─── Subscription helpers ─────────────────────────────────────────────────────

function sendSubscribe(symbol: string): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'subscribe', symbol }));
  }
}

function sendUnsubscribe(symbol: string): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'unsubscribe', symbol }));
  }
}

// ─── Server message parsing ───────────────────────────────────────────────────

interface ServerTickFrame {
  type:   string;
  symbol: string;
  price?: number;
  vol?:   number;
  bid?:   number;
  ask?:   number;
  t?:     number;
}

function handleServerMessage(raw: string): void {
  let frame: ServerTickFrame;
  try {
    frame = JSON.parse(raw) as ServerTickFrame;
  } catch {
    return; // discard non-JSON frames
  }

  if (frame.type === 'tick' && frame.symbol && subscriptions.has(frame.symbol)) {
    const tick: TickData = {
      price:     frame.price     ?? 0,
      vol:       frame.vol       ?? 0,
      bid:       frame.bid       ?? 0,
      ask:       frame.ask       ?? 0,
      timestamp: frame.t         ?? Date.now(),
    };
    post({ type: 'TICK_UPDATE', symbol: frame.symbol, data: tick });
  }
}

// ─── Main thread message handler ─────────────────────────────────────────────

self.onmessage = (event: MessageEvent<InboundMsg>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'CONNECT':
      currentApiBaseUrl = normalizeBaseUrl(msg.apiBaseUrl);
      connect(msg.wsUrl);
      break;

    case 'DISCONNECT':
      disconnect();
      break;

    case 'SUBSCRIBE':
      subscriptions.add(msg.symbol);
      sendSubscribe(msg.symbol);
      if (!ws || ws.readyState !== WebSocket.OPEN) startPolling();
      post({ type: 'SUBSCRIPTION_OK', symbol: msg.symbol });
      break;

    case 'UNSUBSCRIBE':
      subscriptions.delete(msg.symbol);
      sendUnsubscribe(msg.symbol);
      if (subscriptions.size === 0) stopPolling();
      break;

    default:
      // Unknown command — ignore
      break;
  }
};

