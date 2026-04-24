/**
 * src/terminal/pages/Screener.tsx
 * Terminal wrapper for the StockScreener component.
 * Integrates XQ-style screener into the terminal nav with symbol-to-research routing.
 */
import React, { useCallback } from 'react';
import type { TerminalView } from '../types';
import StockScreener from '../../components/StockScreener';

interface ScreenerPageProps {
  onNavigate: (view: TerminalView) => void;
}

export function ScreenerPage({ onNavigate }: ScreenerPageProps) {
  // When user clicks a screener result → navigate to research and dispatch symbol event
  const handleSelectSymbol = useCallback((sym: string) => {
    // Dispatch custom event so ResearchPage picks up the symbol
    window.dispatchEvent(new CustomEvent('symbol-search', { detail: sym }));
    onNavigate('research');
  }, [onNavigate]);

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      {/* Terminal-style header bar */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-2 border-b"
        style={{
          borderColor: 'var(--color-term-border)',
          background: 'var(--color-term-panel)',
        }}
      >
        <span
          className="text-[10px] font-bold tracking-[0.25em] uppercase"
          style={{ color: 'var(--color-term-muted)' }}
        >
          MODULE
        </span>
        <span
          className="text-[11px] font-bold tracking-[0.2em] uppercase"
          style={{ color: 'var(--color-term-accent)' }}
        >
          STOCK_SCREENER.EXE
        </span>
        <span
          className="ml-auto flex items-center gap-1.5 text-[10px] tracking-widest"
          style={{ color: 'var(--color-term-positive)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full animate-pulse bg-[var(--color-term-positive)]" />
          MULTI-ASSET SCAN READY
        </span>
      </div>

      {/* Screener component in scroll container */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        <StockScreener onSelectSymbol={handleSelectSymbol} />
      </div>
    </div>
  );
}
