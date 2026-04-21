import { TWSEData } from '../types';

export function isTW(s: string) { return /^\d{4}(\.TW(O)?)?$/.test(s)||s.endsWith('.TW')||s.endsWith('.TWO'); }
export function safeN(v: unknown, dec=2): string { const n=Number(v); return isFinite(n)?n.toFixed(dec):'—'; }
export function safeCn(...cls: (string|undefined|null|false)[]) { return cls.filter(Boolean).join(' '); }
export function renderStr(v: unknown, fb='—'): string {
  if(v==null) return fb;
  if(typeof v==='object') {
    const obj = v as Record<string, unknown>;
    return String(obj?.fmt??obj?.raw??obj?.text??JSON.stringify(v));
  }
  return String(v);
}
export function indicRows(indic: { rsi: number, macd: { MACD: number, histogram: number, signal: number }, sma20: number } | null, twse: TWSEData | null): [string,string,string][] {
  if (!indic) return [];
  return [
    ['RSI (14)',  safeN(indic.rsi,1),         indic.rsi>70?'text-rose-400':indic.rsi<30?'text-emerald-400':'text-white'],
    ['MACD',     safeN(indic.macd?.MACD,3),   (indic.macd?.histogram??0)>0?'text-emerald-400':'text-rose-400'],
    ['Signal',   safeN(indic.macd?.signal,3),  'text-amber-400'],
    ['SMA (20)', safeN(indic.sma20),            'text-white'],
    ...(twse?[['來源','TWSE Live','text-emerald-400'] as [string,string,string]]:[]),
  ];
}

/**
 * Haptic feedback helper
 */
export function vibrate(pattern: number | number[] = 50) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }
}
