export function formatPct(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatNum(value: number, digits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatSignedNum(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNum(value, digits)}`;
}

export function toneFor(value: number): 'positive' | 'negative' | 'flat' {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'flat';
}

export function toneClass(value: number): string {
  if (value > 0) return 'text-(--color-term-positive)';
  if (value < 0) return 'text-(--color-term-negative)';
  return 'text-(--color-term-muted)';
}

/** Returns the CSS variable color string for PnL values (positive=green, negative=red). */
export function pnlColor(value: number): string {
  return value >= 0 ? 'var(--color-down)' : 'var(--color-up)';
}

/** Returns a subtle background color for PnL card/badge use. */
export function pnlBg(value: number): string {
  return value >= 0 ? 'rgba(82,196,26,0.08)' : 'rgba(255,77,79,0.08)';
}
