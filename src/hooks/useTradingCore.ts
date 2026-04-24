import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { STORAGE_KEYS } from '../utils/storage';
import { Order, WatchlistItem, SearchResult, Position } from '../types';
import { pushLog } from '../components/TradeLogger';

export function useTradeExecution(
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
  setPortfolio: React.Dispatch<React.SetStateAction<Order[]>>
) {
  const [orderStatus, setOrderStatus] = useState<'idle' | 'busy'>('idle');

  const executeOrder = useCallback(
    async (symbol: string, side: 'buy' | 'sell', qty: number, price: number) => {
      setOrderStatus('busy');
      pushLog('info', 'SYSTEM', `Init Trade: ${side.toUpperCase()} ${qty} ${symbol} @ NT$${price}`);
      try {
        // [Risk Management / 風控模組]
        if (side === 'buy') {
           const posRes = await api.getPositions().catch(() => ({ positions: [] as Position[], usdtwd: 32 }));
           let totalVal = 0;
           let totalCost = 0;
           
           // 模擬初始購買力 1,000,000
           const INITIAL_CAPITAL = 1000000;

           posRes.positions.forEach((p: Position) => {
              const shares = p.shares || p.qty || 0;
              totalVal += (p.currentPrice || p.avgCost || 0) * shares;
              totalCost += (p.avgCost || p.avgPrice || 0) * shares;
           });
           
           const plVal = totalVal - totalCost;
           const plPct = totalCost > 0 ? (plVal / totalCost) * 100 : 0;
           const targetAccountValue = totalVal > 0 ? totalVal : INITIAL_CAPITAL;

           const tradeValue = qty * price;
           
           // 風控守則 1: 熔斷機制 (若帳戶虧損達 -3% 以上，強行鎖定任何 Buy 操作)
           if (totalCost > 0 && plPct <= -3) {
             const msg = `Circuit Breaker: Total Loss ${plPct.toFixed(2)}%, Buy Blocked.`;
             pushLog('error', 'RISK_CONTROL', msg);
             showToast(`[風控攔截] 總虧損已達 ${plPct.toFixed(2)}%，觸發熔斷機制，禁止建倉。`, 'error');
             throw new Error('Circuit Breaker Triggered');
           }

           // 風控守則 2: 資金佔比檢查 (單筆交易不得超過帳戶總值 5%)
           const maxAllowedAmount = targetAccountValue * 0.05;
           if (tradeValue > maxAllowedAmount) {
             const msg = `Position Limit: Value NT$${tradeValue.toLocaleString()} > Limit NT$${Math.floor(maxAllowedAmount).toLocaleString()}.`;
             pushLog('error', 'RISK_CONTROL', msg);
             showToast(`[風控攔截] 交易金額 NT$${tradeValue.toLocaleString()} 超過帳戶限制 5% (NT$${Math.floor(maxAllowedAmount).toLocaleString()})。`, 'error');
             throw new Error('Position Limit Exceeded');
           }
           pushLog('success', 'RISK_CONTROL', `Risk check passed (Allocation: ${((tradeValue/targetAccountValue)*100).toFixed(2)}%)`);
        }

        const res = await api.executeTrade({
          symbol,
          side: side.toUpperCase(),
          qty,
          price,
          mode: 'paper',
        });

        // Fix: Server returns { ok: true, trade: … }
        if (res.ok) {
          const trade = res.trade;
          const newOrder: Order = {
            id: trade.id || Date.now(),
            symbol: symbol,
            side: side.toUpperCase() as 'buy' | 'sell',
            qty,
            price,
            date: new Date().toISOString(),
          };
          setPortfolio((prev) => [...prev, newOrder]);
          pushLog('success', 'SYSTEM', `Sent: ${side.toUpperCase()} ${qty} ${symbol}`);
          showToast(`成功${side === 'buy' ? '買進' : '賣出'} ${qty} 股 ${symbol}`, 'success');
        } else {
          throw new Error('交易失敗');
        }
      } catch (e: unknown) {
        if (e instanceof Error && (e.message === 'Circuit Breaker Triggered' || e.message === 'Position Limit Exceeded')) {
            // Already toasted during risk check, just exit.
        } else {
            console.error('[TradingCore] Order execution failed:', e);
            pushLog('error', 'SYSTEM', `Exec failed: ${e instanceof Error ? e.message : 'Unknown'}`);
            showToast('交易處理失敗，請稍後再試。', 'error');
        }
      } finally {
        setOrderStatus('idle');
      }
    },
    [setPortfolio, showToast]
  );

  return { executeOrder, orderStatus };
}

export function useWatchlistManagement(
  watchlist: unknown[],
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
) {
  const queryClient = useQueryClient();
  const [wlSearch, setWlSearch] = useState('');
  const [wlAdding, setWlAdding] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (wlSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    const handler = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.searchStocks(wlSearch);
        setSearchResults(res.quotes || []);
      } catch (e) {
        console.warn('[useWatchlistManagement] Search failed:', e);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [wlSearch]);

  const addToWatchlist = useCallback(
    async (sym: string) => {
      const typedWatchlist = watchlist as WatchlistItem[];
      if (!sym || typedWatchlist.find((w: WatchlistItem) => w.symbol === sym)) return;
      try {
        await api.addWatchlistItem(sym);
        queryClient.invalidateQueries({ queryKey: [STORAGE_KEYS.WATCHLIST] });
        setWlSearch('');
        setWlAdding(false);
        showToast(`已新增 ${sym} 至自選股`, 'success');
      } catch (e: unknown) {
        console.error('[TradingCore] Failed to add watchlist item:', e);
        showToast('新增自選股失敗，請稍後再試。', 'error');
      }
    },
    [watchlist, queryClient, showToast]
  );

  return { addToWatchlist, wlSearch, setWlSearch, wlAdding, setWlAdding, searchResults, isSearching };
}
