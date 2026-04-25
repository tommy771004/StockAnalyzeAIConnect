import { useCallback, useEffect, useState, startTransition } from 'react';
import { ViewTransition } from 'react';
import type { TerminalView } from './terminal/types';
import { Layout } from './terminal/shell/Layout';
import { DashboardPage } from './terminal/pages/Dashboard';
import { PortfolioPage } from './terminal/pages/Portfolio';
import { NewsPage } from './terminal/pages/News';
import { ResearchPage } from './terminal/pages/Research';
import { MarketPage } from './terminal/pages/Market';
import { CryptoPage } from './terminal/pages/Crypto';
import { SettingsPage } from './terminal/pages/Settings';
import { AlertsPage } from './terminal/pages/Alerts';
import { ScreenerPage } from './terminal/pages/Screener';
import { BacktestTerminalPage } from './terminal/pages/Backtest';
import { AutoTradingPage } from './terminal/pages/AutoTrading';
import { LoginPage } from './terminal/pages/Login';
import { useAuth } from './contexts/AuthContext';
import { SEO } from './components/SEO';
import { useTranslation } from 'react-i18next';

const VALID_VIEWS: readonly TerminalView[] = [
  'dashboard',
  'market',
  'crypto',
  'portfolio',
  'research',
  'backtest',
  'news',
  'alerts',
  'screener',
  'autotrading',
  'settings'
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
  backtest: 'BACKTEST...',
  news: '搜尋 . . .',
  alerts: 'SEARCH ALERTS...',
  screener: 'SEARCH SCREENER...',
  autotrading: 'SEARCH BOT LOGS...',
  settings: 'SEARCH SETTINGS...',
};

export default function App() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const [view, setView] = useState<TerminalView>(() => parseHashView());

  useEffect(() => {
    window.location.hash = view;
  }, [view]);

  useEffect(() => {
    const onHash = () => startTransition(() => setView(parseHashView()));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const handleChange = useCallback((next: TerminalView) => startTransition(() => setView(next)), []);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-(--color-term-bg)">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-(--color-term-accent) border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SEO title={t('nav.login', 'Login')} path="/#login" />
        <LoginPage />
      </>
    );
  }

  return (
    <>
      <SEO title={t(`nav.${view}`, view.toUpperCase())} path={`/#${view}`} />
      <Layout active={view} onChange={handleChange} searchPlaceholder={SEARCH_PLACEHOLDER[view]}>
        <ViewTransition default="none" enter="fade-in" exit="fade-out">
          <div className="h-full w-full">
            {view === 'dashboard' && <DashboardPage />}
            {view === 'market' && <MarketPage />}
            {view === 'crypto' && <CryptoPage />}
            {view === 'portfolio' && <PortfolioPage />}
            {view === 'research' && <ResearchPage />}
            {view === 'backtest' && <BacktestTerminalPage />}
            {view === 'news' && <NewsPage />}
            {view === 'settings' && <SettingsPage />}
            {view === 'alerts' && <AlertsPage />}
            {view === 'screener' && <ScreenerPage onNavigate={handleChange} />}
            {view === 'autotrading' && <AutoTradingPage />}
          </div>
        </ViewTransition>
      </Layout>
    </>
  );
}
