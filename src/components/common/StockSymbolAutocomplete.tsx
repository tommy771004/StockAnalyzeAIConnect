import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { SearchResult } from '../../types';
import { useStockSymbolSearch } from '../../hooks/useStockSymbolSearch';
import { normalizeSymbolInput, resolveSymbolFromInput } from '../../utils/stockSymbolLookup';

interface StockSymbolAutocompleteProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  onSymbolSubmit?: (symbol: string, picked?: SearchResult) => void;
  onSymbolSelect?: (symbol: string, picked: SearchResult) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  dropdownClassName?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  minLength?: number;
  limit?: number;
  debounceMs?: number;
  showSearchIcon?: boolean;
}

function getDisplayName(item: SearchResult): string {
  return item.chineseName || item.shortname || item.longname || item.symbol;
}

export function StockSymbolAutocomplete({
  id,
  value,
  onValueChange,
  onSymbolSubmit,
  onSymbolSelect,
  placeholder,
  className,
  inputClassName,
  inputStyle,
  dropdownClassName,
  disabled,
  autoFocus,
  minLength = 1,
  limit = 10,
  debounceMs = 220,
  showSearchIcon = false,
}: StockSymbolAutocompleteProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const trimmedValue = value.trim();

  const { results, isSearching, searched } = useStockSymbolSearch(value, {
    enabled: !disabled,
    minLength,
    limit,
    debounceMs,
  });

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!results.length) setActiveIdx(-1);
    else if (activeIdx >= results.length) setActiveIdx(results.length - 1);
  }, [activeIdx, open, results.length]);

  const showDropdown = open && trimmedValue.length >= minLength;
  const hasNoResult = showDropdown && searched && !isSearching && results.length === 0;

  const activeItem = useMemo(
    () => (activeIdx >= 0 ? results[activeIdx] : undefined),
    [activeIdx, results],
  );

  const submitRaw = () => {
    const resolved = resolveSymbolFromInput(value, results);
    if (!resolved) return;
    const picked = activeItem;
    onValueChange(resolved);
    onSymbolSubmit?.(resolved, picked);
    setOpen(false);
    setActiveIdx(-1);
  };

  const selectItem = (item: SearchResult) => {
    const symbol = normalizeSymbolInput(item.symbol);
    onValueChange(symbol);
    onSymbolSelect?.(symbol, item);
    onSymbolSubmit?.(symbol, item);
    setOpen(false);
    setActiveIdx(-1);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {showSearchIcon && (
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-(--color-term-muted)" />
      )}
      <input
        id={id}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActiveIdx((prev) => Math.min(prev + 1, results.length - 1));
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIdx((prev) => Math.max(prev - 1, -1));
            return;
          }
          if (event.key === 'Escape') {
            setOpen(false);
            setActiveIdx(-1);
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            if (activeItem) {
              selectItem(activeItem);
              return;
            }
            submitRaw();
          }
        }}
        className={cn(
          'w-full bg-(--color-term-panel) border border-(--color-term-border) text-sm p-2 outline-none focus:border-(--color-term-accent) rounded-sm',
          showSearchIcon && 'pl-10',
          inputClassName,
        )}
        style={inputStyle}
      />

      {showDropdown && (
        <div
          className={cn(
            'absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-sm border border-(--color-term-border) bg-(--color-term-bg) shadow-2xl',
            dropdownClassName,
          )}
        >
          {isSearching && (
            <div className="flex items-center justify-center gap-2 px-3 py-3 text-[11px] text-(--color-term-muted)">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('symbolSearch.searching', 'Searching...')}
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div className="max-h-64 overflow-y-auto">
              {results.map((item, idx) => (
                <button
                  key={`${item.symbol}-${idx}`}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectItem(item);
                  }}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                    idx === activeIdx
                      ? 'bg-(--color-term-accent)/15 text-(--color-term-text)'
                      : 'text-(--color-term-text) hover:bg-(--color-term-surface)',
                  )}
                >
                  <span className="min-w-[70px] font-mono text-[10px] font-bold tracking-wider text-(--color-term-accent)">
                    {item.symbol}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px]">{getDisplayName(item)}</span>
                    {item.exchDisp && (
                      <span className="block truncate text-[10px] text-(--color-term-muted)">
                        {item.exchDisp}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {hasNoResult && (
            <div className="px-3 py-3 text-center text-[11px] text-(--color-term-muted)">
              {t('symbolSearch.noResults', { query: trimmedValue, defaultValue: `No matches for "${trimmedValue}"` })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
