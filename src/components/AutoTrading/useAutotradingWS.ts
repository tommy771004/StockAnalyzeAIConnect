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
const API_BASE_URL = String(import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

type RealtimeTransport = 'none' | 'ably' | 'ws' | 'polling';

declare global {
  interface Window {
    Ably?: any;
  }
}

let ablySdkLoading: Promise<void> | null = null;

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

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
  const lastMetaReasonRef = useRef<string>('');
  // 當伺服器明確回報 provider=ably (例如部署在 Vercel 的 serverless 環境)，
  // 即使 token 失敗也應略過原生 WebSocket 嘗試 — 否則只會額外塞滿 console error。
  const skipWsRef = useRef<boolean>(false);

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
      startPolling(lastMetaReasonRef.current || 'WebSocket 連線重試次數已達上限，改用輪詢。');
      return;
    }
    const delay = RECONNECT_DELAY_MS * (reconnectAttempts.current + 1);
    reconnectAttempts.current += 1;
    reconnectTimer.current = setTimeout(connectFn, delay);
    startPolling(lastMetaReasonRef.current || 'WebSocket 連線中斷，改用輪詢。');
  }, [startPolling]);

  const connectWs = useCallback(() => {
    if (unmounted.current || WS_DISABLED) {
      startPolling('WebSocket 已被設定停用，改用輪詢。');
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${protocol}//${window.location.host}${WS_PATH}`);
    } catch {
      startPolling('WebSocket URL 建立失敗，改用輪詢。');
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
    if (ABLY_DISABLED) {
      lastMetaReasonRef.current = 'Ably 已被設定停用（VITE_DISABLE_AUTOTRADING_ABLY）。';
      return false;
    }
    if (PROVIDER_HINT === 'ws') {
      lastMetaReasonRef.current = '目前設定為 WebSocket 優先（VITE_AUTOTRADING_RT_PROVIDER=ws）。';
      return false;
    }

    try {
      const meta = await api.getAutotradingRealtimeMeta();
      // 伺服器回報以 Ably 為主時，記錄此偏好；後續若 Ably 失敗就直接走 polling
      // (在 Vercel 等 serverless 環境上原生 WS 也不會成功，避免無謂的錯誤訊息)。
      skipWsRef.current = meta?.provider === 'ably';
      if (!meta?.ably?.enabled) {
        lastMetaReasonRef.current = meta?.ably?.reason || '伺服器未啟用 Ably（ABLY_API_KEY 未生效）。';
        return false;
      }
      lastMetaReasonRef.current = '';
      const authUrl = resolveApiUrl(meta.ably.authUrl);
      const requestToken = async () => {
        const response = await fetch(authUrl, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          let message = `Ably token endpoint failed (${response.status})`;
          try {
            const body = await response.json() as { error?: string };
            if (body?.error) message = body.error;
          } catch {
            // ignore
          }
          throw new Error(message);
        }
        return await response.json();
      };

      // Preflight to expose auth issues early (cookie/CORS/path/env mismatch).
      await requestToken();

      await ensureAblySdk();
      if (!window.Ably?.Realtime) {
        lastMetaReasonRef.current = 'Ably SDK 載入失敗（可能被網路或 CSP 擋下）。';
        return false;
      }

      const RealtimeCtor = window.Ably.Realtime.Promise ?? window.Ably.Realtime;
      const client = new RealtimeCtor({
        autoConnect: true,
        authCallback: async (_tokenParams: unknown, callback: (err: unknown, tokenDetails: unknown) => void) => {
          try {
            const token = await requestToken();
            callback(null, token);
          } catch (err) {
            callback(err, null);
          }
        },
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
          const reason = stateChange?.reason?.message || `Ably 連線狀態：${current}`;
          startPolling(`${reason}；已切換輪詢。`);
        }
      });

      const channel = client.channels.get(meta.ably.channel);
      ablyChannelRef.current = channel;
      channel.subscribe((message: any) => {
        const payload = message?.data ?? message;
        applyEvent(payload);
      });

      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ably 初始化失敗';
      lastMetaReasonRef.current = msg;
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
        if (lastMetaReasonRef.current) {
          setState(prev => ({ ...prev, offlineReason: lastMetaReasonRef.current }));
        }
        // 後端聲明走 Ably (serverless 環境) → 略過原生 WS，直接 polling
        if (skipWsRef.current) {
          startPolling(lastMetaReasonRef.current || DEFAULT_POLLING_REASON);
          return;
        }
        connectWs();
      }
    };

    void initialize();

    // Bootstrap fallback: avoid blank screen if all realtime handshakes stall.
    const bootstrapTimer = setTimeout(() => {
      if (connectedRef.current) return;
      startPolling(lastMetaReasonRef.current || DEFAULT_POLLING_REASON);
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
