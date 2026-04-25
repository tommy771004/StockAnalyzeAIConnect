/**
 * src/components/AutoTrading/DecisionHeatmap.tsx
 * AI 決策熱圖 — 支援特定標的過濾與動態氣泡動畫
 */
import React from 'react';
import { Activity, Thermometer } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { DecisionHeat } from './types';

interface Props {
  symbol?: string; 
  data?: DecisionHeat | null;
}

export function DecisionHeatmap({ symbol, data }: Props) {
  if (!data) return (
    <div className="h-16 flex items-center justify-center border border-dashed border-white/5 rounded-sm">
      <span className="text-[8px] text-white/20 uppercase font-mono animate-pulse">Waiting for Signal...</span>
    </div>
  );

  const getHeatColor = (score: number) => {
    if (score > 60) return 'text-emerald-400';
    if (score > 20) return 'text-emerald-400/60';
    if (score < -60) return 'text-rose-400';
    if (score < -20) return 'text-rose-400/60';
    return 'text-white/40';
  };

  return (
    <div className="group/heat relative space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
           <Activity className={cn("h-3 w-3", Math.abs(data.score) > 50 ? "animate-pulse" : "opacity-30")} />
           <span className="text-[9px] font-bold text-white/40 uppercase tracking-tighter">Decision Heat</span>
        </div>
        <span className={cn("text-[10px] font-mono font-bold", getHeatColor(data.score))}>
          {data.score > 0 ? '+' : ''}{data.score}%
        </span>
      </div>
      
      {/* 視覺化熱力條 */}
      <div className="h-1 bg-white/5 rounded-full overflow-hidden flex">
         <div className="flex-1 flex justify-end">
            <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: data.score < 0 ? `${Math.abs(data.score)}%` : '0%' }} />
         </div>
         <div className="flex-1">
            <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: data.score > 0 ? `${data.score}%` : '0%' }} />
         </div>
      </div>

      <div className="text-[8px] text-white/30 italic leading-tight line-clamp-1 group-hover/heat:line-clamp-none transition-all">
        {data.reason}
        {data.reasoning && (
          <div className="mt-1.5 pt-1.5 border-t border-white/5 hidden group-hover/heat:block space-y-1">
            {data.reasoning.map((r, i) => (
              <div key={i} className="flex items-start gap-1">
                <span className="text-cyan-500/50">›</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
