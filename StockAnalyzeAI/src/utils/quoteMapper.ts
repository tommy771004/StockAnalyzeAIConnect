/**
 * quoteMapper.ts — Domain mapper for Yahoo Finance Quote API
 *
 * Isolates raw API field names (regularMarketPrice, shortName, etc.)
 * from the rest of the UI. All components should use QuoteDomain
 * instead of accessing Quote raw fields directly.
 *
 * If the data source changes (Bloomberg, TWSE, etc.), only this file
 * needs to be updated.
 */
import type { Quote } from '../types';

/** Semantic domain model used throughout the UI */
export interface QuoteDomain {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  high?: number;
  low?: number;
  currency?: string;
  pe?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

/** Map a raw Yahoo Finance Quote to a UI-friendly QuoteDomain */
export function mapQuote(raw: Partial<Quote>): QuoteDomain {
  return {
    symbol:          raw.symbol ?? '',
    name:            raw.shortName ?? raw.longName ?? raw.symbol ?? '',
    price:           raw.regularMarketPrice ?? 0,
    change:          raw.regularMarketChange ?? 0,
    changePct:       raw.regularMarketChangePercent ?? 0,
    volume:          raw.regularMarketVolume ?? 0,
    high:            raw.regularMarketDayHigh,
    low:             raw.regularMarketDayLow,
    currency:        raw.currency,
    pe:              raw.trailingPE,
    marketCap:       raw.marketCap,
    fiftyTwoWeekHigh: raw.fiftyTwoWeekHigh,
    fiftyTwoWeekLow:  raw.fiftyTwoWeekLow,
  };
}

/** Map an array of raw quotes */
export function mapQuotes(raws: Partial<Quote>[]): QuoteDomain[] {
  return raws.map(mapQuote);
}
