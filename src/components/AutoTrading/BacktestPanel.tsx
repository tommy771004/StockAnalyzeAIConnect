/**
 * src/components/AutoTrading/BacktestPanel.tsx
 * 詳細回測介面：設定區間、執行回測、查看報表
 */
import React, { useState } from 'react';
import { Play, TrendingUp, History, BarChart3, ChevronRight, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlignmentView } from './AlignmentView';

interface Props {
  symbol: string;
  config: any;
}

export function BacktestPanel({ symbol, config }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [period, setPeriod] = useState(180);
  const [showAlignment, setShowAlignment] = useState(false);

  const runBacktest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/autotrading/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, period, config })
      });
      const data = await res.json();
      if (data.ok) {
        setResult(data.data);
        setSessionId(data.sessionId);
        setShowAlignment(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Control Header */}
      <div className="flex items-center justify-between bg-white/5 border border-(--color-term-border) p-3 rounded-sm">
        <div className="flex items-center gap-3">
          <History className="h-4 w-4 text-violet-400" />
          <div>
            <div className="text-[11px] font-bold text-white">Backtest: {symbol}</div>
            <div className="text-[9px] text-(--color-term-muted)">使用目前策略配置與歷史數據進行模擬</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <select 
            value={period} 
            onChange={(e) => setPeriod(Number(e.target.value))}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-white outline-none"
          >
            <option value={30}>過去 30 天</option>
            <option value={90}>過去 90 天</option>
            <option value={180}>過去 180 天</option>
            <option value={365}>過去 1 年</option>
          </select>
          
          <button
            onClick={runBacktest}
            disabled={loading}
            className={cn(
              "flex items-center gap-2 px-4 py-1 rounded text-[10px] font-bold transition-all",
              loading ? "bg-white/10 text-white/50 cursor-not-allowed" : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/20"
            )}
          >
            {loading ? <Activity className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
            RUN TEST
          </button>
        </div>
      </div>

      {result ? (
        <div className="space-y-4">
          {/* Metrics Grid */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'ROI', val: `${result.metrics.roi}%`, color: result.metrics.roi > 0 ? 'text-emerald-400' : 'text-rose-400' },
              { label: 'WIN RATE', val: `${result.metrics.winRate.toFixed(1)}%`, color: 'text-violet-400' },
              { label: 'MAX DRAWDOWN', val: `-${result.metrics.maxDrawdown}%`, color: 'text-rose-400' },
              { label: 'TOTAL TRADES', val: result.metrics.totalTrades, color: 'text-blue-400' },
            ].map((m, i) => (
              <div key={i} className="bg-white/2 border border-white/5 p-2 rounded-sm">
                <div className="text-[8px] text-(--color-term-muted) uppercase tracking-wider">{m.label}</div>
                <div className={cn("text-sm font-bold font-mono mt-0.5", m.color)}>{m.val}</div>
              </div>
            ))}
          </div>

          {/* Equity Chart */}
          <div className="bg-black/20 border border-white/5 p-4 rounded-sm h-[200px]">
             <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={result.equityCurve}>
                <defs>
                  <linearGradient id="colorP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px', fontSize: '10px' }}
                  itemStyle={{ color: '#8b5cf6' }}
                />
                <Area type="monotone" dataKey="portfolio" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorP)" strokeWidth={2} />
                <Area type="monotone" dataKey="benchmark" stroke="#555" fill="transparent" strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Toggle Buttons */}
          {sessionId && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowAlignment(false)}
                className={cn(
                  'flex-1 px-3 py-1.5 text-[9px] font-bold rounded transition-all',
                  !showAlignment
                    ? 'bg-violet-600 text-white'
                    : 'bg-white/5 text-white/50 border border-white/10'
                )}
              >
                Trade Log
              </button>
              <button
                onClick={() => setShowAlignment(true)}
                className={cn(
                  'flex-1 px-3 py-1.5 text-[9px] font-bold rounded transition-all',
                  showAlignment
                    ? 'bg-amber-600 text-white'
                    : 'bg-white/5 text-white/50 border border-white/10'
                )}
              >
                Alignment Analysis
              </button>
            </div>
          )}

          {/* Trade Log */}
          {!showAlignment && (
          <div className="bg-white/2 border border-white/5 rounded-sm overflow-hidden">
            <div className="p-2 border-b border-white/5 flex items-center gap-2">
              <BarChart3 className="h-3 w-3 text-violet-400" />
              <span className="text-[9px] font-bold text-white uppercase tracking-widest">Trade Execution History</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto font-mono">
              {result.trades.map((t: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 border-b border-white/5 text-[9px] hover:bg-white/2">
                  <div className="flex items-center gap-3">
                    <span className={cn("w-8 text-center rounded-sm", t.pnl > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                      {t.pnl > 0 ? 'WIN' : 'LOSS'}
                    </span>
                    <span className="text-white">{t.entryDate.split('T')[0]}</span>
                    <ChevronRight className="h-2 w-2 text-(--color-term-muted)" />
                    <span className="text-white">{t.exitDate.split('T')[0]}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-(--color-term-muted)">{t.entryPrice.toFixed(2)} → {t.exitPrice.toFixed(2)}</span>
                    <span className={cn("font-bold", t.pnl > 0 ? "text-emerald-400" : "text-rose-400")}>
                      {t.pnl > 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Alignment View */}
          {showAlignment && sessionId && (
            <AlignmentView sessionId={sessionId} />
          )}
        </div>
      ) : (
        <div className="h-[300px] flex flex-col items-center justify-center border border-dashed border-white/10 rounded-sm bg-black/20">
          <TrendingUp className="h-8 w-8 text-white/10 mb-3" />
          <div className="text-[10px] text-white/30">點擊「RUN TEST」開始進行回測</div>
        </div>
      )}
    </div>
  );
}
