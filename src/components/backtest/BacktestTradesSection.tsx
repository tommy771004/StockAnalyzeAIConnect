import React from 'react';
import { Download, FileText, Info, TrendingDown, TrendingUp } from 'lucide-react';
import type { BacktestTrade } from '../../types';
import type { BacktestStrategyMeta } from '../../utils/backtest';

interface BacktestTradesSectionProps {
  resultStrat: BacktestStrategyMeta;
  tradesRaw: BacktestTrade[];
  trades: BacktestTrade[];
  tradeSort: 'date' | 'pnl';
  onTradeSortChange: (value: 'date' | 'pnl') => void;
  onExportCSV: () => void;
}

export function BacktestTradesSection({
  resultStrat,
  tradesRaw,
  trades,
  tradeSort,
  onTradeSortChange,
  onExportCSV,
}: BacktestTradesSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div className="lg:col-span-1 glass-card rounded-[2rem] p-8 space-y-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-primary-container)] to-transparent opacity-40" />
        <h3 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(128,131,255,0.1)', border: '1px solid rgba(128,131,255,0.25)', color: 'var(--md-primary)' }}>
            <Info size={16} />
          </div>
          策略邏輯回顧
        </h3>
        <div className="space-y-6">
          <div className="p-5 rounded-2xl transition-colors" style={{ background: 'rgba(82,196,26,0.04)', border: '1px solid rgba(82,196,26,0.12)' }}>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2" style={{ color: 'var(--color-down)' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-down)' }} />
              買進觸發
            </div>
            <div className="text-xs leading-relaxed font-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{resultStrat.buyDesc}</div>
          </div>
          <div className="p-5 rounded-2xl transition-colors" style={{ background: 'rgba(255,77,79,0.04)', border: '1px solid rgba(255,77,79,0.12)' }}>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2" style={{ color: 'var(--color-up)' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-up)' }} />
              賣出觸發
            </div>
            <div className="text-xs leading-relaxed font-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{resultStrat.sellDesc}</div>
          </div>
          <div className="p-5 rounded-2xl transition-colors" style={{ background: 'rgba(255,183,131,0.05)', border: '1px solid rgba(255,183,131,0.12)' }}>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2" style={{ color: 'var(--md-tertiary)' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--md-tertiary)' }} />
              專家筆記
            </div>
            <div className="text-xs leading-relaxed font-medium italic opacity-80" style={{ color: 'var(--md-on-surface-variant)' }}>
              {resultStrat.beginner.replace('新手說明：', '')}
            </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-3 glass-card rounded-[2.5rem] p-8 shadow-2xl flex flex-col min-h-[500px] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--md-outline-variant)] to-transparent opacity-40" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>
              <FileText size={28} />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight flex items-center gap-3" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>
                成交明細
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-outline)' }}>Total {tradesRaw.length} Trades</span>
              </h3>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg" style={{ color: 'var(--color-down)', background: 'rgba(82,196,26,0.1)', border: '1px solid rgba(82,196,26,0.25)' }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-down)' }} /> {tradesRaw.filter((t) => t.result === 'WIN').length} Wins
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg" style={{ color: 'var(--color-up)', background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.25)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-400" /> {tradesRaw.filter((t) => t.result === 'LOSS').length} Losses
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex-1 sm:flex-none flex bg-white/5 rounded-2xl p-1.5 border border-white/10 shadow-inner">
              {(['date', 'pnl'] as const).map(s => (
                <button key={s} type="button" onClick={() => onTradeSortChange(s)}
                  className="flex-1 sm:flex-none text-[9px] md:text-[10px] font-black uppercase tracking-widest px-4 md:px-6 py-2 rounded-xl transition duration-300 active:scale-95"
                  style={tradeSort === s ? { background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)', border: '1px solid var(--md-outline-variant)' } : { color: 'var(--md-outline)' }}>
                  {s === 'date' ? 'Time' : 'PnL'}
                </button>
              ))}
            </div>
            <button onClick={onExportCSV} className="p-3 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-colors active:scale-90">
              <Download size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex md:hidden gap-3 pb-4 overflow-x-auto">
            {trades.map((t, i) => (
              <div key={`mobile-trade-${t.entryTime}-${i}`} className="min-w-[200px] glass-card rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold" style={{ color: 'var(--md-on-surface)' }}>{t.entryTime}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={(t.pnlPct ?? 0) >= 0 ? { background: 'rgba(82,196,26,0.15)', color: 'var(--color-down)' } : { background: 'rgba(255,77,79,0.15)', color: 'var(--color-up)' }}>
                    {(t.pnlPct ?? 0) >= 0 ? '+' : ''}{Number(t.pnlPct ?? 0).toFixed(2)}%
                  </span>
                </div>
                <div className="text-[10px]" style={{ color: 'var(--md-outline)' }}>PnL: {Number(t.pnl).toLocaleString()}</div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--md-outline)' }}>進場</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{Number(t.entryPrice).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--md-outline)' }}>出場</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{Number(t.exitPrice).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="sticky top-0 backdrop-blur-md z-10" style={{ background: 'var(--md-surface-container)' }}>
                <tr className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--md-outline)', borderBottom: '1px solid var(--md-outline-variant)' }}>
                  <th className="pb-4 text-left">Entry Date</th>
                  <th className="pb-4 text-left">Exit Date</th>
                  <th className="pb-4 text-right">Entry</th>
                  <th className="pb-4 text-right">Exit</th>
                  <th className="pb-4 text-right">Size</th>
                  <th className="pb-4 text-right">Hold</th>
                  <th className="pb-4 text-right">ROI%</th>
                  <th className="pb-4 text-right">PnL</th>
                  <th className="pb-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--md-outline-variant)' }}>
                {trades.map((t, i) => (
                  <tr key={`desktop-trade-${t.entryTime}-${i}`} className="group transition-colors">
                    <td className="py-4 font-mono text-xs" style={{ color: 'var(--md-on-surface-variant)', fontFamily: 'var(--font-data)' }}>{t.entryTime}</td>
                    <td className="py-4 font-mono text-xs" style={{ color: 'var(--md-on-surface-variant)', fontFamily: 'var(--font-data)' }}>{t.exitTime}</td>
                    <td className="py-4 font-mono text-xs text-right font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{Number(t.entryPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="py-4 font-mono text-xs text-right font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{Number(t.exitPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="py-4 font-mono text-xs text-right" style={{ color: 'var(--md-on-surface-variant)', fontFamily: 'var(--font-data)' }}>{Number(t.amount).toLocaleString()}</td>
                    <td className="py-4 font-mono text-xs text-right" style={{ color: 'var(--md-outline)', fontFamily: 'var(--font-data)' }}>{t.holdDays}d</td>
                    <td className="py-4 font-mono font-black text-sm text-right" style={{ color: (t.pnlPct ?? 0) >= 0 ? 'var(--color-down)' : 'var(--color-up)', fontFamily: 'var(--font-data)' }}>
                      {(t.pnlPct ?? 0) >= 0 ? '+' : ''}{Number(t.pnlPct ?? 0).toFixed(2)}%
                    </td>
                    <td className="py-4 font-mono font-black text-sm text-right" style={{ color: (t.pnl ?? 0) >= 0 ? 'var(--color-down)' : 'var(--color-up)', fontFamily: 'var(--font-data)' }}>
                      {(t.pnl ?? 0) >= 0 ? '+' : ''}{Number(t.pnl ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-4 text-center">
                      {t.result === 'WIN'
                        ? <span className="inline-flex items-center gap-1 text-[0.55rem] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ color: 'var(--color-down)', background: 'rgba(82,196,26,0.1)', border: '1px solid rgba(82,196,26,0.25)' }}>
                            <TrendingUp size={10} /> Profit
                          </span>
                        : <span className="inline-flex items-center gap-1 text-[0.55rem] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ color: 'var(--color-up)', background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.25)' }}>
                            <TrendingDown size={10} /> Loss
                          </span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
