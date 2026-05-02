/**
 * src/components/AutoTrading/DecisionLog.tsx
 * AI 決策 Log 即時串流面板
 */
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { AgentLog } from './types';
import { LOG_LEVEL_COLORS } from './types';
import { SignalAttributionPanel } from './SignalAttributionPanel';

interface Props {
  logs: AgentLog[];
  autoScroll?: boolean;
  quantumEnabled?: boolean;
  highlightedSymbols?: Set<string>;
  connectionInfo?: {
    connected: boolean;
    transport: 'none' | 'ably' | 'ws' | 'polling';
    reason?: string;
  };
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function DecisionLog({ logs, autoScroll = true, quantumEnabled = false, highlightedSymbols, connectionInfo }: Props) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, autoScroll]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-(--color-term-border) shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
        </span>
        <span className="text-[10px] font-bold tracking-[0.2em] text-cyan-400 uppercase">
          {t('autotrading.decisionLog.title')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-[11px] p-2 space-y-0.5">
        {logs.length === 0 ? (
          <div className="text-(--color-term-muted) text-center py-8 space-y-2">
            <div>{t('autotrading.decisionLog.waiting')}</div>
            {connectionInfo?.transport === 'polling' && (
              <div className="inline-block px-2 py-1 text-[10px] rounded border border-amber-400/30 bg-amber-500/10 text-amber-200">
                {t('autotrading.decisionLog.fallbackPolling', 'Realtime 未連線，已切換為輪詢模式。')}
                {connectionInfo.reason ? ` ${connectionInfo.reason}` : ''}
              </div>
            )}
          </div>
        ) : (
          logs.map(log => (
            <React.Fragment key={log.id}>
              <div className={cn(
  'flex gap-2 leading-relaxed px-1 rounded transition-colors duration-700',
  log.symbol && highlightedSymbols?.has(log.symbol) ? 'bg-cyan-500/15' : 'hover:bg-white/3'
)}>
              <span className="text-(--color-term-muted) shrink-0">[{formatTs(log.timestamp)}]</span>
              <span className={cn('font-bold shrink-0', LOG_LEVEL_COLORS[log.level])}>
                [{log.level}]
              </span>
              {log.symbol && (
                <span className="text-(--color-term-accent) shrink-0">{log.symbol}</span>
              )}
              <span className="text-(--color-term-text) break-all">{log.message}</span>
              {log.confidence !== undefined && (
                <span className={cn(
                  'ml-auto shrink-0 px-1.5 rounded text-[10px] font-bold border',
                  log.action === 'BUY'  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                  log.action === 'SELL' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                         'bg-zinc-800 text-zinc-400 border-zinc-700'
                )}>
                  {log.confidence}%
                </span>
              )}
            </div>
            {log.reasoning && log.reasoning.length > 0 && (
              <div className="ml-8 mb-2 space-y-0.5 border-l border-white/5 pl-3">
                {log.reasoning.map((reason, idx) => (
                  <div key={idx} className="text-[9px] text-white/40 flex items-start gap-1.5">
                    <span className="text-violet-400/50 mt-1">▹</span>
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            )}
            {log.signalAttribution && (
              <div className="ml-8 mb-2 border-l border-white/5 pl-3">
                <SignalAttributionPanel
                  attribution={log.signalAttribution}
                  quantumEnabled={quantumEnabled}
                />
              </div>
            )}
          </React.Fragment>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
