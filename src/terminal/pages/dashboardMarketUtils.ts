import type { Best5Level } from '../../services/api';

/** Aggregate bid/ask sizes into buy/sell percentage shares (rounded, sums to 100). */
export function summarizeDepth(
  asks: Best5Level[],
  bids: Best5Level[],
): { buyPct: number; sellPct: number } {
  const bidSum = bids.reduce((s, l) => s + l.size, 0);
  const askSum = asks.reduce((s, l) => s + l.size, 0);
  const total = bidSum + askSum;
  if (total <= 0) return { buyPct: 50, sellPct: 50 };
  const buyPct = Math.round((bidSum / total) * 100);
  return { buyPct, sellPct: 100 - buyPct };
}

/**
 * Background class for a sector cell.
 * `invert=false` (US): up→green, down→red. `invert=true` (TW 台股慣例): up→red, down→green.
 */
export function sectorHeatClass(changePct: number, invert: boolean): string {
  if (!Number.isFinite(changePct) || changePct === 0) return 'bg-zinc-700/40';
  const strong = Math.abs(changePct) > 1;
  const red = strong ? 'bg-rose-700/70' : 'bg-rose-800/60';
  const green = strong ? 'bg-emerald-700/70' : 'bg-emerald-800/60';
  const upColor = invert ? red : green;
  const downColor = invert ? green : red;
  return changePct > 0 ? upColor : downColor;
}
