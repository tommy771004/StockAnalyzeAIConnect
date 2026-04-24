/**
 * src/workers/socket.worker.ts
 *
 * WebSocket connection pool — lives entirely off the React render thread.
 *
 * Rule: skills/01_Frontend_Performance.md §2 "高頻數據與 Web Worker 通訊 (The Golden Rule)"
 * - WebSocket connections are created here, never in the main thread.
 * - Ticks are received, decompressed (if needed), and forwarded via postMessage.
 * - Components receive data via addEventListener('message') + useRef; no useState/Zustand.
 *
 * Inbound commands (main → worker):
 *   { type: 'SUBSCRIBE',   symbol: string }
 *   { type: 'UNSUBSCRIBE', symbol: string }
 *   { type: 'CONNECT',     wsUrl: string }
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
  | { type: 'CONNECT';     wsUrl: string }
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
const subscriptions = new Set<string>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 6;
const BASE_RECONNECT_DELAY   = 2000; // ms, doubled each attempt (exponential backoff)

function post(msg: OutboundMsg): void {
  self.postMessage(msg);
}

// ─── Reconnection logic ───────────────────────────────────────────────────────

function scheduleReconnect(): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    post({ type: 'ERROR', message: 'WebSocket max reconnect attempts exceeded' });
    return;
  }
  const delay = BASE_RECONNECT_DELAY * 2 ** reconnectAttempts;
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => connect(currentWsUrl), delay);
}

// ─── Connection management ────────────────────────────────────────────────────

function connect(wsUrl: string): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onclose = null; // prevent old socket from triggering reconnect
    ws.close();
    ws = null;
  }

  currentWsUrl = wsUrl;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    reconnectAttempts = 0;
    post({ type: 'CONNECTED', wsUrl });
    // Re-subscribe to all tracked symbols on reconnect
    for (const symbol of subscriptions) {
      sendSubscribe(symbol);
    }
  };

  ws.onmessage = (event: MessageEvent<string>) => {
    handleServerMessage(event.data);
  };

  ws.onerror = () => {
    post({ type: 'ERROR', message: 'WebSocket connection error' });
  };

  ws.onclose = (event: CloseEvent) => {
    post({ type: 'DISCONNECTED', code: event.code, reason: event.reason });
    if (event.code !== 1000) {
      // Abnormal close — attempt reconnect
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
      connect(msg.wsUrl);
      break;

    case 'DISCONNECT':
      disconnect();
      break;

    case 'SUBSCRIBE':
      subscriptions.add(msg.symbol);
      sendSubscribe(msg.symbol);
      post({ type: 'SUBSCRIPTION_OK', symbol: msg.symbol });
      break;

    case 'UNSUBSCRIBE':
      subscriptions.delete(msg.symbol);
      sendUnsubscribe(msg.symbol);
      break;

    default:
      // Unknown command — ignore
      break;
  }
};
