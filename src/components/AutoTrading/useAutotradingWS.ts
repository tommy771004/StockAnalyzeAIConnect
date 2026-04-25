/**
 * src/components/AutoTrading/useAutotradingWS.ts
 * WebSocket hook — 接收 AI 引擎的即時 log、持倉、帳戶狀態
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AgentLog, AccountBalance, Position, AgentStatus, AgentConfig, RiskStats, DecisionHeat, EquitySnapshot } from './types';

const WS_PATH = '/ws/autotrading';
const RECONNECT_DELAY_MS = 3000;
const MAX_LOGS = 300;

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
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}${WS_PATH}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(prev => ({ ...prev, connected: true }));
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, connected: false }));
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        setState(prev => {
          switch (msg.type) {
            case 'status':
              return {
                ...prev,
                status: msg.data.status ?? prev.status,
                config: msg.data.config ?? prev.config,
                riskStats: msg.data.riskStats ?? prev.riskStats,
              };
            case 'agent_log': {
              const newLog: AgentLog = msg.data;
              const logs = [...prev.logs, newLog].slice(-MAX_LOGS);
              return { ...prev, logs };
            }
            case 'log_history':
              return { ...prev, logs: [...msg.data, ...prev.logs].slice(-MAX_LOGS) };
            case 'account_update':
              return { ...prev, balance: msg.data };
            case 'positions_update':
              return { ...prev, positions: msg.data ?? [] };
            case 'decision_heat':
              return {
                ...prev,
                decisionHeats: {
                  ...prev.decisionHeats,
                  [msg.data.symbol]: msg.data
                }
              };
            case 'global_sentiment':
              return { ...prev, globalSentiment: msg.data.score };
            case 'equity_update':
              return { 
                ...prev, 
                equityHistory: [...prev.equityHistory, msg.data].slice(-100) 
              };
            default:
              return prev;
          }
        });
      } catch { /* ignore malformed */ }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return state;
}
