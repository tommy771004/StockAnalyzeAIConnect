/**
 * src/components/AutoTrading/AlignmentView.tsx
 * 回測 vs 實盤比對分析
 */
import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import * as api from '../../services/api';

interface AlignmentData {
  ok: boolean;
  sessionId: number;
  symbol: string;
  backtestMetrics: any;
  totalPaired: number;
  totalBacktestTrades: number;
  totalLiveTrades: number;
  paired: Array<{
    btTrade: any;
    liveTrade: any | null;
    slippage: number | null;
    pnlDeviation: number | null;
  }>;
}

interface Props {
  sessionId: number;
}

export function AlignmentView({ sessionId }: Props) {
  const [data, setData] = useState<AlignmentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/autotrading/alignment?sessionId=${sessionId}`);
      if (!res.ok) throw new Error('Failed to load alignment data');
      const result = await res.json();
      setData(result);
    } catch (e) {
      setError((e as Error).message ?? 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [sessionId]);

  if (loading) return <div className="p-4 text-[10px] text-white/50">計算中...</div>;
  if (error) return <div className="p-4 text-[10px] text-rose-400">錯誤: {error}</div>;
  if (!data) return <div className="p-4 text-[10px] text-white/50">無數據</div>;

  const avgSlippage = data.paired
    .filter(p => p.slippage != null)
    .reduce((sum, p) => sum + (p.slippage ?? 0), 0) / Math.max(data.paired.length, 1);

  const avgDeviation = data.paired
    .filter(p => p.pnlDeviation != null)
    .reduce((sum, p) => sum + (p.pnlDeviation ?? 0), 0) / Math.max(data.paired.length, 1);

  const pairedRate = data.totalBacktestTrades > 0
    ? (data.totalPaired / data.totalBacktestTrades * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          <span className="text-[10px] font-bold uppercase text-white">Backtest vs Live Alignment</span>
          <span className="text-[9px] text-white/50">({data.symbol})</span>
        </div>
        <button
          onClick={load}
          className="p-1 rounded text-white/50 hover:text-white"
          disabled={loading}
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-2">
        <div className="border border-white/10 bg-black/30 p-2 rounded">
          <div className="text-[8px] text-white/50 uppercase">Paired Trades</div>
          <div className="text-sm font-bold text-white mt-1">{data.totalPaired}/{data.totalBacktestTrades}</div>
          <div className="text-[8px] text-white/40 mt-0.5">{pairedRate}%</div>
        </div>

        <div className={cn(
          'border p-2 rounded',
          avgSlippage > 0.02 ? 'border-rose-500/30 bg-rose-500/5' : 'border-white/10 bg-black/30'
        )}>
          <div className="text-[8px] text-white/50 uppercase">Avg Slippage</div>
          <div className={cn('text-sm font-bold font-mono mt-1', avgSlippage > 0.02 ? 'text-rose-400' : 'text-white')}>
            {(avgSlippage * 100).toFixed(2)}%
          </div>
        </div>

        <div className={cn(
          'border p-2 rounded',
          Math.abs(avgDeviation) > 100 ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-black/30'
        )}>
          <div className="text-[8px] text-white/50 uppercase">Avg PnL Dev</div>
          <div className={cn('text-sm font-bold font-mono mt-1', Math.abs(avgDeviation) > 100 ? 'text-amber-400' : 'text-white')}>
            {avgDeviation > 0 ? '+' : ''}{avgDeviation.toFixed(0)}
          </div>
        </div>

        <div className="border border-white/10 bg-black/30 p-2 rounded">
          <div className="text-[8px] text-white/50 uppercase">Live Trades</div>
          <div className="text-sm font-bold text-white mt-1">{data.totalLiveTrades}</div>
        </div>
      </div>

      {/* Trade Comparison Table */}
      <div className="border border-white/10 rounded overflow-hidden">
        <div className="p-2 bg-white/5 border-b border-white/10 text-[9px] font-bold uppercase text-white/70">
          Trade Deviations
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {data.paired.length === 0 ? (
            <div className="p-4 text-center text-[10px] text-white/30">無配對交易</div>
          ) : (
            data.paired.map((p, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between p-2 border-b border-white/5 text-[9px] hover:bg-white/2',
                  p.liveTrade ? 'opacity-100' : 'opacity-50'
                )}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="font-mono text-white/70">
                    {new Date(p.btTrade.entryDate).toLocaleDateString()}
                  </div>
                  <div className={cn(
                    'px-1.5 py-0.5 rounded text-[8px] font-bold',
                    p.liveTrade ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/50'
                  )}>
                    {p.liveTrade ? 'PAIRED' : 'UNMATCHED'}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Slippage */}
                  {p.slippage != null && (
                    <div className={cn(
                      'text-[9px] font-mono',
                      Math.abs(p.slippage) > 0.02 ? 'text-rose-400' : 'text-white/60'
                    )}>
                      Slip: {(p.slippage * 100).toFixed(2)}%
                    </div>
                  )}

                  {/* PnL Deviation */}
                  {p.pnlDeviation != null && (
                    <div className={cn(
                      'text-[9px] font-mono font-bold',
                      p.pnlDeviation > 100 ? 'text-amber-400' : p.pnlDeviation > 0 ? 'text-emerald-400' : 'text-rose-400'
                    )}>
                      {p.pnlDeviation > 0 ? '+' : ''}{p.pnlDeviation.toFixed(0)}
                    </div>
                  )}

                  {/* Backtest PnL */}
                  <div className="text-[9px] text-white/50 font-mono">
                    BT: {Number(p.btTrade.pnl ?? 0).toFixed(0)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Insights */}
      <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-sm text-[9px] text-blue-300 space-y-1">
        <div className="font-bold">提示：</div>
        <div>• Slippage {'>'} 2% 表示實盤成交價差於回測假設</div>
        <div>• PnL Dev 反映實際執行與回測的獲利差異</div>
        <div>• Unmatched 交易可能由於執行時間或價格變動而未能配對</div>
      </div>
    </div>
  );
}
