import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '../types';
import { searchStockSymbols } from '../utils/stockSymbolLookup';

interface UseStockSymbolSearchOptions {
  enabled?: boolean;
  minLength?: number;
  debounceMs?: number;
  limit?: number;
}

export function useStockSymbolSearch(
  query: string,
  options: UseStockSymbolSearchOptions = {},
) {
  const {
    enabled = true,
    minLength = 1,
    debounceMs = 220,
    limit = 10,
  } = options;

  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setResults([]);
      setIsSearching(false);
      setSearched(false);
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < minLength) {
      setResults([]);
      setIsSearching(false);
      setSearched(false);
      return;
    }

    const runId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const next = await searchStockSymbols(trimmed, limit);
        if (runId !== requestIdRef.current) return;
        setResults(next);
        setSearched(true);
      } catch {
        if (runId !== requestIdRef.current) return;
        setResults([]);
        setSearched(true);
      } finally {
        if (runId === requestIdRef.current) setIsSearching(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [debounceMs, enabled, limit, minLength, query]);

  return {
    results,
    isSearching,
    searched,
  };
}

