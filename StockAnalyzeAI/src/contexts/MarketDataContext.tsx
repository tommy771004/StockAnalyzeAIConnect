import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../services/api';
import { useToast } from './ToastContext';
import { Quote } from '../types';

interface TickerItem { symbol: string; pct: number; }

interface MarketDataContextType {
  tickers: TickerItem[];
  latency: number;
}

const MarketDataContext = createContext<MarketDataContextType | undefined>(undefined);

const TICKER_SYMBOLS = ['TSLA', 'AAPL', 'BTC-USD', 'ETH-USD', 'NVDA', '^GSPC'];

export const MarketDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tickers, setTickers] = useState<TickerItem[]>([]);
  const [latency, setLatency] = useState(12);
  const { toast } = useToast();
  const toastRef = useRef(toast);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const fetchTickers = useCallback(async () => {
    if (!navigator.onLine) return; // Silent return if offline
    try {
      const data = await api.getBatchQuotes(TICKER_SYMBOLS);
      const newTickers = (Array.isArray(data) ? data : []).filter(Boolean).map((q: Quote) => ({ symbol: q.symbol ?? '', pct: q.regularMarketChangePercent ?? 0, price: q.regularMarketPrice ?? 0 }));
      setTickers(newTickers);
      
      // Simulate "Live Activity" background update / Push Notification
      // For demonstration, if a major index has moved > 2% or we just want to push an update
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          // Check if we should notify (throttle to avoid spam, maybe only every 5 mins. For demo, we just do it once if not done recently)
          const lastNotify = sessionStorage.getItem('last_notify');
          const now = Date.now();
          if (!lastNotify || now - parseInt(lastNotify) > 10 * 60 * 1000) {
             const mainIdx = newTickers.find(t => t.symbol === '^GSPC');
             if (mainIdx && Math.abs(mainIdx.pct) > 0.5) {
                 new Notification('Quantum AI: 市場波動警示', {
                     body: `S&P 500 現報 ${mainIdx.price.toFixed(2)} (${mainIdx.pct > 0 ? '+' : ''}${mainIdx.pct.toFixed(2)}%)。點擊以開啟您的通勤儀表板。`,
                     icon: '/favicon.svg',
                     tag: 'live-activity-update'
                 });
                 sessionStorage.setItem('last_notify', now.toString());
             }
          }
      }
    } catch (e) {
      console.error('Failed to fetch tickers:', e);
      if (navigator.onLine) {
        toastRef.current('Failed to fetch tickers: ' + (e instanceof Error ? e.message : 'Unknown error'), 'error');
      }
    }
  }, []);

  useEffect(() => {
    // 延遲執行，避免在渲染期間更新狀態
    const timer = setTimeout(fetchTickers, 0);
    const id = setInterval(fetchTickers, 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(id);
    };
  }, [fetchTickers]);

  useEffect(() => {
    const measureLatency = async () => {
      const start = Date.now();
      try {
        await fetch('/api/health');
        setLatency(Date.now() - start);
      } catch(e) {
        console.warn('[MarketData] latency check:', e);
        setLatency(0);
      }
    };
    measureLatency();
    const id = setInterval(measureLatency, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <MarketDataContext.Provider value={{ tickers, latency }}>
      {children}
    </MarketDataContext.Provider>
  );
};

export const useMarketData = () => {
  const context = useContext(MarketDataContext);
  if (!context) throw new Error('useMarketData must be used within MarketDataProvider');
  return context;
};
