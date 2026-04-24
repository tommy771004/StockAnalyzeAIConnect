import React, { useState, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TerminalView } from '../types';
import { TopNav } from './TopNav';
import { TickerTape } from './TickerTape';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { AgentPanel } from './AgentPanel';
import { useMarketData, TICKER_LABEL_MAP, TICKER_TAPE_SYMBOLS } from '../hooks/useMarketData';
import { BarChart3, Bell, LayoutDashboard, Target, Globe } from 'lucide-react';
import { cn } from '../../lib/utils';

const STORAGE_KEY = 'ticker_tape_custom_symbols';

function getInitialSymbols(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : TICKER_TAPE_SYMBOLS;
  } catch { return TICKER_TAPE_SYMBOLS; }
}

interface LayoutProps {
  active: TerminalView;
  onChange: (view: TerminalView) => void;
  searchPlaceholder?: string;
  children: ReactNode;
}

/** Bottom nav items shown on mobile only (most-used views) */
const BOTTOM_NAV_IDS: Array<{ id: TerminalView; icon: React.ReactNode; labelKey: string }> = [
  { id: 'dashboard', icon: <LayoutDashboard className="h-5 w-5" />, labelKey: 'nav.dashboard' },
  { id: 'market',    icon: <Globe className="h-5 w-5" />,            labelKey: 'nav.market' },
  { id: 'screener',  icon: <Target className="h-5 w-5" />,           labelKey: 'nav.screener' },
  { id: 'portfolio', icon: <BarChart3 className="h-5 w-5" />,        labelKey: 'nav.portfolio' },
  { id: 'alerts',    icon: <Bell className="h-5 w-5" />,             labelKey: 'nav.alerts' },
];

export function Layout({ active, onChange, searchPlaceholder, children }: LayoutProps) {
  const { t } = useTranslation();
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [customSymbols, setCustomSymbols] = useState<string[]>(getInitialSymbols);

  const toggleAgent = () => setIsAgentOpen((prev) => !prev);
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  const { tickerQuotes, changedSymbols, lastUpdated } = useMarketData();

  // Filter quotes to only show the user's selected symbols, in order
  const quoteMap = new Map(tickerQuotes.map((q: any) => [q.symbol, q]));

  const tickerItems = customSymbols
    .filter(sym => quoteMap.has(sym))
    .map(sym => {
      const q: any = quoteMap.get(sym);
      const price: number | null = q?.regularMarketPrice ?? null;
      return {
        symbol: sym,
        label: TICKER_LABEL_MAP[sym] ?? sym.replace(/[=].*$/, '').replace('-USD', ''),
        value: price != null
          ? price >= 1000
            ? price.toLocaleString('en-US', { maximumFractionDigits: 0 })
            : price >= 1
            ? price.toFixed(2)
            : price.toFixed(4)
          : '---',
        changePct: q?.regularMarketChangePercent ?? 0,
        change: q?.regularMarketChange ?? undefined,
      };
    });

  const handleTickerSelect = useCallback((symbol: string) => {
    window.dispatchEvent(new CustomEvent('symbol-search', { detail: symbol }));
    onChange('research');
  }, [onChange]);

  const handleSymbolsChange = useCallback((symbols: string[]) => {
    setCustomSymbols(symbols);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-(--color-term-bg) text-(--color-term-text) overflow-hidden">
      {/* Top navigation */}
      <TopNav
        active={active}
        onChange={onChange}
        searchPlaceholder={searchPlaceholder}
        onToggleAgent={toggleAgent}
        onToggleSidebar={toggleSidebar}
      />

      {/* Scrolling ticker tape */}
      <TickerTape
        items={
          tickerItems.length > 0
            ? tickerItems
            : [{ symbol: '', label: t('market.loading', 'LOADING...'), value: '---', changePct: 0 }]
        }
        onSelect={handleTickerSelect}
        onSymbolsChange={handleSymbolsChange}
        changedSymbols={changedSymbols}
      />

      {/* Main content area */}
      <div className="flex min-h-0 flex-1 relative">
        {/* Sidebar — controls its own mobile drawer state */}
        <Sidebar
          active={active}
          onChange={onChange}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Page content — add bottom padding on mobile to clear bottom nav */}
        <main className="min-h-0 flex-1 overflow-hidden p-3 pb-16 md:pb-3">
          {children}
        </main>

        {/* AI Agent sliding panel */}
        <AgentPanel isOpen={isAgentOpen} onClose={() => setIsAgentOpen(false)} />
      </div>

      {/* Footer — desktop only */}
      <Footer lastUpdated={lastUpdated} />

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden border-t border-(--color-term-border) bg-(--color-term-bg)"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {BOTTOM_NAV_IDS.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] tracking-widest transition-colors',
                isActive
                  ? 'text-(--color-term-accent)'
                  : 'text-(--color-term-muted)',
              )}
            >
              {item.icon}
              <span>{t(item.labelKey)}</span>
              {isActive && (
                <span className="absolute top-0 left-0 right-0 h-[2px] bg-(--color-term-accent)" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
