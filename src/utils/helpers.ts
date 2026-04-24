/**
 * src/utils/helpers.ts
 *
 * Small UI-side utilities shared across components. Restored here because
 * several components (TradeLogger, TradingCore, BacktestPanel, PriceBar,
 * etc.) import from this path. The tree was previously build-passing only
 * because those components were orphaned from the active shell; reintroducing
 * BacktestPage into the terminal route re-reachable makes the missing file
 * fail the bundle.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Null-safe tailwind class merger. Alias of `lib/utils#cn`. */
export function safeCn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Coerce an unknown value to a fixed-digit numeric string, or '---' if it
 * isn't finite. Keeps call sites like `{safeN(price)}` terse.
 */
export function safeN(value: unknown, digits = 2): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '---';
  return n.toFixed(digits);
}

/** Thin wrapper over `navigator.vibrate`; no-op on unsupported platforms. */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined') return;
  const fn = (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate;
  if (typeof fn !== 'function') return;
  try {
    fn.call(navigator, pattern);
  } catch {
    /* silently ignore — vibration is best-effort */
  }
}

/** Heuristic for Taiwan-listed symbols (Yahoo suffix or pure 4-5 digit code). */
export function isTW(symbol: string | null | undefined): boolean {
  if (!symbol) return false;
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.TW') || upper.endsWith('.TWO')) return true;
  return /^\d{4,5}$/.test(upper);
}
