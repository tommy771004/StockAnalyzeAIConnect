import { searchStocks } from '../services/api';
import type { SearchResult } from '../types';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 200;

type CacheEntry = {
  expiresAt: number;
  data: SearchResult[];
};

const searchCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<SearchResult[]>>();

function normalizeQuery(query: string): string {
  return query.trim();
}

function toUpperAscii(input: string): string {
  return input.replace(/[a-z]+/gi, (part) => part.toUpperCase());
}

function trimSuffix(symbol: string): string {
  return symbol.toUpperCase().replace(/\.(TW|TWO)$/i, '');
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const item of results) {
    const symbol = item.symbol?.trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    merged.push({ ...item, symbol });
  }
  return merged;
}

function scoreResult(result: SearchResult, rawQuery: string): number {
  const query = rawQuery.trim();
  const qLower = query.toLowerCase();
  const qUpper = toUpperAscii(query);
  const symbol = result.symbol.toUpperCase();
  const symbolBase = trimSuffix(symbol);
  const shortName = (result.shortname ?? '').toLowerCase();
  const longName = (result.longname ?? '').toLowerCase();
  const chineseName = result.chineseName ?? '';
  const isTwCode = /^\d{4}$/.test(qUpper);
  const queryIsTickerLike = /^[A-Z0-9.\-:=/]+$/.test(qUpper);

  let score = 0;

  if (symbol === qUpper || symbolBase === qUpper) score += 1000;
  if (symbol.startsWith(qUpper) || symbolBase.startsWith(qUpper)) score += 850;
  if (symbol.includes(qUpper) || symbolBase.includes(qUpper)) score += 650;

  if (shortName.startsWith(qLower) || longName.startsWith(qLower)) score += 520;
  if (shortName.includes(qLower) || longName.includes(qLower)) score += 420;

  if (chineseName.startsWith(query)) score += 560;
  if (chineseName.includes(query)) score += 460;

  if (isTwCode && symbolBase === qUpper) score += 220;
  if (isTwCode && /\.(TW|TWO)$/i.test(symbol)) score += 60;

  if (!queryIsTickerLike && (shortName || longName || chineseName)) score += 20;

  return score;
}

function sortResults(results: SearchResult[], query: string, limit: number): SearchResult[] {
  return [...results]
    .sort((a, b) => {
      const scoreDiff = scoreResult(b, query) - scoreResult(a, query);
      if (scoreDiff !== 0) return scoreDiff;
      return a.symbol.localeCompare(b.symbol);
    })
    .slice(0, limit);
}

function readCache(key: string): SearchResult[] | null {
  const cached = searchCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return cached.data;
}

function writeCache(key: string, data: SearchResult[]): void {
  if (searchCache.size >= CACHE_LIMIT) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
  searchCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  });
}

export async function searchStockSymbols(query: string, limit = 10): Promise<SearchResult[]> {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const key = `${normalized.toLowerCase()}::${limit}`;
  const cached = readCache(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const payload = await searchStocks(normalized);
    const base = dedupeResults(payload?.quotes ?? []);
    const ranked = sortResults(base, normalized, limit);
    writeCache(key, ranked);
    return ranked;
  })().finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}

export function normalizeSymbolInput(input: string): string {
  return toUpperAscii(input.trim());
}

export function resolveSymbolFromInput(input: string, results: SearchResult[]): string {
  const raw = input.trim();
  if (!raw) return '';

  const normalized = normalizeSymbolInput(raw);
  const normalizedBase = trimSuffix(normalized);

  const exact = results.find((item) => {
    const symbol = item.symbol.toUpperCase();
    return symbol === normalized || trimSuffix(symbol) === normalizedBase;
  });
  if (exact) return exact.symbol.toUpperCase();

  const tickerLike = /^[A-Z0-9.\-:=/]+$/.test(normalized);
  if (!tickerLike && results.length > 0) return results[0].symbol.toUpperCase();

  return normalized;
}

export async function resolveSymbolWithLookup(
  input: string,
  prefetchedResults: SearchResult[] = [],
): Promise<string> {
  const initial = resolveSymbolFromInput(input, prefetchedResults);
  if (!initial) return '';

  const tickerLike = /^[A-Z0-9.\-:=/]+$/.test(initial);
  if (tickerLike) return initial;

  try {
    const fuzzy = await searchStockSymbols(input, 1);
    if (fuzzy[0]?.symbol) return normalizeSymbolInput(fuzzy[0].symbol);
  } catch {
    // ignore and keep fallback
  }

  return normalizeSymbolInput(initial);
}
