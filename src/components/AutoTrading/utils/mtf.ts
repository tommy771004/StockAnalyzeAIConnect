/**
 * src/components/AutoTrading/utils/mtf.ts
 * 多時區趨勢過濾邏輯
 */
import type { StrategyParams } from '../types';

export interface MTFSignal {
  symbol: string;
  timeframe: string;
  trend: 'UP' | 'DOWN' | 'NEUTRAL';
  score: number;
}

/**
 * 判定 MTF 趨勢是否允許進場
 * 邏輯：如果主時區趨勢與交易方向相反，則過濾掉該信號
 */
export function isMTFAllowed(
  action: 'BUY' | 'SELL',
  params: StrategyParams,
  signals: Record<string, MTFSignal>
): boolean {
  if (!params.enableMTF) return true;

  const symbol = 'GLOBAL'; // 簡化版，或從參數傳入
  const mtfSignal = signals[symbol];

  if (!mtfSignal) return true;

  if (action === 'BUY' && mtfSignal.trend === 'DOWN') return false;
  if (action === 'SELL' && mtfSignal.trend === 'UP') return false;

  return true;
}

/**
 * 計算綜合趨勢分數
 */
export function calculateTrendAlignment(
  currentTrend: number,
  mtfTrend: number
): number {
  // 分數範圍 -100 ~ 100
  // 如果兩者同向，強化分數
  if (currentTrend * mtfTrend > 0) {
    return Math.min(100, Math.max(-100, (currentTrend + mtfTrend) * 0.8));
  }
  // 如果反向，削弱分數
  return (currentTrend + mtfTrend) * 0.3;
}
