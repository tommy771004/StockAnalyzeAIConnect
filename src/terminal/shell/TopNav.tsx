import React, { useState, useRef, useEffect } from 'react';
import { Bell, CircleUserRound, Search, BrainCircuit, Menu, Target, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
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
  { id: 'smartmoney', label: 'smartmoney' },
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
  searchPlaceholder,
  onToggleAgent,
  onToggleSidebar,
}: TopNavProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [searchFocused, setSearchFocused] = useState(false);
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
    if (i18n.language.startsWith('zh')) {
      return r.chineseName || r.shortname || r.longname || r.symbol;
    }
    return r.shortname || r.longname || r.chineseName || r.symbol;
  }

  return (
    <header
      className="flex h-16 items-center gap-3 border-b border-(--color-term-border) bg-(--color-term-bg)/95 px-3 md:px-4 shrink-0 relative electron-drag"
      style={{
        WebkitAppRegion: 'drag',
        background: 'linear-gradient(180deg, rgba(8,11,16,0.98) 0%, rgba(14,20,32,0.95) 100%)',
        boxShadow: 'inset 0 -1px 0 rgba(245,158,11,0.08)',
      } as React.CSSProperties}
    >
      {/* Mobile: Hamburger */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="flex md:hidden h-9 w-9 items-center justify-center rounded-md text-(--color-term-muted) hover:text-(--color-term-accent) hover:bg-(--color-term-accent)/8 motion-safe:transition-all focus-ring"
        aria-label={t('topnav.toggleSidebar', 'Toggle sidebar')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Logo — amber→cyan gradient */}
      <a
        className="shrink-0 relative group"
        href="#"
        onClick={(e) => { e.preventDefault(); onChange('dashboard'); }}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span
          className="font-sans text-[15px] md:text-[16px] font-extrabold tracking-[0.18em] select-none"
          style={{
            background: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 40%, #22d3ee 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.35))',
          }}
        >
          Stock AI Connect
        </span>
        {/* Underline on hover */}
        <span className="absolute -bottom-0.5 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ background: 'linear-gradient(90deg, #f59e0b, #22d3ee)' }}
        />
      </a>

      {/* Desktop tab nav */}
      <nav className="hidden md:flex h-full items-end gap-0.5 ml-3">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                'focus-ring relative h-full px-3 pt-4 pb-2.5 text-[11.5px] tracking-wider motion-safe:transition-all whitespace-nowrap font-medium',
                isActive
                  ? 'text-(--color-term-accent)'
                  : 'text-(--color-term-text)/50 hover:text-(--color-term-text)/80',
              )}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {tab.id === 'screener' && (
                <Target className="inline h-3 w-3 mr-1 -mt-0.5" />
              )}
              {t(`nav.${tab.id}`)}
              {isActive && (
                <>
                  {/* Animated bottom indicator */}
                  <motion.span
                    layoutId="topnav-indicator"
                    className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                    style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                  {/* Subtle glow under active tab */}
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-6 pointer-events-none"
                    style={{
                      background: 'radial-gradient(ellipse at bottom, rgba(245,158,11,0.14) 0%, transparent 70%)',
                    }}
                  />
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Right-side actions */}
      <div className="ml-auto flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Desktop search with autocomplete — glass style */}
        <div
          ref={searchRef}
          className="relative hidden lg:block"
        >
          <Search
            className={cn(
              'pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 z-10 transition-colors duration-200',
              searchFocused ? 'text-(--color-term-accent)' : 'text-(--color-term-muted)',
            )}
          />
          <input
            id="topnav-search-input"
            ref={inputRef}
            type="search"
            aria-label={searchPlaceholder ?? t('topnav.search', 'SEARCH...')}
            value={query}
            onChange={e => { setQuery(e.target.value); if (e.target.value.trim()) setShowDropdown(true); }}
            onKeyDown={handleKeyDown}
            onFocus={() => { setSearchFocused(true); if (query.trim()) setShowDropdown(true); }}
            onBlur={() => setSearchFocused(false)}
            className="h-8 w-44 xl:w-60 border bg-(--color-term-surface)/80 pl-8 pr-7 text-[12px] tracking-wider text-(--color-term-text) placeholder:text-(--color-term-muted)/60 focus:outline-none transition-all duration-200 rounded-sm"
            style={{
              borderColor: searchFocused ? 'rgba(245,158,11,0.6)' : 'var(--color-term-border)',
              boxShadow: searchFocused ? '0 0 0 2px rgba(245,158,11,0.12), 0 0 12px rgba(245,158,11,0.08)' : 'none',
            }}
            placeholder={searchPlaceholder ?? t('topnav.search', 'SEARCH...')}
            autoComplete="off"
            spellCheck={false}
          />
          {/* Clear button */}
          {query && !isSearching && (
            <button
              type="button"
              onClick={() => { setQuery(''); setShowDropdown(false); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-(--color-term-muted) hover:text-(--color-term-text) motion-safe:transition-colors focus-ring rounded"
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
              className="absolute top-full right-0 mt-1.5 w-72 border border-(--color-term-border-strong) shadow-2xl z-[9999] overflow-hidden rounded-sm"
              style={{
                background: 'linear-gradient(180deg, rgba(14,20,32,0.98) 0%, rgba(12,16,24,0.99) 100%)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,158,11,0.08)',
              }}
            >
              {results.map((r, idx) => (
                <button
                  key={r.symbol}
                  type="button"
                  id={`search-result-${idx}`}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    idx === activeIdx
                      ? 'bg-(--color-term-accent)/12 text-(--color-term-text)'
                      : 'hover:bg-white/5 text-(--color-term-text)/80',
                  )}
                  onMouseDown={e => { e.preventDefault(); selectResult(r); }}
                >
                  {/* Symbol badge */}
                  <span
                    className="font-mono text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-sm border border-(--color-term-accent)/35 text-(--color-term-accent) shrink-0 text-center"
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
              <div className="border-t border-(--color-term-border) px-3 py-1.5 flex items-center gap-1.5 text-(--color-term-muted) text-[10px] bg-(--color-term-surface)/50">
                <kbd className="px-1 border border-(--color-term-border-strong) rounded text-[9px]">↑↓</kbd>
                <span>{t('symbolSearch.keyboardSelect', 'Select')}</span>
                <kbd className="px-1 border border-(--color-term-border-strong) rounded text-[9px] ml-1">Enter</kbd>
                <span>{t('symbolSearch.keyboardConfirm', 'Confirm')}</span>
                <kbd className="px-1 border border-(--color-term-border-strong) rounded text-[9px] ml-1">Esc</kbd>
                <span>{t('symbolSearch.keyboardClose', 'Close')}</span>
              </div>
            </div>
          )}

          {/* No results */}
          {showDropdown && searched && !isSearching && query && results.length === 0 && (
            <div
              className="absolute top-full right-0 mt-1.5 w-64 border border-(--color-term-border) shadow-xl z-[9999] px-3 py-4 text-center text-(--color-term-muted) text-[12px] rounded-sm"
              style={{ background: 'rgba(14,20,32,0.98)', backdropFilter: 'blur(12px)' }}
            >
              {t('symbolSearch.noResults', { query, defaultValue: 'No matches for "{{query}}"' })}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="hidden lg:block h-5 w-px bg-(--color-term-border-strong)/60 mx-0.5" />

        {/* Language toggle */}
        <IconButton onClick={toggleLanguage} title={t('settings.language', 'Language')}>
          <span className="font-bold text-[10px] font-sans">{i18n.language.startsWith('zh') ? 'EN' : '中'}</span>
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
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 pulse-glow-green border border-(--color-term-bg)"
            style={{ '--glow-color': '#f43f5e' } as React.CSSProperties}
          />
        </IconButton>

        {/* Settings / account */}
        <button
          onClick={() => onChange('settings')}
          className={cn(
            'focus-ring hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-sm border motion-safe:transition-all group text-[11px] font-medium tracking-wide',
            active === 'settings'
              ? 'border-(--color-term-accent)/60 text-(--color-term-accent) bg-(--color-term-accent)/8'
              : 'border-(--color-term-border) text-(--color-term-muted) hover:border-(--color-term-accent)/40 hover:text-(--color-term-accent)',
          )}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title={t('settings.title')}
        >
          <CircleUserRound className="h-4 w-4 group-hover:scale-110 transition-transform" />
          <span className="hidden xl:block">{t('topnav.settings')}</span>
        </button>

        {/* Electron Window Controls */}
        {typeof window !== 'undefined' && window.api?.isElectron && (
          <div className="flex items-center gap-1 ml-1.5 border-l border-(--color-term-border) pl-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button type="button" aria-label={t('window.minimize', 'Minimize')} onClick={() => window.api?.minimize()} className="p-1.5 hover:text-white transition-colors text-zinc-500 hover:bg-white/5 rounded-sm">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6"></rect></svg>
            </button>
            <button type="button" aria-label={t('window.maximize', 'Maximize')} onClick={() => window.api?.maximize()} className="p-1.5 hover:text-white transition-colors text-zinc-500 hover:bg-white/5 rounded-sm">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><rect width="9" height="9" x="1.5" y="1.5" fill="none" stroke="currentColor"></rect></svg>
            </button>
            <button type="button" aria-label={t('window.close', 'Close')} onClick={() => window.api?.close()} className="p-1.5 hover:bg-red-500 hover:text-white transition-colors text-zinc-500 rounded-sm">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><polygon fill="currentColor" fillRule="evenodd" points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"></polygon></svg>
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
        'focus-ring flex h-8 w-8 items-center justify-center rounded-md border border-(--color-term-border) text-(--color-term-muted) hover:border-(--color-term-accent)/50 hover:text-(--color-term-accent) hover:bg-(--color-term-accent)/8 motion-safe:transition-all',
        className,
      )}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {children}
    </button>
  );
}
