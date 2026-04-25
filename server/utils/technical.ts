/**
 * server/utils/technical.ts
 * 技術指標運算模組 — 純 TypeScript，不依賴外部套件
 *
 * 接受歷史 OHLCV 陣列，計算：
 *   - SMA(20) / SMA(50)
 *   - EMA(12) / EMA(26) → MACD Line / Signal / Histogram
 *   - RSI(14) — Wilder 平滑法
 *
 * 最後依指標組合輸出繁體中文「綜合建議」。
 */

export interface OHLCV {
  date: Date | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalResult {
  sma5:        (number | null)[];
  sma20:       (number | null)[];
  sma50:       (number | null)[];
  sma60:       (number | null)[];
  macdLine:    (number | null)[];
  macdSignal:  (number | null)[];
  macdHist:    (number | null)[];
  rsi14:       (number | null)[];
  /** 最新各指標值（最後一根K棒） */
  latest: {
    sma5:       number | null;
    sma20:      number | null;
    sma50:      number | null;
    sma60:      number | null;
    macdLine:   number | null;
    macdSignal: number | null;
    macdHist:   number | null;
    rsi14:      number | null;
  };
  /** 繁體中文綜合建議 */
  recommendation: string;
  /** 信號強度 0–100 */
  score: number;
}

// ── 基礎計算函式 ───────────────────────────────────────────────────────────────

function sma(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function ema(data: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = [];
  let prev: number | null = null;

  for (const v of data) {
    if (prev === null) {
      prev = v;
    } else {
      prev = v * k + prev * (1 - k);
    }
    result.push(prev);
  }
  return result;
}

function rsiWilder(data: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = Array(data.length).fill(null);
  if (data.length < period + 1) return result;

  // 初始平均增跌（前 period 個差值的簡單平均）
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // Wilder 平滑
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

// ── 主函式 ────────────────────────────────────────────────────────────────────

export function calcIndicators(candles: OHLCV[]): TechnicalResult {
  const closes = candles.map(c => c.close);

  const sma5      = sma(closes, 5);
  const sma20     = sma(closes, 20);
  const sma50     = sma(closes, 50);
  const sma60     = sma(closes, 60);
  const ema12     = ema(closes, 12);
  const ema26     = ema(closes, 26);
  const macdLine  = ema12.map((v, i) =>
    v !== null && ema26[i] !== null ? v - ema26[i]! : null,
  );
  const macdValues = macdLine.filter((v): v is number => v !== null);
  const signalRaw  = ema(macdValues, 9);
  // 對齊到原始長度
  const offset     = macdLine.length - signalRaw.length;
  const macdSignal: (number | null)[] = Array(offset).fill(null).concat(signalRaw);
  const macdHist   = macdLine.map((v, i) =>
    v !== null && macdSignal[i] !== null ? v - macdSignal[i]! : null,
  );
  const rsi14 = rsiWilder(closes, 14);

  const last = closes.length - 1;
  const latest = {
    sma5:       sma5[last],
    sma20:      sma20[last],
    sma50:      sma50[last],
    sma60:      sma60[last],
    macdLine:   macdLine[last],
    macdSignal: macdSignal[last],
    macdHist:   macdHist[last],
    rsi14:      rsi14[last],
  };

  const { recommendation, score } = generateRecommendation(closes[last], latest);

  return {
    sma5,
    sma20,
    sma50,
    sma60,
    macdLine,
    macdSignal,
    macdHist,
    rsi14,
    latest,
    recommendation,
    score,
  };
}

// ── 綜合建議邏輯 ──────────────────────────────────────────────────────────────

function generateRecommendation(
  price: number,
  l: TechnicalResult['latest'],
): { recommendation: string; score: number } {
  let bullPoints = 0;
  let bearPoints = 0;

  // SMA 趨勢
  if (l.sma20 !== null && l.sma50 !== null) {
    if (price > l.sma20 && l.sma20 > l.sma50) bullPoints += 20;
    else if (price < l.sma20 && l.sma20 < l.sma50) bearPoints += 20;
    else if (price > l.sma50) bullPoints += 10;
    else bearPoints += 10;
  }

  // MACD
  if (l.macdHist !== null && l.macdLine !== null) {
    if (l.macdHist > 0 && l.macdLine > 0) bullPoints += 25;
    else if (l.macdHist > 0) bullPoints += 15;
    else if (l.macdHist < 0 && l.macdLine < 0) bearPoints += 25;
    else bearPoints += 15;
  }

  // RSI
  if (l.rsi14 !== null) {
    if (l.rsi14 < 30) bullPoints += 25;       // 超賣
    else if (l.rsi14 > 70) bearPoints += 25;  // 超買
    else if (l.rsi14 < 45) bullPoints += 10;
    else if (l.rsi14 > 55) bearPoints += 10;
  }

  const total   = bullPoints + bearPoints || 1;
  const netBull = bullPoints / total;
  const score   = Math.round(netBull * 100);

  let recommendation: string;
  if (score >= 75)      recommendation = '🚀 強烈買進';
  else if (score >= 60) recommendation = '📈 偏向買進';
  else if (score >= 45) recommendation = '⚖️ 中性觀望';
  else if (score >= 30) recommendation = '📉 偏向賣出';
  else                  recommendation = '🔻 強烈賣出';

  // RSI 極值覆寫
  if (l.rsi14 !== null) {
    if (l.rsi14 < 25) recommendation = '🚀 RSI 嚴重超賣，強烈反彈機會';
    if (l.rsi14 > 80) recommendation = '⚠️ RSI 嚴重超買，注意回調風險';
  }

  return { recommendation, score };
}
