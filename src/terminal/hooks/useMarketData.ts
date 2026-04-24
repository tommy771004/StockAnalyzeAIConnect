import { useState, useEffect } from 'react';
import { getQuotes } from '../../services/api';

const SECTORS = ['XLK', 'XLF', 'XLV', 'XLY', 'XLI', 'XLP', 'XLE', 'XLB'];

/** 跑馬燈報價清單：美股指數 + 大型股 + 台股指數 + 加密貨幣 */
export const TICKER_TAPE_SYMBOLS = [
  // 美股指數
  '^DJI', '^GSPC', '^IXIC', '^SOX', '^VIX', '^RUT',
  // 美股大型股
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD', 'AVGO', 'TSM',
  // 台灣指數 & 代表性個股
  '^TWII', '2330.TW', '2317.TW', '2454.TW', '2382.TW',
  // 外匯 & 商品
  'GC=F', 'CL=F', 'USDTWD=X',
  // 加密貨幣
  'BTC-USD', 'ETH-USD', 'BNB-USD', 'SOL-USD', 'XRP-USD',
];

/** 顯示名稱對照表（Yahoo symbol → 跑馬燈顯示名） */
export const TICKER_LABEL_MAP: Record<string, string> = {
  '^DJI': 'DOW',   '^GSPC': 'S&P500', '^IXIC': 'NASDAQ', '^SOX': 'SOXX',
  '^VIX': 'VIX',   '^RUT': 'RUT',     '^TWII': 'TAIEX',
  'GC=F': 'GOLD',  'CL=F': 'OIL',     'USDTWD=X': 'USD/TWD',
  'BTC-USD': 'BTC', 'ETH-USD': 'ETH',  'BNB-USD': 'BNB',
  'SOL-USD': 'SOL', 'XRP-USD': 'XRP',
  '2330.TW': 'TSMC', '2317.TW': '鴻海', '2454.TW': '聯發科', '2382.TW': '廣達',
};


export function useMarketData() {
  const [sectors, setSectors] = useState<any[]>([]);
  const [indices, setIndices] = useState<any[]>([]);
  const [tickerQuotes, setTickerQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMarket = async () => {
      try {
        setLoading(true);
        const [secRes, tickerRes] = await Promise.all([
          getQuotes(SECTORS),
          getQuotes(TICKER_TAPE_SYMBOLS),
        ]);
        setSectors(secRes || []);
        setTickerQuotes(tickerRes || []);
        // indices subset: only the ^-prefixed symbols for Market page
        setIndices((tickerRes || []).filter((q: any) => q.symbol?.startsWith('^')));
      } catch (err) {
        console.error('Market fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMarket();
    const timer = setInterval(fetchMarket, 30000);
    return () => clearInterval(timer);
  }, []);

  return { sectors, indices, tickerQuotes, loading };
}

