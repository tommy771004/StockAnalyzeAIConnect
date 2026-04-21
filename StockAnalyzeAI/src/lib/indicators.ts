/**
 * src/lib/indicators.ts
 *
 * All indicator calculations delegate to utils/math.ts (Decimal.js precision)
 * or use Decimal.js directly — no raw JS float arithmetic on financial series.
 */
import { Decimal } from 'decimal.js';
import { _ema, calcRSISeries, calcMACDSeries, calcBBSeries } from '../utils/math';

// ── EMA (Decimal.js via utils/math) ──────────────────────────────────────────
export function calcEMA(closes: number[], period: number): number[] {
  return _ema(closes, period);
}

// ── SMA (Decimal.js) ─────────────────────────────────────────────────────────
export function calcSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => new Decimal(a).plus(b).toNumber(), 0) / period;
  });
}

// ── RSI (delegates to utils/math Decimal.js Wilder's smoothing) ──────────────
export function calcRSI(closes: number[], period = 14): number[] {
  return calcRSISeries(closes, period);
}

// ── MACD (delegates to utils/math; adapts field names for callers) ────────────
export function calcMACD(closes: number[], fast = 12, slow = 26, sig = 9) {
  // calcMACDSeries uses default (12, 26, 9) — forward custom params via _ema directly
  if (fast === 12 && slow === 26 && sig === 9) {
    return calcMACDSeries(closes).map(v => ({ MACD: v.macd, signal: v.signal, histogram: v.hist }));
  }
  // Custom periods: compute manually with Decimal.js via _ema
  const e_fast = _ema(closes, fast);
  const e_slow = _ema(closes, slow);
  const macdLine = e_fast.map((v, i) => new Decimal(v).minus(e_slow[i]).toNumber());
  const signalLine = _ema(macdLine, sig);
  return macdLine.map((v, i) => ({
    MACD: v,
    signal: signalLine[i],
    histogram: new Decimal(v).minus(signalLine[i]).toNumber(),
  }));
}

// ── Bollinger Bands (delegates to utils/math Decimal.js) ─────────────────────
export function calcBB(closes: number[], period = 20, mult = 2) {
  return calcBBSeries(closes, period, mult);
}

// ── VWAP (Decimal.js) ────────────────────────────────────────────────────────
export function calcVWAP(rows: { high: number; low: number; close: number; volume: number }[]) {
  let pv = new Decimal(0);
  let vol = new Decimal(0);
  return rows.map(r => {
    const tp = new Decimal(r.high).plus(r.low).plus(r.close).div(3);
    pv = pv.plus(tp.mul(r.volume));
    vol = vol.plus(r.volume);
    return vol.gt(0) ? pv.div(vol).toNumber() : tp.toNumber();
  });
}

// ── KD / Stochastic (Decimal.js) ─────────────────────────────────────────────
export function calcKD(closes: number[], high: number[], low: number[], n = 9, m1 = 3, m2 = 3) {
  if (closes.length < n) return closes.map(() => ({ K: 50, D: 50 }));
  const kArr: number[] = [];
  const dArr: number[] = [];
  let k = new Decimal(50);
  let d = new Decimal(50);
  for (let i = 0; i < closes.length; i++) {
    if (i < n - 1) { kArr.push(50); dArr.push(50); continue; }
    const sliceLow  = low.slice(i - n + 1, i + 1);
    const sliceHigh = high.slice(i - n + 1, i + 1);
    if (!sliceLow.length || !sliceHigh.length) { kArr.push(50); dArr.push(50); continue; }
    const wLow  = new Decimal(Math.min(...sliceLow));
    const wHigh = new Decimal(Math.max(...sliceHigh));
    const rsv = wHigh.eq(wLow)
      ? new Decimal(50)
      : new Decimal(closes[i]).minus(wLow).div(wHigh.minus(wLow)).mul(100);
    k = rsv.plus(k.mul(m1 - 1)).div(m1);
    d = k.plus(d.mul(m2 - 1)).div(m2);
    kArr.push(k.toNumber());
    dArr.push(d.toNumber());
  }
  return kArr.map((v, i) => ({ K: v, D: dArr[i] }));
}

// ── ATR (Wilder's smoothing, precision-safe) ──────────────────────────────────
export function calcATR(high: number[], low: number[], close: number[], period = 14): number[] {
  if (!high || !low || !close || high.length < period) return [];
  const tr = high.map((h, i) => {
    if (i === 0) return new Decimal(h).minus(low[i]).toNumber();
    return new Decimal(Math.max(
      h - low[i],
      Math.abs(h - close[i - 1]),
      Math.abs(low[i] - close[i - 1]),
    )).toNumber();
  });
  const atr: number[] = [];
  let avg = new Decimal(tr.slice(0, period).reduce((a, b) => a + b, 0)).div(period);
  atr.push(avg.toNumber());
  for (let i = period; i < tr.length; i++) {
    avg = avg.mul(period - 1).plus(tr[i]).div(period);
    atr.push(avg.toNumber());
  }
  return atr;
}

// ── Aliases (backward compat) ─────────────────────────────────────────────────
export const calculateRSI  = calcRSI;
export const calculateMACD = calcMACD;
export const calculateVWAP = calcVWAP;
export const calculateATR  = calcATR;
export const calculateKD   = calcKD;
