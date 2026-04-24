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
