/**
 * server/services/TWSeService.ts
 * TWSE 台灣證券交易所即時報價補強服務
 *
 * 提供：
 *  - realtimeQuote(code)        → 個股即時報價
 *  - realtimePrices(codes[])    → 批量即時報價
 *
 * 資料來源：
 *  - https://mis.twse.com.tw/stock/api/getStockInfo.asp  (上市 TWSE)
 *  - https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes  (上櫃 TPEx)
 *
 * 純數字4碼為上市(TSE)；後綴 .TWO 或 5~6 碼為上櫃(OTC)。
 */

const TWSE_REALTIME_URL = 'https://mis.twse.com.tw/stock/api/getStockInfo.asp';
const TPEX_REALTIME_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

export interface TWSeQuote {
  symbol: string;   // e.g. "2330"
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePercent: number;
  volume: number;   // 成交量（張）
  timestamp: number; // unix ms
  source: 'TWSE' | 'TPEX';
}

/** 正規化代碼：移除 .TW / .TWO 後綴 */
function normCode(symbol: string): string {
  return symbol.replace(/\.(TW|TWO)$/i, '');
}

/** 判斷是否為上市 (TSE) 或上櫃 (OTC/TPEx) */
function isTSE(code: string): boolean {
  return /^\d{4}$/.test(code) && parseInt(code) < 9000;
}

// ── TWSE 上市即時 ──────────────────────────────────────────────────────────────
async function fetchTWSE(codes: string[]): Promise<TWSeQuote[]> {
  const queryStr = codes.map(c => `tse_${c}.tw`).join('|');
  const url = `${TWSE_REALTIME_URL}?ex_ch=${encodeURIComponent(queryStr)}&json=1&delay=0`;

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': 'https://mis.twse.com.tw/' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`TWSE HTTP ${res.status}`);

  const json = await res.json();
  const msgArray: Record<string, string>[] = json?.msgArray ?? [];

  return msgArray.map((item): TWSeQuote => {
    const price      = parseFloat(item.z ?? item.y ?? '0') || 0;
    const prevClose  = parseFloat(item.y ?? '0') || 0;
    const open       = parseFloat(item.o ?? '0') || 0;
    const high       = parseFloat(item.h ?? '0') || 0;
    const low        = parseFloat(item.l ?? '0') || 0;
    const volume     = parseInt(item.v ?? '0', 10) || 0;
    const change     = prevClose ? price - prevClose : 0;
    const changePct  = prevClose ? (change / prevClose) * 100 : 0;

    return {
      symbol:        item.c ?? '',
      name:          item.n ?? '',
      price,
      open,
      high,
      low,
      prevClose,
      change:        parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePct.toFixed(2)),
      volume,
      timestamp:     Date.now(),
      source:        'TWSE',
    };
  });
}

// ── TPEx 上櫃即時 ──────────────────────────────────────────────────────────────
async function fetchTPEx(codes: string[]): Promise<TWSeQuote[]> {
  const res = await fetch(TPEX_REALTIME_URL, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`TPEx HTTP ${res.status}`);

  const json: Record<string, string>[] = await res.json();
  const set = new Set(codes.map(c => c.toLowerCase()));

  return json
    .filter(item => item.SecuritiesCompanyCode && set.has(item.SecuritiesCompanyCode.toLowerCase()))
    .map((item): TWSeQuote => {
      const price      = parseFloat(item.ClosingPrice ?? '0') || 0;
      const prevClose  = parseFloat(item.PreviousClose ?? '0') || 0;
      const open       = parseFloat(item.OpeningPrice ?? '0') || 0;
      const high       = parseFloat(item.HighestPrice ?? '0') || 0;
      const low        = parseFloat(item.LowestPrice ?? '0') || 0;
      const volume     = parseInt(item.TradeVolume ?? '0', 10) || 0;
      const change     = prevClose ? price - prevClose : 0;
      const changePct  = prevClose ? (change / prevClose) * 100 : 0;

      return {
        symbol:        item.SecuritiesCompanyCode ?? '',
        name:          item.CompanyName ?? '',
        price,
        open,
        high,
        low,
        prevClose,
        change:        parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePct.toFixed(2)),
        volume,
        timestamp:     Date.now(),
        source:        'TPEX',
      };
    });
}

// ── 公開 API ──────────────────────────────────────────────────────────────────

/** 取得單一台股即時報價；若不在交易時段可能回傳舊資料 */
export async function realtimeQuote(symbol: string): Promise<TWSeQuote | null> {
  const code = normCode(symbol);
  try {
    const results = isTSE(code)
      ? await fetchTWSE([code])
      : await fetchTPEx([code]);
    return results.find(q => q.symbol === code) ?? null;
  } catch (err) {
    console.warn(`[TWSE] realtimeQuote(${symbol}) failed:`, (err as Error).message);
    return null;
  }
}

/** 批量取得台股即時報價 */
export async function realtimePrices(symbols: string[]): Promise<TWSeQuote[]> {
  const tseCodes = symbols.map(normCode).filter(isTSE);
  const otcCodes = symbols.map(normCode).filter(c => !isTSE(c));
  const results: TWSeQuote[] = [];

  if (tseCodes.length > 0) {
    try { results.push(...await fetchTWSE(tseCodes)); }
    catch (err) { console.warn('[TWSE] batch TSE failed:', (err as Error).message); }
  }
  if (otcCodes.length > 0) {
    try { results.push(...await fetchTPEx(otcCodes)); }
    catch (err) { console.warn('[TWSE] batch OTC failed:', (err as Error).message); }
  }

  return results;
}

/** 檢查 TWSE 服務是否可用（不保證即時，只 ping 一次） */
export async function isAvailable(): Promise<boolean> {
  try {
    const res = await fetch('https://mis.twse.com.tw/stock/index.jsp', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
