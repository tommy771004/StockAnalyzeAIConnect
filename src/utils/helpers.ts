import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function safeCn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeN(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) return parsed;
  }
  return fallback;
}

export function vibrate(pattern: number | number[] = 50) {
  if (typeof window !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // ignore
    }
  }
}

export function isTW(symbol: string): boolean {
  if (!symbol) return false;
  const clean = symbol.split('.')[0] || '';
  return /^\d{4,5}$/.test(clean);
}
