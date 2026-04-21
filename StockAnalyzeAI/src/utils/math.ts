import { Decimal } from 'decimal.js';

export function _ema(closes: number[], p: number): number[] {
  if (!closes.length) return [];
  const k = new Decimal(2).div(p + 1);
  let e = new Decimal(closes[0]);
  return closes.map((v, i) => {
    if (i === 0) return e.toNumber();
    const val = new Decimal(v);
    // e = val * k + e * (1 - k)
    e = val.mul(k).plus(e.mul(new Decimal(1).minus(k)));
    return e.toNumber();
  });
}

export function _rsi(closes: number[], period = 14): number {
  try {
    if (closes.length < period + 2) return 50;
    let g = new Decimal(0);
    let l = new Decimal(0);
    for (let i = closes.length - period - 1; i < closes.length - 1; i++) {
      const d = new Decimal(closes[i + 1]).minus(closes[i]);
      if (d.gt(0)) {
        g = g.plus(d);
      } else {
        l = l.plus(d.abs());
      }
    }
    const ag = g.div(period);
    const al = l.div(period);
    if (al.isZero()) return 100;
    const rs = ag.div(al);
    // 100 - 100 / (1 + rs)
    return new Decimal(100).minus(new Decimal(100).div(new Decimal(1).plus(rs))).toNumber();
  } catch {
    return 50;
  }
}

export function _macd(closes: number[]) {
  try {
    const e12 = _ema(closes, 12);
    const e26 = _ema(closes, 26);
    const ml = e12.map((v, i) => new Decimal(v).minus(e26[i]).toNumber());
    const sl = _ema(ml, 9);
    const last = ml.length - 1;
    const macdVal = new Decimal(ml[last]);
    const signalVal = new Decimal(sl[last]);
    return {
      MACD: macdVal.toNumber(),
      signal: signalVal.toNumber(),
      histogram: macdVal.minus(signalVal).toNumber()
    };
  } catch {
    return null;
  }
}

export function _sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const sum = closes.slice(-period).reduce((a, b) => a.plus(b), new Decimal(0));
  return sum.div(period).toNumber();
}

// ── Chart series helpers (Decimal.js precision, returns full arrays) ──────────

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
  let ag = new Decimal(0);
  let al = new Decimal(0);
  for (let i = 1; i <= period; i++) {
    const c = new Decimal(closes[i]).minus(closes[i - 1]);
    if (c.gt(0)) ag = ag.plus(c);
    else al = al.minus(c);
  }
  ag = ag.div(period);
  al = al.div(period);
  const toRsi = (g: Decimal, l: Decimal) =>
    l.isZero() ? 100 : new Decimal(100).minus(new Decimal(100).div(new Decimal(1).plus(g.div(l)))).toNumber();
  rsi[period] = toRsi(ag, al);
  for (let i = period + 1; i < closes.length; i++) {
    const c = new Decimal(closes[i]).minus(closes[i - 1]);
    if (c.gt(0)) {
      ag = ag.mul(period - 1).plus(c).div(period);
      al = al.mul(period - 1).div(period);
    } else {
      al = al.mul(period - 1).minus(c).div(period);
      ag = ag.mul(period - 1).div(period);
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
  const macdLine = e12.map((v, i) => new Decimal(v).minus(e26[i]).toNumber());
  const signalLine = _ema(macdLine, 9);
  return macdLine.map((v, i) => ({
    macd: v,
    signal: signalLine[i],
    hist: new Decimal(v).minus(signalLine[i]).toNumber(),
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
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = new Decimal(slice.reduce((a, b) => a + b, 0)).div(period);
    const variance = slice.reduce((a, b) => a + new Decimal(b).minus(mean).pow(2).toNumber(), 0) / period;
    const std = new Decimal(Math.sqrt(variance));
    const m = new Decimal(mult);
    return {
      upper: mean.plus(m.mul(std)).toNumber(),
      mid: mean.toNumber(),
      lower: mean.minus(m.mul(std)).toNumber(),
    };
  });
}
