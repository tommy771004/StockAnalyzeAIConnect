import React, { useState, useRef, useEffect } from 'react';
import { Bell, CircleUserRound, Search, BrainCircuit, Menu, Target, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { TerminalView } from '../types';
import type { SearchResult } from '../../types';
import { useStockSymbolSearch } from '../../hooks/useStockSymbolSearch';
import { resolveSymbolWithLookup } from '../../utils/stockSymbolLookup';

interface Tab {
  id: TerminalView;
  label: string;
}

const tabs: Tab[] = [
  { id: 'dashboard', label: 'dashboard' },
  { id: 'market', label: 'market' },
  { id: 'crypto', label: 'crypto' },
  { id: 'portfolio', label: 'portfolio' },
  { id: 'research', label: 'research' },
  { id: 'backtest', label: 'backtest' },
  { id: 'news', label: 'news' },
];

interface TopNavProps {
  active: TerminalView;
  onChange: (view: TerminalView) => void;
  searchPlaceholder?: string;
  onToggleAgent?: () => void;
  onToggleSidebar?: () => void;
}

export function TopNav({
  active,
  onChange,
  searchPlaceholder = 'SEARCH...',
  onToggleAgent,
  onToggleSidebar,
}: TopNavProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isSearching, searched } = useStockSymbolSearch(query, {
    minLength: 1,
    debounceMs: 220,
    limit: 8,
  });

  const toggleLanguage = () => {
    const nextLng = i18n.language.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(nextLng);
  };

  useEffect(() => {
    if (!query.trim()) {
      setShowDropdown(false);
      setActiveIdx(-1);
    }
  }, [query]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function selectResult(result: SearchResult) {
    const sym = result.symbol.toUpperCase();
    window.location.hash = 'dashboard';
    window.dispatchEvent(new CustomEvent('symbol-search', { detail: sym }));
    setQuery('');
    setShowDropdown(false);
    onChange('dashboard');
  }

  async function submitSearch(rawInput: string) {
    if (results.length > 0 && activeIdx >= 0) {
      selectResult(results[activeIdx]);
      return;
    }
    const sym = await resolveSymbolWithLookup(rawInput, results);
    if (!sym) return;
    window.location.hash = 'dashboard';
    window.dispatchEvent(new CustomEvent('symbol-search', { detail: sym }));
    setQuery('');
    setShowDropdown(false);
    onChange('dashboard');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void submitSearch(query);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIdx(-1);
    }
  }

  function getDisplayName(r: SearchResult) {
    return r.chineseName || r.shortname || r.longname || r.symbol;
  }

  return (
    <header
      className="flex h-14 items-center gap-3 border-b border-(--color-term-border) bg-(--color-term-bg) px-3 md:px-5 shrink-0 relative electron-drag"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Mobile: Hamburger */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="flex md:hidden h-8 w-8 items-center justify-center text-(--color-term-muted) hover:text-(--color-term-accent) transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Logo */}
      <a
        className="font-mono text-[15px] md:text-[17px] font-bold tracking-[0.22em] text-(--color-term-accent) shrink-0 relative group"
        href="#"
        onClick={(e) => { e.preventDefault(); onChange('dashboard'); }}
      >
        Stock AI Connect
        <span className="absolute -bottom-0.5 left-0 right-0 h-px bg-(--color-term-accent) opacity-0 group-hover:opacity-60 transition-opacity" />
      </a>

      {/* Desktop tab nav */}
      <nav className="hidden md:flex h-full items-end gap-1 ml-2">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative h-full px-3 pt-4 pb-2 text-[12px] tracking-wider transition-all whitespace-nowrap',
                isActive
                  ? 'text-(--color-term-accent)'
                  : 'text-(--color-term-text)/60 hover:text-(--color-term-text)',
              )}
            >
              {tab.id === 'screener' && (
                <Target className="inline h-3 w-3 mr-1 -mt-0.5" />
              )}
              {t(`nav.${tab.id}`)}
              {isActive && (
                <>
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-(--color-term-accent)" />
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-4 bg-(--color-term-accent)/10 blur-sm pointer-events-none" />
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Right-side actions */}
      <div className="ml-auto flex items-center gap-2">
        {/* Desktop search with autocomplete */}
        <div
          ref={searchRef}
          className="relative hidden lg:block"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--color-term-muted) z-10" />
          <input
            id="topnav-search-input"
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (query.trim()) setShowDropdown(true); }}
            className="h-8 w-48 xl:w-64 border border-(--color-term-border) bg-(--color-term-surface) pl-7 pr-7 text-[12px] tracking-widest text-(--color-term-text) placeholder:text-(--color-term-muted) focus:border-(--color-term-accent) focus:outline-none transition-colors"
            placeholder={searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
          />
          {/* Clear button */}
          {query && !isSearching && (
            <button
              type="button"
              onClick={() => { setQuery(''); setShowDropdown(false); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-(--color-term-muted) hover:text-(--color-term-text) transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          {/* Search spinner */}
          {isSearching && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 border border-(--color-term-accent) border-t-transparent rounded-full animate-spin" />
          )}

          {/* Autocomplete dropdown */}
          {showDropdown && results.length > 0 && (
            <div
              className="absolute top-full right-0 mt-1 w-72 border border-(--color-term-border) bg-(--color-term-bg) shadow-2xl z-[9999] overflow-hidden"
              style={{ backdropFilter: 'blur(12px)' }}
            >
              {results.map((r, idx) => (
                <button
                  key={r.symbol}
                  type="button"
                  id={`search-result-${idx}`}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                    idx === activeIdx
                      ? 'bg-(--color-term-accent)/15 text-(--color-term-text)'
                      : 'hover:bg-(--color-term-surface) text-(--color-term-text)/80',
                  )}
                  onMouseDown={e => { e.preventDefault(); selectResult(r); }}
                >
                  {/* Symbol badge */}
                  <span
                    className="font-mono text-[10px] font-bold tracking-wider px-1.5 py-0.5 border border-(--color-term-accent)/40 text-(--color-term-accent) shrink-0 text-center"
                    style={{ minWidth: '4rem' }}
                  >
                    {r.symbol.replace(/\.(TW|TWO)$/, '')}
                  </span>
                  {/* Name + exchange */}
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-[12px] font-medium truncate">
                      {getDisplayName(r)}
                    </span>
                    {r.exchDisp && (
                      <span className="text-[10px] text-(--color-term-muted) truncate">
                        {r.exchDisp}
                        {r.typeDisp && r.typeDisp !== 'Equity' ? ` · ${r.typeDisp}` : ''}
                      </span>
                    )}
                  </span>
                </button>
              ))}
              {/* Footer keyboard hint */}
              <div className="border-t border-(--color-term-border) px-3 py-1.5 flex items-center gap-1 text-(--color-term-muted) text-[10px]">
                <kbd className="px-1 border border-(--color-term-border) rounded text-[9px]">↑↓</kbd>
                <span>選擇</span>
                <kbd className="px-1 border border-(--color-term-border) rounded text-[9px] ml-1">Enter</kbd>
                <span>確認</span>
                <kbd className="px-1 border border-(--color-term-border) rounded text-[9px] ml-1">Esc</kbd>
                <span>關閉</span>
              </div>
            </div>
          )}

          {/* No results */}
          {showDropdown && searched && !isSearching && query && results.length === 0 && (
            <div className="absolute top-full right-0 mt-1 w-64 border border-(--color-term-border) bg-(--color-term-bg) shadow-xl z-[9999] px-3 py-4 text-center text-(--color-term-muted) text-[12px]">
              {t('symbolSearch.noResults', { query, defaultValue: `找不到「${query}」相關股票` })}
            </div>
          )}
        </div>

        {/* Language toggle */}
        <IconButton onClick={toggleLanguage} title={t('settings.language', 'Language')}>
          <div className="flex items-center justify-center font-bold text-[10px]">
            {i18n.language.startsWith('zh') ? 'EN' : '中'}
          </div>
        </IconButton>

        {/* AI Agent toggle */}
        <IconButton onClick={onToggleAgent} title={t('topnav.aiAgent')}>
          <BrainCircuit className="h-4 w-4" />
        </IconButton>

        {/* Alerts */}
        <IconButton
          onClick={() => onChange('alerts')}
          className="relative"
          title={t('topnav.alerts')}
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse border border-(--color-term-bg)" />
        </IconButton>

        {/* Settings / account */}
        <button
          onClick={() => onChange('settings')}
          className={cn(
            'hidden sm:flex items-center gap-2 px-2 py-1 border border-(--color-term-border) hover:border-(--color-term-accent) hover:text-(--color-term-accent) transition-all group',
            active === 'settings' && 'border-(--color-term-accent) text-(--color-term-accent) bg-(--color-term-accent)/5',
          )}
          style={{ WebkitAppRegion: 'no-drag' } as any}
          title={t('settings.title')}
        >
          <CircleUserRound className="h-4 w-4 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-bold tracking-widest hidden xl:block">{t('topnav.settings')}</span>
        </button>

        {/* Electron Window Controls */}
        {typeof window !== 'undefined' && window.api?.isElectron && (
          <div className="flex items-center gap-1 ml-2 border-l border-(--color-term-border) pl-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button onClick={() => window.api?.minimize()} className="p-1 hover:text-white transition-colors text-zinc-400">
              <svg width="12" height="12" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6"></rect></svg>
            </button>
            <button onClick={() => window.api?.maximize()} className="p-1 hover:text-white transition-colors text-zinc-400">
              <svg width="12" height="12" viewBox="0 0 12 12"><rect width="9" height="9" x="1.5" y="1.5" fill="none" stroke="currentColor"></rect></svg>
            </button>
            <button onClick={() => window.api?.close()} className="p-1 hover:bg-red-500 hover:text-white transition-colors text-zinc-400 rounded-sm">
              <svg width="12" height="12" viewBox="0 0 12 12"><polygon fill="currentColor" fillRule="evenodd" points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"></polygon></svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function IconButton({
  children,
  onClick,
  className,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-8 w-8 items-center justify-center border border-(--color-term-border) text-(--color-term-muted) hover:border-(--color-term-accent) hover:text-(--color-term-accent) transition-all',
        className,
      )}
      style={{ WebkitAppRegion: 'no-drag' } as any}
    >
      {children}
    </button>
  );
}
