/**
 * src/store/marketDataStore.ts
 *
 * Global UI state only — NO high-frequency WebSocket ticks here.
 *
 * Rule: skills/01_Frontend_Performance.md §3 "State Stratification"
 * "Zustand (marketDataStore.ts): 僅限用於全局 UI 變數"
 *
 * High-frequency tick data (price updates, order book) lives exclusively in
 * src/workers/socket.worker.ts and is forwarded to components via postMessage /
 * useRef — never touches React state.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light';
export type WidgetId =
  | 'watchlist'
  | 'marketPulse'
  | 'chart'
  | 'news'
  | 'quickTrade'
  | 'topMovers'
  | 'portfolio'
  | 'research';

interface MarketDataState {
  /** Currently selected / focused symbol across all widgets */
  currentSymbol: string;
  /** UI colour scheme */
  themeMode: ThemeMode;
  /** Which widgets are visible in the dashboard grid */
  activeWidgets: WidgetId[];
  /** Whether the Quick Trade panel is expanded */
  quickTradeOpen: boolean;

  // ── Actions ──────────────────────────────────────────────────────────────────
  setCurrentSymbol: (symbol: string) => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleWidget: (id: WidgetId) => void;
  setActiveWidgets: (ids: WidgetId[]) => void;
  setQuickTradeOpen: (open: boolean) => void;
}

export const useMarketDataStore = create<MarketDataState>()(
  persist(
    (set) => ({
      currentSymbol:  'NVDA',
      themeMode:      'dark',
      activeWidgets:  ['watchlist', 'marketPulse', 'chart', 'news', 'quickTrade', 'topMovers'],
      quickTradeOpen: false,

      setCurrentSymbol: (symbol) => set({ currentSymbol: symbol }),
      setThemeMode:     (mode)   => set({ themeMode: mode }),
      setActiveWidgets: (ids)    => set({ activeWidgets: ids }),
      setQuickTradeOpen:(open)   => set({ quickTradeOpen: open }),

      toggleWidget: (id) =>
        set((state) => ({
          activeWidgets: state.activeWidgets.includes(id)
            ? state.activeWidgets.filter((w) => w !== id)
            : [...state.activeWidgets, id],
        })),
    }),
    {
      name: 'ft-market-ui-state',
      // Only persist layout prefs, not ephemeral flags
      partialize: (s) => ({
        currentSymbol:  s.currentSymbol,
        themeMode:      s.themeMode,
        activeWidgets:  s.activeWidgets,
      }),
    },
  ),
);
