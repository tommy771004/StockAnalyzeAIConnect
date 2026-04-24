import React, { useState, type ReactNode } from 'react';
import type { TerminalView } from '../types';
import { TopNav } from './TopNav';
import { TickerTape } from './TickerTape';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { AgentPanel } from './AgentPanel';
import { useMarketData, TICKER_LABEL_MAP } from '../hooks/useMarketData';
import { BarChart3, Bell, LayoutDashboard, Target, Globe } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LayoutProps {
  active: TerminalView;
  onChange: (view: TerminalView) => void;
  searchPlaceholder?: string;
  children: ReactNode;
}

/** Bottom nav items shown on mobile only (most-used views) */
const BOTTOM_NAV: Array<{ id: TerminalView; icon: React.ReactNode; label: string }> = [
  { id: 'dashboard', icon: <LayoutDashboard className="h-5 w-5" />, label: '儀表板' },
  { id: 'market',    icon: <Globe className="h-5 w-5" />,            label: '市場' },
  { id: 'screener',  icon: <Target className="h-5 w-5" />,           label: '選股' },
  { id: 'portfolio', icon: <BarChart3 className="h-5 w-5" />,        label: '持倉' },
  { id: 'alerts',    icon: <Bell className="h-5 w-5" />,             label: '預警' },
];

export function Layout({ active, onChange, searchPlaceholder, children }: LayoutProps) {
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleAgent = () => setIsAgentOpen((prev) => !prev);
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  const { tickerQuotes } = useMarketData();

  const tickerItems = tickerQuotes.map((q: any) => ({
    symbol: q.symbol,
    label: TICKER_LABEL_MAP[q.symbol] ?? q.symbol.replace(/[\^=].*$/, '').replace('-USD', ''),
    value: q.regularMarketPrice != null
      ? q.regularMarketPrice >= 1000
        ? q.regularMarketPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })
        : q.regularMarketPrice >= 1
        ? q.regularMarketPrice.toFixed(2)
        : q.regularMarketPrice.toFixed(4)
      : '---',
    changePct: q.regularMarketChangePercent ?? 0,
  }));

  const handleTickerSelect = (symbol: string) => {
    window.dispatchEvent(new CustomEvent('symbol-search', { detail: symbol }));
    onChange('research');
  };

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
            : [{ symbol: '', label: 'MARKET', value: 'LOADING...', changePct: 0 }]
        }
        onSelect={handleTickerSelect}
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
      <Footer />

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden border-t border-(--color-term-border) bg-(--color-term-bg)"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {BOTTOM_NAV.map((item) => {
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
              <span>{item.label}</span>
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
