/**
 * src/components/AutoTrading/useAutotradingWS.ts
 * Realtime hook for AutoTrading.
 *
 * Transport preference:
 * 1) Ably (when configured)
 * 2) Native WebSocket (/ws/autotrading)
 * 3) HTTP polling fallback
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as api from '../../services/api';
import type {
  AgentLog,
  AccountBalance,
  Position,
  AgentStatus,
  AgentConfig,
  RiskStats,
  DecisionHeat,
  EquitySnapshot,
} from './types';

const WS_PATH = '/ws/autotrading';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 2;
const POLL_INTERVAL_MS = 5000;
const MAX_LOGS = 300;

const PROVIDER_HINT = String(import.meta.env.VITE_AUTOTRADING_RT_PROVIDER ?? 'auto').toLowerCase();
const WS_DISABLED = ['1', 'true', 'yes', 'on'].includes(String(import.meta.env.VITE_DISABLE_AUTOTRADING_WS ?? '').toLowerCase());
const ABLY_DISABLED = ['1', 'true', 'yes', 'on'].includes(String(import.meta.env.VITE_DISABLE_AUTOTRADING_ABLY ?? '').toLowerCase());
const ABLY_SDK_URL = 'https://cdn.ably.com/lib/ably.min-2.js';
const DEFAULT_POLLING_REASON = 'Realtime 未連線，已切換為輪詢模式。';

type RealtimeTransport = 'none' | 'ably' | 'ws' | 'polling';

declare global {
  interface Window {
    Ably?: any;
  }
}

let ablySdkLoading: Promise<void> | null = null;

function ensureAblySdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('window is unavailable'));
  if (window.Ably?.Realtime) return Promise.resolve();

  if (!ablySdkLoading) {
    ablySdkLoading = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-ably-sdk="1"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load Ably SDK')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = ABLY_SDK_URL;
      script.async = true;
      script.defer = true;
      script.dataset.ablySdk = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Ably SDK'));
      document.head.appendChild(script);
    });
  }

  return ablySdkLoading;
}

export interface OrderLifecycleEvent {
  orderId: number;
  status: string;
  symbol: string;
  side: string;
  qty: number;
  price: number;
  timestamp: string;
}

interface AutotradingState {
  status: AgentStatus;
  config: AgentConfig | null;
  riskStats: RiskStats | null;
  logs: AgentLog[];
  balance: AccountBalance | null;
  positions: Position[];
  decisionHeats: Record<string, DecisionHeat>;
  globalSentiment: number;
  equityHistory: EquitySnapshot[];
  connected: boolean;
  transport: RealtimeTransport;
  offlineReason: string;
}

export function useAutotradingWS() {
  const [state, setState] = useState<AutotradingState>({
    status: 'stopped',
    config: null,
    riskStats: null,
    logs: [],
    balance: null,
    positions: [],
    decisionHeats: {},
    globalSentiment: 50,
    equityHistory: [],
    connected: false,
    transport: 'none',
    offlineReason: '',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttempts = useRef(0);
  const unmounted = useRef(false);
  const connectedRef = useRef(false);
  const ablyClientRef = useRef<any>(null);
  const ablyChannelRef = useRef<any>(null);

  useEffect(() => {
    connectedRef.current = state.connected;
  }, [state.connected]);

  const applyEvent = useCallback((msg: any) => {
    if (!msg || typeof msg !== 'object') return;
    setState(prev => {
      switch (msg.type) {
        case 'status':
          return {
            ...prev,
            status: msg.data?.status ?? prev.status,
            config: msg.data?.config ?? prev.config,
            riskStats: msg.data?.riskStats ?? prev.riskStats,
          };
        case 'agent_log': {
          const newLog: AgentLog = msg.data;
          const logs = [...prev.logs, newLog].slice(-MAX_LOGS);
          return { ...prev, logs };
        }
        case 'log_history':
          return { ...prev, logs: [...(msg.data ?? []), ...prev.logs].slice(-MAX_LOGS) };
        case 'account_update':
          return { ...prev, balance: msg.data };
        case 'positions_update':
          return { ...prev, positions: msg.data ?? [] };
        case 'decision_heat':
          if (!msg.data?.symbol) return prev;
          return {
            ...prev,
            decisionHeats: {
              ...prev.decisionHeats,
              [msg.data.symbol]: msg.data,
            },
          };
        case 'global_sentiment':
          return { ...prev, globalSentiment: msg.data?.score ?? prev.globalSentiment };
        case 'equity_update':
          return {
            ...prev,
            equityHistory: [...prev.equityHistory, msg.data].slice(-100),
          };
        default:
          return prev;
      }
    });
  }, []);

  const pollSnapshot = useCallback(async () => {
    const [statusRes, logsRes, positionsRes, balanceRes] = await Promise.allSettled([
      api.getAutotradingStatus(),
      api.getAutotradingLogs(80),
      api.getAutotradingPositions(),
      api.getAutotradingBalance(),
    ]);

    setState(prev => {
      const next = { ...prev };

      if (statusRes.status === 'fulfilled') {
        const statusData = statusRes.value ?? {};
        next.status = statusData.status ?? next.status;
        next.config = statusData.config ?? next.config;
        next.riskStats = statusData.riskStats ?? next.riskStats;
      }
      if (logsRes.status === 'fulfilled') {
        const logs = Array.isArray(logsRes.value) ? (logsRes.value as AgentLog[]) : [];
        next.logs = logs.slice(-MAX_LOGS);
      }
      if (positionsRes.status === 'fulfilled' && Array.isArray(positionsRes.value)) {
        next.positions = positionsRes.value as Position[];
      }
      if (balanceRes.status === 'fulfilled' && balanceRes.value) {
        next.balance = balanceRes.value as AccountBalance;
      }

      return next;
    });
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const startPolling = useCallback((reason = DEFAULT_POLLING_REASON) => {
    setState(prev => ({ ...prev, connected: false, transport: 'polling', offlineReason: reason }));
    if (pollTimer.current) return;

    void pollSnapshot();
    pollTimer.current = setInterval(() => {
      void pollSnapshot();
    }, POLL_INTERVAL_MS);
  }, [pollSnapshot]);

  const teardownAbly = useCallback(() => {
    try {
      if (ablyChannelRef.current) {
        ablyChannelRef.current.unsubscribe();
      }
      if (ablyClientRef.current) {
        ablyClientRef.current.close();
      }
    } catch {
      // ignore
    } finally {
      ablyChannelRef.current = null;
      ablyClientRef.current = null;
    }
  }, []);

  const scheduleWsReconnect = useCallback((connectFn: () => void) => {
    if (unmounted.current) return;
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      startPolling(DEFAULT_POLLING_REASON);
      return;
    }
    const delay = RECONNECT_DELAY_MS * (reconnectAttempts.current + 1);
    reconnectAttempts.current += 1;
    reconnectTimer.current = setTimeout(connectFn, delay);
    startPolling(DEFAULT_POLLING_REASON);
  }, [startPolling]);

  const connectWs = useCallback(() => {
    if (unmounted.current || WS_DISABLED) {
      startPolling(DEFAULT_POLLING_REASON);
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${protocol}//${window.location.host}${WS_PATH}`);
    } catch {
      startPolling(DEFAULT_POLLING_REASON);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      stopPolling();
      setState(prev => ({ ...prev, connected: true, transport: 'ws', offlineReason: '' }));
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setState(prev => ({ ...prev, connected: false }));
      scheduleWsReconnect(connectWs);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (evt) => {
      try {
        applyEvent(JSON.parse(evt.data));
      } catch {
        // ignore malformed payload
      }
    };
  }, [applyEvent, scheduleWsReconnect, startPolling, stopPolling]);

  const connectAbly = useCallback(async (): Promise<boolean> => {
    if (ABLY_DISABLED || PROVIDER_HINT === 'ws') return false;

    try {
      const meta = await api.getAutotradingRealtimeMeta();
      if (!meta?.ably?.enabled) return false;

      await ensureAblySdk();
      if (!window.Ably?.Realtime) return false;

      const RealtimeCtor = window.Ably.Realtime.Promise ?? window.Ably.Realtime;
      const client = new RealtimeCtor({
        authUrl: meta.ably.authUrl,
        authMethod: 'GET',
        autoConnect: true,
      });
      ablyClientRef.current = client;

      client.connection.on((stateChange: any) => {
        const current = stateChange?.current ?? stateChange?.currentState;
        if (current === 'connected') {
          reconnectAttempts.current = 0;
          stopPolling();
          setState(prev => ({ ...prev, connected: true, transport: 'ably', offlineReason: '' }));
          void pollSnapshot(); // hydrate current snapshot immediately
          return;
        }
        if (current === 'failed' || current === 'suspended' || current === 'disconnected') {
          startPolling(DEFAULT_POLLING_REASON);
        }
      });

      const channel = client.channels.get(meta.ably.channel);
      ablyChannelRef.current = channel;
      channel.subscribe((message: any) => {
        const payload = message?.data ?? message;
        applyEvent(payload);
      });

      return true;
    } catch {
      return false;
    }
  }, [applyEvent, pollSnapshot, startPolling, stopPolling]);

  useEffect(() => {
    unmounted.current = false;

    const initialize = async () => {
      let connectedViaAbly = false;
      if (PROVIDER_HINT === 'ably' || PROVIDER_HINT === 'auto') {
        connectedViaAbly = await connectAbly();
      }
      if (!connectedViaAbly) {
        connectWs();
      }
    };

    void initialize();

    // Bootstrap fallback: avoid blank screen if all realtime handshakes stall.
    const bootstrapTimer = setTimeout(() => {
      if (connectedRef.current) return;
      startPolling(DEFAULT_POLLING_REASON);
    }, 4000);

    return () => {
      unmounted.current = true;
      clearTimeout(bootstrapTimer);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      stopPolling();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      teardownAbly();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
