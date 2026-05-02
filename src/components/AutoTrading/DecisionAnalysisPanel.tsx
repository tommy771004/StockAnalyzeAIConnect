import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import type { AgentLog, DecisionFusion } from './types';

interface Props {
  decisionFusions: Record<string, DecisionFusion>;
  logs: AgentLog[];
  symbols: string[];
}

const SOURCE_LABELS: Record<string, string> = {
  technical: 'Technical',
  ai: 'AI / LLM',
  quantum: 'Quantum',
  macro: 'Macro',
  forecast: 'TimesFM',
};

export function DecisionAnalysisPanel({ decisionFusions, logs, symbols }: Props) {
  const [selectedSymbol, setSelectedSymbol] = useState(symbols[0] ?? '');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    if (symbols.length > 0 && !symbols.includes(selectedSymbol)) {
      setSelectedSymbol(symbols[0]);
    }
  }, [symbols, selectedSymbol]);

  const fusion = decisionFusions[selectedSymbol];

  const { buyPct, sellPct, holdPct } = useMemo(() => {
    if (!fusion?.components?.length) return { buyPct: 0, sellPct: 0, holdPct: 0 };
    const total = fusion.components.reduce((sum, c) => sum + Math.abs(c.weightedScore), 0) || 1;
    const sum = (action: string) =>
      fusion.components
        .filter(c => c.action === action)
        .reduce((s, c) => s + c.weightedScore, 0);
    return {
      buyPct: Math.round((sum('BUY') / total) * 100),
      sellPct: Math.round((sum('SELL') / total) * 100),
      holdPct: Math.round((sum('HOLD') / total) * 100),
    };
  }, [fusion]);

  const decisionLogs = useMemo(() =>
    logs
      .filter(l => l.symbol === selectedSymbol && l.action && l.action !== 'SYSTEM')
      .slice(-20)
      .reverse(),
    [logs, selectedSymbol]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--color-term-border) shrink-0">
        <span className="text-[10px] font-bold tracking-[0.2em] text-violet-400 uppercase">
          Decision Analysis
        </span>
        {fusion && (
          <span className="text-[9px] text-(--color-term-muted) font-mono">
            {new Date(fusion.timestamp).toLocaleTimeString('zh-TW', { hour12: false })}
          </span>
        )}
      </div>

      {symbols.length > 1 && (
        <div className="flex gap-1 px-2 py-1.5 border-b border-(--color-term-border) overflow-x-auto shrink-0">
          {symbols.map(sym => (
            <button
              key={sym}
              type="button"
              onClick={() => setSelectedSymbol(sym)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded border shrink-0 transition-colors',
                selectedSymbol === sym
                  ? 'text-(--color-term-accent) border-(--color-term-accent) bg-(--color-term-accent)/10'
                  : 'text-(--color-term-muted) border-(--color-term-border) hover:text-(--color-term-text)'
              )}
            >
              {sym}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-4">

        <div className="space-y-2">
          <span className="text-[9px] font-bold tracking-widest text-(--color-term-muted) uppercase">
            Confidence
          </span>
          {!fusion ? (
            <div className="text-[11px] text-(--color-term-muted) py-2">等待訊號...</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-(--color-term-muted)">最終裁定</span>
                <span className={cn(
                  'text-[11px] font-bold px-2 py-0.5 rounded font-mono',
                  fusion.action === 'BUY'  ? 'text-emerald-400 bg-emerald-500/10' :
                  fusion.action === 'SELL' ? 'text-rose-400 bg-rose-500/10' :
                                             'text-zinc-400 bg-zinc-800'
                )}>
                  {fusion.action}  {fusion.confidence}%
                </span>
              </div>
              {([
                { label: 'BUY',  pct: buyPct,  color: 'bg-emerald-400', text: 'text-emerald-400' },
                { label: 'HOLD', pct: holdPct, color: 'bg-zinc-400',    text: 'text-zinc-400'    },
                { label: 'SELL', pct: sellPct, color: 'bg-rose-400',    text: 'text-rose-400'    },
              ] as const).map(({ label, pct, color, text }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={cn('text-[10px] w-8 shrink-0 font-mono', text)}>{label}</span>
                  <div className="flex-1 h-1.5 bg-(--color-term-border) rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', color)}
                      style={{ width: `${Math.max(0, pct)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-(--color-term-muted) w-8 text-right shrink-0">
                    {pct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <span className="text-[9px] font-bold tracking-widest text-(--color-term-muted) uppercase">
            Signal Breakdown
          </span>
          {!fusion?.components?.length ? (
            <div className="text-[11px] text-(--color-term-muted)">無訊號資料</div>
          ) : (
            <div className="space-y-1">
              {fusion.components.map((c, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-center justify-between px-2 py-1.5 rounded border text-[10px] font-mono',
                    c.action === 'BUY'  ? 'border-emerald-500/30 bg-emerald-500/5' :
                    c.action === 'SELL' ? 'border-rose-500/30 bg-rose-500/5' :
                                         'border-(--color-term-border)'
                  )}
                >
                  <span className={cn(
                    'uppercase tracking-wider',
                    c.action === 'BUY'  ? 'text-emerald-400' :
                    c.action === 'SELL' ? 'text-rose-400' :
                                         'text-(--color-term-muted)'
                  )}>
                    {SOURCE_LABELS[c.source] ?? c.source}
                  </span>
                  <span className={cn(
                    c.action === 'BUY'  ? 'text-emerald-300' :
                    c.action === 'SELL' ? 'text-rose-300' :
                                         'text-(--color-term-muted)'
                  )}>
                    {c.action === 'BUY' ? '↑ BUY' : c.action === 'SELL' ? '↓ SELL' : '— HOLD'}
                  </span>
                  <span className="text-(--color-term-muted)">
                    w: {c.weightedScore.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 hidden md:block">
          <span className="text-[9px] font-bold tracking-widest text-(--color-term-muted) uppercase">
            Decision Timeline
          </span>
          {decisionLogs.length === 0 ? (
            <div className="text-[11px] text-(--color-term-muted)">尚無決策記錄</div>
          ) : (
            <div className="space-y-0.5">
              {decisionLogs.map(log => (
                <div key={log.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedLogId(prev => prev === log.id ? null : log.id)}
                    className="w-full flex items-center gap-1.5 text-[10px] py-1 px-1.5 rounded hover:bg-white/5 text-left font-mono"
                  >
                    <span className="text-(--color-term-muted) shrink-0 w-16">
                      {new Date(log.timestamp).toLocaleTimeString('zh-TW', { hour12: false })}
                    </span>
                    <span className="text-(--color-term-accent) shrink-0">{log.symbol}</span>
                    <span className={cn(
                      'shrink-0 font-bold w-8',
                      log.action === 'BUY'  ? 'text-emerald-400' :
                      log.action === 'SELL' ? 'text-rose-400' :
                                             'text-zinc-400'
                    )}>
                      {log.action}
                    </span>
                    <div className="flex gap-0.5 ml-auto">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            i < Math.round((log.confidence ?? 0) / 20)
                              ? log.action === 'BUY'  ? 'bg-emerald-400'
                                : log.action === 'SELL' ? 'bg-rose-400'
                                : 'bg-zinc-400'
                              : 'bg-(--color-term-border)'
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-(--color-term-muted) w-8 text-right shrink-0">
                      {log.confidence ?? 0}%
                    </span>
                  </button>
                  {expandedLogId === log.id && log.signalAttribution?.components && (
                    <div className="ml-3 pl-2 border-l border-(--color-term-border) space-y-0.5 pb-1">
                      {log.signalAttribution.components.map((c, i) => (
                        <div key={i} className="flex justify-between text-[9px] text-(--color-term-muted) font-mono">
                          <span>{SOURCE_LABELS[c.source] ?? c.source}</span>
                          <span>
                            {c.action}  score: {c.score.toFixed(2)}  w: {c.weight.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
