import { useState, useEffect, useRef, useCallback } from 'react';
import { getQuotes } from '../../services/api';
import type { YahooQuote, PriceFlash } from '../types/market';

const SECTORS = ['XLK', 'XLF', 'XLV', 'XLY', 'XLI', 'XLP', 'XLE', 'XLB'];
const FLASH_TTL_MS = 3500; // How long the flash animation lives

/** 跑馬燈報價清單：美股指數 + 大型股 + 台股 + 商品 + 外匯 + 加密貨幣 */
export const TICKER_TAPE_SYMBOLS = [
  // 美股指數
  '^DJI', '^GSPC', '^IXIC', '^SOX', '^VIX', '^RUT',
  // 美股大型股
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD', 'AVGO', 'TSM',
  // 台灣指數 & 代表性個股
  '^TWII', '2330.TW', '2317.TW', '2454.TW', '2382.TW',
  // 商品 (Commodities)
  'GC=F',   // 黃金
  'SI=F',   // 白銀
  'CL=F',   // 西德州原油
  'NG=F',   // 天然氣
  'HG=F',   // 銅
  // 外匯 (Forex)
  'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'USDTWD=X',
  // 加密貨幣
  'BTC-USD', 'ETH-USD', 'BNB-USD', 'SOL-USD', 'XRP-USD',
];

/** 顯示名稱對照表（Yahoo symbol → 跑馬燈顯示名） */
export const TICKER_LABEL_MAP: Record<string, string> = {
  // 指數
  '^DJI': 'Wall St 30', '^GSPC': 'US SPX 500', '^IXIC': 'US Nas 100',
  '^SOX': 'SOX',        '^VIX': 'VIX',          '^RUT': 'Russell 2K',
  '^TWII': 'TAIEX',
  // 商品
  'GC=F': 'Gold',  'SI=F': 'Silver',  'CL=F': 'West Texas Oil',
  'NG=F': 'Natural Gas', 'HG=F': 'Copper',
  // 外匯
  'EURUSD=X': 'EUR/USD', 'GBPUSD=X': 'GBP/USD',
  'USDJPY=X': 'USD/JPY', 'USDTWD=X': 'USD/TWD',
  // 加密
  'BTC-USD': 'Bitcoin',  'ETH-USD': 'Ethereum', 'BNB-USD': 'BNB',
  'SOL-USD': 'Solana',   'XRP-USD': 'XRP',
  // 台股
  '2330.TW': 'TSMC', '2317.TW': '鴻海', '2454.TW': '聯發科', '2382.TW': '廣達',
};

/** 以台灣時間（Asia/Taipei, UTC+8）格式化為 HH:MM:SS */
export function formatTaipeiTime(d: Date = new Date()): string {
  return d.toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// PriceFlash is re-exported from shared types for consumers that import from this hook
export type { PriceFlash } from '../types/market';

export function useMarketData() {
  const [sectors, setSectors]           = useState<YahooQuote[]>([]);
  const [indices, setIndices]           = useState<YahooQuote[]>([]);
  const [tickerQuotes, setTickerQuotes] = useState<YahooQuote[]>([]);
  const [loading, setLoading]           = useState(true);
  const [lastUpdated, setLastUpdated]   = useState<string>('');

  // changedSymbols: Map<symbol, 'up'|'down'> — cleared after FLASH_TTL_MS
  const [changedSymbols, setChangedSymbols] = useState<Map<string, PriceFlash>>(new Map());

  // Persistent price cache to detect real changes across polls
  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearFlash = useCallback((sym: string) => {
    setChangedSymbols(prev => {
      if (!prev.has(sym)) return prev;
      const next = new Map(prev);
      next.delete(sym);
      return next;
    });
    flashTimersRef.current.delete(sym);
  }, []);

  useEffect(() => {
    const fetchMarket = async () => {
      try {
        setLoading(true);
        // Combine both symbol lists into a single request to avoid concurrent /api/quotes calls.
        // SECTORS symbols don't overlap with TICKER_TAPE_SYMBOLS, so the union is additive.
        const combined = [...new Set([...SECTORS, ...TICKER_TAPE_SYMBOLS])];
        const allQuotes = await getQuotes(combined);
        const qBySymbol = new Map((allQuotes || []).map((q: YahooQuote) => [q.symbol, q]));
        const secRes = SECTORS.map(s => qBySymbol.get(s)).filter(Boolean) as YahooQuote[];
        const tickerRes = TICKER_TAPE_SYMBOLS.map(s => qBySymbol.get(s)).filter(Boolean) as YahooQuote[];

        setSectors(secRes);
        setTickerQuotes(tickerRes);
        // Filter indices (symbols starting with ^) from the ticker response
        setIndices(tickerRes.filter((q: YahooQuote) => q.symbol?.startsWith('^')));
        setLastUpdated(formatTaipeiTime());

        // ── Price-change detection ───────────────────────────────────────────
        const newFlashes = new Map<string, PriceFlash>();

        (tickerRes || []).forEach((q: YahooQuote) => {
          const sym      = q.symbol as string;
          const newPrice = q.regularMarketPrice as number | undefined;
          if (newPrice == null) return;

          const oldPrice = prevPricesRef.current.get(sym);

          // Only flag as changed if there was a previous price AND it actually differs
          if (oldPrice != null && Math.abs(newPrice - oldPrice) > 0.00001) {
            newFlashes.set(sym, newPrice > oldPrice ? 'up' : 'down');
          }

          prevPricesRef.current.set(sym, newPrice);
        });

        if (newFlashes.size > 0) {
          setChangedSymbols(prev => {
            const merged = new Map(prev);
            newFlashes.forEach((dir, sym) => merged.set(sym, dir));
            return merged;
          });

          // Auto-clear each flash after TTL
          newFlashes.forEach((_, sym) => {
            // Cancel any existing timer for this symbol
            const old = flashTimersRef.current.get(sym);
            if (old) clearTimeout(old);

            const timer = setTimeout(() => clearFlash(sym), FLASH_TTL_MS);
            flashTimersRef.current.set(sym, timer);
          });
        }
      } catch (err) {
        console.error('Market fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMarket();
    const timer = setInterval(fetchMarket, 15000); // poll every 15s for fresher data
    return () => {
      clearInterval(timer);
      // Clean up flash timers on unmount
      flashTimersRef.current.forEach(t => clearTimeout(t));
    };
  }, [clearFlash]);

  return { sectors, indices, tickerQuotes, changedSymbols, lastUpdated, loading };
}
