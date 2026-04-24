import { Decimal } from 'decimal.js';

export function _ema(closes: number[], p: number): number[] {
  if (!closes.length) return [];
  const k = 2 / (p + 1);
  let e = closes[0];
  return closes.map((v, i) => {
    if (i === 0) return e;
    // e = val * k + e * (1 - k)
    e = v * k + e * (1 - k);
    return e;
  });
}

export function _rsi(closes: number[], period = 14): number {
  try {
    if (closes.length < period + 2) return 50;
    let g = 0;
    let l = 0;
    for (let i = closes.length - period - 1; i < closes.length - 1; i++) {
      const d = closes[i + 1] - closes[i];
      if (d > 0) {
        g += d;
      } else {
        l += Math.abs(d);
      }
    }
    const ag = g / period;
    const al = l / period;
    if (al === 0) return 100;
    const rs = ag / al;
    // 100 - 100 / (1 + rs)
    return 100 - (100 / (1 + rs));
  } catch {
    return 50;
  }
}

export function _macd(closes: number[]) {
  try {
    const e12 = _ema(closes, 12);
    const e26 = _ema(closes, 26);
    const ml = e12.map((v, i) => v - e26[i]);
    const sl = _ema(ml, 9);
    const last = ml.length - 1;
    const macdVal = ml[last];
    const signalVal = sl[last];
    return {
      MACD: macdVal,
      signal: signalVal,
      histogram: macdVal - signalVal
    };
  } catch {
    return null;
  }
}

export function _sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    sum += closes[i];
  }
  return sum / period;
}

// ── Chart series helpers ──────────────────────────────────────────────────────

/** EMA time-series for charting — alias of _ema for consistent naming */
export function calcEMA(closes: number[], period: number): number[] {
  return _ema(closes, period);
}

/**
 * RSI time-series using Wilder's smoothing — returns one value per candle.
 * Entries before `period` are filled with 50 (neutral).
 */
export function calcRSISeries(closes: number[], period = 14): number[] {
  if (!closes || closes.length <= period) return Array(closes.length).fill(50);
  const rsi: number[] = Array(period).fill(50);
  let ag = 0;
  let al = 0;
  for (let i = 1; i <= period; i++) {
    const c = closes[i] - closes[i - 1];
    if (c > 0) ag += c;
    else al -= c;
  }
  ag /= period;
  al /= period;
  const toRsi = (g: number, l: number) =>
    l === 0 ? 100 : 100 - (100 / (1 + g / l));
  rsi[period] = toRsi(ag, al);
  for (let i = period + 1; i < closes.length; i++) {
    const c = closes[i] - closes[i - 1];
    if (c > 0) {
      ag = (ag * (period - 1) + c) / period;
      al = (al * (period - 1)) / period;
    } else {
      al = (al * (period - 1) - c) / period;
      ag = (ag * (period - 1)) / period;
    }
    rsi.push(toRsi(ag, al));
  }
  return rsi;
}

/**
 * MACD time-series — returns one {macd, signal, hist} per candle.
 */
export function calcMACDSeries(closes: number[]): { macd: number; signal: number; hist: number }[] {
  if (!closes?.length) return [];
  const e12 = _ema(closes, 12);
  const e26 = _ema(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const signalLine = _ema(macdLine, 9);
  return macdLine.map((v, i) => ({
    macd: v,
    signal: signalLine[i],
    hist: v - signalLine[i],
  }));
}

/**
 * Bollinger Bands time-series — returns one entry per candle, null before `period` candles.
 */
export function calcBBSeries(
  closes: number[],
  period = 20,
  mult = 2,
): ({ upper: number; mid: number; lower: number } | null)[] {
  if (!closes?.length) return [];
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    const mean = sum / period;
    
    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varianceSum += (closes[j] - mean) * (closes[j] - mean);
    }
    const variance = varianceSum / period;
    const std = Math.sqrt(variance);
    
    return {
      upper: mean + mult * std,
      mid: mean,
      lower: mean - mult * std,
    };
  });
}
