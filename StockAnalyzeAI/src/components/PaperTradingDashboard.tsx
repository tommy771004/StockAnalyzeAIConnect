import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, RefreshCw, BarChart2 } from 'lucide-react';
import { cn } from '../lib/utils';
import * as api from '../services/api';
import { Position, Quote } from '../types';
import Decimal from 'decimal.js';

interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  flash: string;
}

export default function PaperTradingDashboard() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalAssets, setTotalAssets] = useState(0);
  const [todayPnl, setTodayPnl] = useState(0);

  const fetchPositions = useCallback(async () => {
    try {
      setError(null);
      const posData = await api.getPositions();
      const positions = Array.isArray(posData.positions) ? posData.positions : [];
      if (positions.length === 0) {
        setHoldings([]);
        setLoading(false);
        return;
      }

      // Fetch live quotes for all held symbols
      const symbols = positions.map((p: Position) => p.symbol);
      const quotes = await api.getBatchQuotes(symbols).catch(() => []);
      const quoteMap = new Map<string, Quote>();
      if (Array.isArray(quotes)) {
        quotes.forEach((q: Quote) => { if (q?.symbol) quoteMap.set(q.symbol, q); });
      }

      const newHoldings: Holding[] = positions.map((p: Position) => {
        const q = quoteMap.get(p.symbol);
        const currentPrice = q?.regularMarketPrice ?? p.avgCost;
        const pnl = isFinite(currentPrice) && isFinite(p.avgCost) && isFinite(p.shares)
          ? new Decimal(currentPrice).minus(p.avgCost).times(p.shares).toNumber() : 0;
        return {
          symbol: p.symbol,
          qty: p.shares,
          avgPrice: p.avgCost,
          currentPrice,
          pnl: Math.round(pnl),
          flash: '',
        };
      });

      setHoldings(newHoldings);
      setTotalAssets(newHoldings.reduce((s, h) => new Decimal(s).plus(new Decimal(h.currentPrice).times(h.qty)).toNumber(), 0));
      setTodayPnl(newHoldings.reduce((s, h) => new Decimal(s).plus(h.pnl).toNumber(), 0));
    } catch(e) {
      console.warn('[PaperTrading] refreshPrices:', e);
      setError(e instanceof Error ? e.message : '連線異常');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  // Refresh prices every 30s — stable ref to avoid interval reset
  const fetchRef = useRef(fetchPositions);
  fetchRef.current = fetchPositions;
  useEffect(() => {
    const interval = setInterval(() => fetchRef.current(), 30000);
    return () => clearInterval(interval);
  }, []);

  const winCount = holdings.filter(h => h.pnl > 0).length;
  const winRate = holdings.length > 0 ? Math.round((winCount / holdings.length) * 100) : 0;

  if (error) {
    return (
      <div className="liquid-glass rounded-2xl p-6 flex flex-col items-center justify-center gap-4 h-48 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <Activity className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <h3 className="text-zinc-100 font-bold mb-1">連線異常</h3>
          <p className="text-zinc-400 text-sm max-w-xs mx-auto">{error}</p>
        </div>
        <button 
          onClick={() => fetchPositions()}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          重新整理
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="liquid-glass rounded-2xl p-6 flex flex-col gap-4 h-48">
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 bg-zinc-800 rounded-lg animate-pulse"/>
          <div className="h-5 w-20 bg-zinc-800 rounded-lg animate-pulse"/>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-800 animate-pulse">
              <div className="h-3 w-16 bg-zinc-700 rounded mb-2"/>
              <div className="h-6 w-24 bg-zinc-700 rounded"/>
            </div>
          ))}
        </div>
        <div className="flex gap-4 flex-1">
          {[1,2].map(i => (
            <div key={i} className="flex-1 bg-zinc-800/50 rounded-2xl border border-zinc-800 animate-pulse"/>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="liquid-glass rounded-2xl p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Activity className="text-emerald-400" size={20} />
          模擬交易看板 (Paper Trading)
        </h2>
        <div className="flex items-center gap-3">
          <button onClick={fetchPositions} className="p-1.5 rounded-lg hover:bg-[var(--border-color)] text-zinc-500 transition-colors">
            <RefreshCw size={14} />
          </button>
          <div className="text-right">
            <div className="text-xs text-zinc-500">總資產</div>
            <div className="text-xl font-black text-white">${totalAssets.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[var(--card-bg)] rounded-xl p-4 border border-[var(--border-color)]">
          <div className="text-xs text-zinc-500 mb-1">未實現盈虧</div>
          <div className={cn("text-lg font-bold", todayPnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
            {todayPnl >= 0 ? '+' : ''}${todayPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-[var(--card-bg)] rounded-xl p-4 border border-[var(--border-color)]">
          <div className="text-xs text-zinc-500 mb-1">持倉數</div>
          <div className="text-lg font-bold text-white">{holdings.length}</div>
        </div>
        <div className="bg-[var(--card-bg)] rounded-xl p-4 border border-[var(--border-color)]">
          <div className="text-xs text-zinc-500 mb-1">勝率</div>
          <div className="text-lg font-bold text-white">{winRate}%</div>
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center border border-zinc-700">
            <BarChart2 size={20} className="text-zinc-600"/>
          </div>
          <p className="text-zinc-400 text-sm font-bold">尚無持倉資料</p>
          <p className="text-zinc-600 text-xs">在交易頁面下單後，持倉將顯示在此處</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-8">
            {holdings.map(h => (
              <div
                key={h.symbol}
                className={cn(
                  "min-w-[280px] bg-zinc-900 rounded-2xl p-6 border border-zinc-700 shadow-xl transition-colors duration-300 hover:bg-zinc-800",
                  h.flash
                )}
              >
                <div className="flex justify-between items-center mb-5">
                  <span className="font-bold text-white text-xl">{h.symbol}</span>
                  <span className={cn('font-mono font-bold text-lg', h.pnl > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {h.pnl > 0 ? '+' : ''}{h.pnl.toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm text-zinc-300 mb-5">
                  <div>持倉: <span className="text-white font-mono font-semibold">{h.qty.toLocaleString()}</span></div>
                  <div>均價: <span className="text-white font-mono font-semibold">{h.avgPrice.toFixed(2)}</span></div>
                  <div>現價: <span className="text-white font-mono font-semibold">{h.currentPrice.toFixed(2)}</span></div>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full", h.pnl > 0 ? 'bg-emerald-500' : 'bg-rose-500')}
                    style={{ width: `${Math.min(Math.abs(h.pnl) / 500, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
