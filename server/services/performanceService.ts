/**
 * server/services/performanceService.ts
 *
 * 從 trades 表計算「真實」績效指標 — 取代 reportService 中
 * 硬編碼的 Sharpe 1.8 / 隨機 confidence 序列。
 *
 * 公式：
 *   日報酬     = sum(pnl on day) / equity_start_of_day
 *   Sharpe     = mean(daily_return) / stddev(daily_return) * sqrt(252)
 *   MaxDD      = max( peak - trough ) / peak  ；以累計權益曲線計算
 *   ProfitFactor = sum(positive pnl) / abs(sum(negative pnl))
 */

import { eq, and, gte, desc } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { trades, type Trade } from '../../src/db/schema.js';

export type Period = '1d' | '1w' | '1m' | '3m' | 'ytd' | 'all';

export interface PerformanceMetrics {
  totalTrades: number;
  winRate: number;            // 0-100
  totalPnL: number;
  avgPnL: number;
  sharpe: number;
  maxDrawdown: number;        // -1..0 例 -0.12 = -12%
  profitFactor: number;
  bestTrade: { ticker: string; pnl: number } | null;
  worstTrade: { ticker: string; pnl: number } | null;
}

export interface EquityPoint { date: string; equity: number; pnl: number }
export interface PerformanceResult {
  metrics: PerformanceMetrics;
  equityCurve: EquityPoint[];
  drawdownCurve: { date: string; drawdown: number }[];
  attribution: Record<string, { pnl: number; trades: number; winRate: number }>;
}

function periodStart(period: Period, now = new Date()): Date | null {
  const d = new Date(now.getTime());
  switch (period) {
    case '1d': d.setUTCDate(d.getUTCDate() - 1); return d;
    case '1w': d.setUTCDate(d.getUTCDate() - 7); return d;
    case '1m': d.setUTCMonth(d.getUTCMonth() - 1); return d;
    case '3m': d.setUTCMonth(d.getUTCMonth() - 3); return d;
    case 'ytd': return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    case 'all': return null;
  }
}

export async function getUserTrades(userId: string, period: Period): Promise<Trade[]> {
  const since = periodStart(period);
  if (since) {
    return db.select().from(trades)
      .where(and(eq(trades.userId, userId), gte(trades.createdAt, since)))
      .orderBy(desc(trades.createdAt));
  }
  return db.select().from(trades)
    .where(eq(trades.userId, userId))
    .orderBy(desc(trades.createdAt));
}

function computeSharpe(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (dailyReturns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(252);
}

function computeMaxDrawdown(equityCurve: EquityPoint[]): number {
  let peak = -Infinity;
  let maxDD = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = (p.equity - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    }
  }
  return maxDD; // 負數
}

export function computePerformance(rawTrades: Trade[], startingEquity = 10_000_000): PerformanceResult {
  const sorted = [...rawTrades].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // 依日彙總 PnL
  const dailyMap = new Map<string, number>();
  for (const t of sorted) {
    const day = (t.date && /\d{4}-\d{2}-\d{2}/.test(t.date)) ? t.date : new Date(t.createdAt).toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + Number(t.pnl ?? 0));
  }

  const equityCurve: EquityPoint[] = [];
  let equity = startingEquity;
  const dailyReturns: number[] = [];
  for (const [date, pnl] of [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const startEquity = equity;
    equity += pnl;
    equityCurve.push({ date, equity, pnl });
    if (startEquity > 0) dailyReturns.push(pnl / startEquity);
  }

  const drawdownCurve: { date: string; drawdown: number }[] = [];
  let peak = startingEquity;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    drawdownCurve.push({ date: p.date, drawdown: peak === 0 ? 0 : (p.equity - peak) / peak });
  }

  const totalTrades = sorted.length;
  const wins = sorted.filter(t => Number(t.pnl ?? 0) > 0);
  const losses = sorted.filter(t => Number(t.pnl ?? 0) < 0);
  const totalPnL = sorted.reduce((acc, t) => acc + Number(t.pnl ?? 0), 0);
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const grossWin = wins.reduce((acc, t) => acc + Number(t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + Number(t.pnl ?? 0), 0));
  const profitFactor = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss;

  const sharpe = computeSharpe(dailyReturns);
  const maxDrawdown = computeMaxDrawdown(equityCurve);

  const bestTrade = sorted.reduce<{ ticker: string; pnl: number } | null>((best, t) => {
    const pnl = Number(t.pnl ?? 0);
    if (!best || pnl > best.pnl) return { ticker: t.ticker, pnl };
    return best;
  }, null);
  const worstTrade = sorted.reduce<{ ticker: string; pnl: number } | null>((worst, t) => {
    const pnl = Number(t.pnl ?? 0);
    if (!worst || pnl < worst.pnl) return { ticker: t.ticker, pnl };
    return worst;
  }, null);

  // 策略歸因：用 broker / orderType 欄位假設不存在策略名稱時退回 'mixed'
  const attribution: Record<string, { pnl: number; trades: number; winRate: number; _wins: number }> = {};
  for (const t of sorted) {
    const key = (t.notes && t.notes.match(/strategy:(\w+)/)?.[1]) || (t.aiGenerated ? 'AI_LLM' : 'manual');
    if (!attribution[key]) attribution[key] = { pnl: 0, trades: 0, winRate: 0, _wins: 0 };
    attribution[key].pnl += Number(t.pnl ?? 0);
    attribution[key].trades += 1;
    if (Number(t.pnl ?? 0) > 0) attribution[key]._wins += 1;
  }
  const attributionOut: Record<string, { pnl: number; trades: number; winRate: number }> = {};
  for (const [k, v] of Object.entries(attribution)) {
    attributionOut[k] = { pnl: v.pnl, trades: v.trades, winRate: v.trades ? (v._wins / v.trades) * 100 : 0 };
  }

  return {
    metrics: {
      totalTrades,
      winRate: Math.round(winRate * 10) / 10,
      totalPnL: Math.round(totalPnL),
      avgPnL: totalTrades > 0 ? Math.round(totalPnL / totalTrades) : 0,
      sharpe: Math.round(sharpe * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
      profitFactor: Number.isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : profitFactor,
      bestTrade,
      worstTrade,
    },
    equityCurve,
    drawdownCurve,
    attribution: attributionOut,
  };
}

export async function getPerformance(userId: string, period: Period = 'all', startingEquity = 10_000_000): Promise<PerformanceResult> {
  const userTrades = await getUserTrades(userId, period);
  return computePerformance(userTrades, startingEquity);
}
