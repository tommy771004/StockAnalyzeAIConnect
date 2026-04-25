/**
 * src/components/AutoTrading/MonitorTab.tsx
 * 監控分頁組件：展示標的狀態與啟停控制
 */
import React from 'react';
import { cn } from '../../lib/utils';
import { Activity, Play, Square, MessageSquareCode, LineChart, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DecisionHeatmap } from './DecisionHeatmap';
import type { DecisionHeat, EquitySnapshot } from './types';

interface Props {
  symbols: string[];
  isRunning: boolean;
  decisionHeats: Record<string, DecisionHeat>;
  globalSentiment: number;
  equityHistory: EquitySnapshot[];
  onStart: () => void;
  onStop: () => void;
}

export function MonitorTab({ symbols, isRunning, decisionHeats, globalSentiment, equityHistory, onStart, onStop }: Props) {
  const heats = Object.values(decisionHeats).sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const latestHeat = heats[0];

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Market Mood Gauge */}
      <div className="bg-white/2 border border-white/5 p-4 rounded-sm space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Global Market Mood (AI)</span>
          <span className={cn(
            "text-[12px] font-mono font-bold",
            globalSentiment > 60 ? "text-emerald-400" : globalSentiment < 40 ? "text-rose-400" : "text-amber-400"
          )}>
            {globalSentiment > 60 ? 'OPTIMISTIC' : globalSentiment < 40 ? 'PESSIMISTIC' : 'NEUTRAL'} ({globalSentiment}%)
          </span>
        </div>
        <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden flex gap-0.5">
           <div className="flex-1 h-full bg-rose-500/20" />
           <div className="flex-1 h-full bg-amber-500/20" />
           <div className="flex-1 h-full bg-emerald-500/20" />
           <div 
             className={cn(
               "absolute h-1.5 rounded-full transition-all duration-1000",
               globalSentiment > 60 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
               globalSentiment < 40 ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" : 
               "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
             )} 
             style={{ width: '4px', left: `calc(${globalSentiment}% - 2px)` }} 
           />
        </div>
      </div>
      
      {/* Live Session Performance */}
      <div className="bg-black/20 border border-white/5 p-4 rounded-sm space-y-4">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Live Session Performance</span>
           </div>
           {equityHistory.length > 0 && (
             <span className={cn(
               "text-[10px] font-mono font-bold",
               equityHistory[equityHistory.length-1].equity >= equityHistory[0].equity ? "text-emerald-400" : "text-rose-400"
             )}>
               {((equityHistory[equityHistory.length-1].equity / equityHistory[0].equity - 1) * 100).toFixed(2)}%
             </span>
           )}
        </div>
        <div className="h-[100px] w-full">
          {equityHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityHistory}>
                <defs>
                  <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="timestamp" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', fontSize: '9px' }}
                  labelStyle={{ display: 'none' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="equity" 
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorEquity)" 
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center border border-dashed border-white/5 rounded">
               <LineChart className="h-4 w-4 text-white/10 mb-1" />
               <span className="text-[8px] text-white/20 uppercase">Collecting Performance Data...</span>
            </div>
          )}
        </div>
      </div>

      {/* Symbols Matrix with Scroll Support */}
      <div className="max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {symbols.map(sym => (
            <div key={sym} className="p-3 bg-white/5 border border-white/10 rounded flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold font-mono text-white">{sym}</span>
                <Activity className="h-3 w-3 text-cyan-400 opacity-50" />
              </div>
              <DecisionHeatmap symbol={sym} data={decisionHeats[sym]} />
            </div>
          ))}
        </div>
      </div>

      {/* Live Intelligence Feed */}
      <div className="bg-violet-500/5 border border-violet-500/10 rounded-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquareCode className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-[10px] font-bold text-violet-300 uppercase tracking-widest">Live Alpha Reasoning</span>
        </div>
        
        <div className="space-y-2">
          {latestHeat ? (
            <div key={latestHeat.timestamp} className="flex items-start gap-3 p-2 bg-black/40 rounded border border-white/5 animate-in fade-in slide-in-from-left-2 duration-500">
              <div className="h-4 w-4 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5">
                 <span className="text-[8px] font-bold text-cyan-400">AI</span>
              </div>
              <div className="flex-1 space-y-1">
                 <div className="flex items-center gap-2">
                   <span className="text-[10px] font-bold text-white">{latestHeat.symbol}</span>
                   <span className="text-[8px] text-white/30">{new Date(latestHeat.timestamp).toLocaleTimeString()}</span>
                 </div>
                 <p className="text-[10px] text-white/80 leading-relaxed font-serif italic">
                   "{latestHeat.reason}"
                 </p>
                 <div className="flex gap-2">
                    <span className={cn(
                      "text-[8px] px-1.5 py-0.5 rounded",
                      latestHeat.score > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                    )}>
                      {latestHeat.score > 0 ? 'Bullish Bias' : 'Bearish Bias'}
                    </span>
                    <span className="text-[8px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded">
                      {Math.abs(latestHeat.score) > 60 ? 'High Confidence' : 'Moderate Confidence'}
                    </span>
                 </div>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center">
              <span className="text-[9px] text-white/20 uppercase tracking-[0.2em]">Waiting for AI Insights...</span>
            </div>
          )}
        </div>
      </div>

      {/* Control Action */}
      <div className="pt-6 border-t border-white/5">
        {isRunning ? (
          <button 
            onClick={onStop} 
            className="w-full py-3 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded font-bold uppercase tracking-[0.2em] hover:bg-rose-500/30 transition-all flex items-center justify-center gap-2"
          >
            <Square className="h-4 w-4 fill-current" /> EMERGENCY_STOP
          </button>
        ) : (
          <button 
            onClick={onStart} 
            className="w-full py-3 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded font-bold uppercase tracking-[0.2em] hover:bg-cyan-500/30 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.1)]"
          >
            <Play className="h-4 w-4 fill-current" /> INITIATE_ENGINE
          </button>
        )}
      </div>
    </div>
  );
}
