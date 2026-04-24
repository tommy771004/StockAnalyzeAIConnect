import { useCallback, useEffect, useState } from 'react';
import type { TerminalView } from './terminal/types';
import { Layout } from './terminal/shell/Layout';
import { DashboardPage } from './terminal/pages/Dashboard';
import { PortfolioPage } from './terminal/pages/Portfolio';
import { NewsPage } from './terminal/pages/News';
import { ResearchPage } from './terminal/pages/Research';
import { MarketPage } from './terminal/pages/Market';
import { CryptoPage } from './terminal/pages/Crypto';

const VALID_VIEWS: readonly TerminalView[] = [
  'dashboard',
  'market',
  'crypto',
  'portfolio',
  'research',
  'news',
];

function parseHashView(): TerminalView {
  const raw = window.location.hash.replace('#', '').trim();
  if ((VALID_VIEWS as readonly string[]).includes(raw)) {
    return raw as TerminalView;
  }
  return 'dashboard';
}

const SEARCH_PLACEHOLDER: Record<TerminalView, string> = {
  dashboard: 'SEARCH...',
  market: 'SEARCH MARKETS...',
  crypto: 'SEARCH COINS...',
  portfolio: 'SEARCH HOLDINGS...',
  research: 'Search AAPL...',
  news: '搜尋 . . .',
};

export default function App() {
  const [view, setView] = useState<TerminalView>(() => parseHashView());

  useEffect(() => {
    window.location.hash = view;
  }, [view]);

  useEffect(() => {
    const onHash = () => setView(parseHashView());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const handleChange = useCallback((next: TerminalView) => setView(next), []);

  return (
    <Layout active={view} onChange={handleChange} searchPlaceholder={SEARCH_PLACEHOLDER[view]}>
      {view === 'dashboard' && <DashboardPage />}
      {view === 'market' && <MarketPage />}
      {view === 'crypto' && <CryptoPage />}
      {view === 'portfolio' && <PortfolioPage />}
      {view === 'research' && <ResearchPage />}
      {view === 'news' && <NewsPage />}
    </Layout>
  );
}
