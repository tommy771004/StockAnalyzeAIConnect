/**
 * Unified API service.
 *
 * When running inside Electron  → calls window.api (IPC, no server needed)
 * When running as a web app     → falls back to fetch('/api/...')
 *
 * Components import from here; they don't know or care which mode is active.
 */

const IS_ELECTRON = typeof window !== 'undefined' && !!(window as any).api?.isElectron;

// ── Helper: fallback to fetch in web mode ─────────────────────────────────────
async function fetchJSON(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ════════════════════════════════════════════════════════════════════════════════
//  Stock
// ════════════════════════════════════════════════════════════════════════════════
export async function getQuote(symbol: string) {
  if (IS_ELECTRON) return (window as any).api.getQuote(symbol);
  return fetchJSON(`/api/stock/${symbol}`);
}

export async function getHistory(symbol: string, opts?: { period1?: string; period2?: string; interval?: string }) {
  if (IS_ELECTRON) return (window as any).api.getHistory(symbol, opts);
  const p = new URLSearchParams();
  if (opts?.period1)  p.set('period1',  opts.period1);
  if (opts?.period2)  p.set('period2',  opts.period2);
  if (opts?.interval) p.set('interval', opts.interval);
  return fetchJSON(`/api/stock/${symbol}/history?${p}`);
}

export async function getBatchQuotes(symbols: string[]) {
  if (IS_ELECTRON) return (window as any).api.getBatch(symbols);
  return fetchJSON(`/api/quotes?symbols=${symbols.join(',')}`);
}

export async function getNews(symbol: string) {
  if (IS_ELECTRON) return (window as any).api.getNews(symbol);
  return fetchJSON(`/api/news/${symbol}`);
}

export async function getCalendar(symbol: string) {
  if (IS_ELECTRON) return (window as any).api.getCalendar(symbol);
  return fetchJSON(`/api/calendar/${symbol}`);
}

// ════════════════════════════════════════════════════════════════════════════════
//  Market / Forex
// ════════════════════════════════════════════════════════════════════════════════
export async function getMarketSummary(symbol = '2330.TW') {
  const syms = ['^GSPC','^NDX','^VIX','TSLA','AAPL','BTC-USD','ETH-USD', symbol];
  if (IS_ELECTRON) return (window as any).api.getBatch(syms);
  return fetchJSON(`/api/market-summary?symbol=${symbol}`);
}

export async function getForexRate(pair = 'USDTWD=X'): Promise<number> {
  if (IS_ELECTRON) return (window as any).api.getForex(pair);
  const r = await fetchJSON(`/api/forex/${pair}`);
  return r.rate ?? 32.5;
}

// ════════════════════════════════════════════════════════════════════════════════
//  TWSE
// ════════════════════════════════════════════════════════════════════════════════
export async function getTWSEStock(stockNo: string) {
  if (IS_ELECTRON) return (window as any).api.getTWSE(stockNo);
  return fetchJSON(`/api/twse/stock/${stockNo}`);
}

// ════════════════════════════════════════════════════════════════════════════════
//  Backtest
// ════════════════════════════════════════════════════════════════════════════════
export async function runBacktest(params: {
  symbol: string; period1: string; period2?: string;
  initialCapital: number; strategy: string;
}) {
  if (IS_ELECTRON) return (window as any).api.runBacktest(params);
  return fetchJSON('/api/backtest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(params) });
}

// ════════════════════════════════════════════════════════════════════════════════
//  Watchlist
// ════════════════════════════════════════════════════════════════════════════════
export async function getWatchlist() {
  if (IS_ELECTRON) return (window as any).api.getWatchlist();
  return fetchJSON('/api/watchlist');
}
export async function setWatchlist(list: { symbol: string; name: string }[]) {
  if (IS_ELECTRON) return (window as any).api.setWatchlist(list);
  return fetchJSON('/api/watchlist', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(list) });
}

// ════════════════════════════════════════════════════════════════════════════════
//  Positions
// ════════════════════════════════════════════════════════════════════════════════
export async function getPositions() {
  if (IS_ELECTRON) return (window as any).api.getPositions();
  const r = await fetchJSON('/api/positions');
  return r; // { positions, usdtwd }
}
export async function setPositions(list: any[]) {
  if (IS_ELECTRON) return (window as any).api.setPositions(list);
  return fetchJSON('/api/positions', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(list) });
}

// ════════════════════════════════════════════════════════════════════════════════
//  Trades
// ════════════════════════════════════════════════════════════════════════════════
export async function getTrades() {
  if (IS_ELECTRON) return (window as any).api.getTrades();
  return fetchJSON('/api/trades');
}
export async function addTrade(trade: any) {
  if (IS_ELECTRON) return (window as any).api.addTrade(trade);
  return fetchJSON('/api/trades', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(trade) });
}
export async function deleteTrade(id: number) {
  if (IS_ELECTRON) return (window as any).api.deleteTrade(id);
  return fetch(`/api/trades/${id}`, { method:'DELETE' });
}

// ════════════════════════════════════════════════════════════════════════════════
//  Settings
// ════════════════════════════════════════════════════════════════════════════════
export async function getSetting(key: string) {
  if (IS_ELECTRON) return (window as any).api.getSetting(key);
  return localStorage.getItem(key);
}
export async function setSetting(key: string, value: any) {
  if (IS_ELECTRON) return (window as any).api.setSetting(key, value);
  return localStorage.setItem(key, value);
}

// ════════════════════════════════════════════════════════════════════════════════
//  Misc
// ════════════════════════════════════════════════════════════════════════════════
export function openExternal(url: string) {
  if (IS_ELECTRON) { (window as any).api.openExternal(url); return; }
  window.open(url, '_blank', 'noopener');
}