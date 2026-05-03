/**
 * src/utils/formatters.ts
 * 
 * Centralized formatting logic for the entire application.
 * Values are formatted based on the user's settings (currency, locale, etc.)
 */

export interface FormattingSettings {
  displayCurrency: string;
  language: string;
}

/**
 * Formats a price based on currency.
 * If currency is TWD, usually no decimals. If USD, 2 decimals.
 */
export function formatPrice(value: number, currency: string = 'USD', locale: string = 'zh-TW'): string {
  if (value == null || !isFinite(value)) return '---';
  
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: currency === 'TWD' ? 0 : 2,
    maximumFractionDigits: currency === 'TWD' ? 1 : 2,
  };

  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Formats a currency value with symbol prefix.
 */
export function formatCurrency(value: number, currency: string = 'USD', locale: string = 'zh-TW'): string {
  if (value == null || !isFinite(value)) return '---';

  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: currency === 'TWD' ? 0 : 2,
    maximumFractionDigits: currency === 'TWD' ? 0 : 2,
  };

  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Formats large volumes into readable strings (e.g., 1.2M, 500K)
 */
export function formatVolume(value: number, locale: string = 'en-US'): string {
  if (value == null || !isFinite(value)) return '---';

  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + 'B';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K';
  
  return value.toLocaleString(locale);
}

/**
 * Formats percentage changes. Includes '+' sign for positive values.
 */
export function formatPercent(value: number, decimals: number = 2): string {
  if (value == null || !isFinite(value)) return '0.00%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Formats raw numbers with consistent decimal points.
 */
export function formatNumber(value: number, decimals: number = 2, locale: string = 'zh-TW'): string {
  if (value == null || !isFinite(value)) return '---';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Safely extracts the YYYY-MM-DD portion from a Date object or date string. */
export function dateOnly(date: Date | string | null | undefined): string {
  if (!date) return '';
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  return String(date).slice(0, 10);
}
