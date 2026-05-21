import { useCallback, startTransition } from 'react';
import { ViewTransition } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import type { TerminalView } from './terminal/types';
import { Layout } from './terminal/shell/Layout';
import { DashboardPage } from './terminal/pages/Dashboard';
import { PortfolioPage } from './terminal/pages/Portfolio';
import { NewsPage } from './terminal/pages/News';
import { ResearchPage } from './terminal/pages/Research';
import { SmartMoneyPage } from './terminal/pages/SmartMoney';
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
  'smartmoney',
  'backtest',
  'news',
  'alerts',
  'screener',
  'autotrading',
  'settings'
];

function parsePathView(pathname: string): TerminalView {
  // Strip leading slash and hash prefix (supports both BrowserRouter and HashRouter)
  const raw = pathname.replace(/^[/#]+/, '').trim();
  if ((VALID_VIEWS as readonly string[]).includes(raw)) {
    return raw as TerminalView;
  }
  return 'dashboard';
}

const DEFAULT_VIEW_DESCRIPTIONS: Record<TerminalView, string> = {
  dashboard:   '即時總覽市場行情、持倉損益、AI 訊號與最新財經新聞。',
  market:      '美股、台股即時報價、K線圖與技術指標分析。',
  crypto:      '比特幣、以太坊等加密貨幣即時價格與趨勢分析。',
  portfolio:   '追蹤你的投資組合損益、持倉分佈與績效報告。',
  research:    '個股深度研究：財務指標、AI 評分、法說會行事曆。',
  smartmoney:  '集中追蹤 13F 新建倉、內部人大額買入、基金 CIK 與 Smart Money 事件流。',
  backtest:    '用歷史數據回測 MA 交叉、RSI、MACD 與 AI 多因子交易策略，產生績效報告。',
  news:        '最新財經新聞、產業動態與市場情緒分析。',
  alerts:      '設定股價到價提醒，即時通知關鍵買賣訊號。',
  screener:    '依 RSI、MACD、成交量比、均線等條件篩選強勢股。',
  autotrading: 'AI 自動化交易系統：多訊號融合、停損止盈、量化策略一鍵執行。',
  settings:    '帳戶設定、API 金鑰管理與通知偏好設定。',
};

const DEFAULT_SEARCH_PLACEHOLDER: Record<TerminalView, string> = {
  dashboard: '搜尋...',
  market: '搜尋市場...',
  crypto: '搜尋幣種...',
  portfolio: '搜尋持倉...',
  research: '搜尋 AAPL...',
  smartmoney: '搜尋標的...',
  backtest: '搜尋回測...',
  news: '搜尋新聞...',
  alerts: '搜尋提醒...',
  screener: '搜尋選股結果...',
  autotrading: '搜尋機器人日誌...',
  settings: '搜尋設定...',
};

export default function App() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const view = parsePathView(location.pathname);
  const viewDescription = t(`app.viewDescription.${view}`, DEFAULT_VIEW_DESCRIPTIONS[view]);
  const searchPlaceholder = t(`app.searchPlaceholder.${view}`, DEFAULT_SEARCH_PLACEHOLDER[view]);

  const handleChange = useCallback(
    (next: TerminalView) => startTransition(() => navigate(`/${next}`)),
    [navigate],
  );

  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-(--color-term-bg)">
        <div className="relative h-10 w-10">
          <span className="absolute inset-0 rounded-full border-2 border-(--color-term-accent)/15" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-(--color-term-accent) animate-spin" />
          <span className="absolute inset-2 rounded-full border border-(--color-term-accent)/10 animate-pulse" />
        </div>
        <span className="text-[10px] tracking-[0.3em] text-(--color-term-muted)/50 font-mono animate-pulse">INITIALIZING</span>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SEO title={t('nav.login', 'Login')} path="/login" />
        <LoginPage />
      </>
    );
  }

  // Redirect bare root to /dashboard
  if (location.pathname === '/' || location.pathname === '') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      <SEO
        title={t(`nav.${view}`, view.toUpperCase())}
        description={viewDescription}
        path={`/${view}`}
      />
      <Layout active={view} onChange={handleChange} searchPlaceholder={searchPlaceholder}>
        <ViewTransition default="none" enter="fade-in" exit="fade-out">
          <div className="h-full w-full">
            {view === 'dashboard' && <DashboardPage />}
            {view === 'market' && <MarketPage />}
            {view === 'crypto' && <CryptoPage />}
            {view === 'portfolio' && <PortfolioPage />}
            {view === 'research' && <ResearchPage />}
            {view === 'smartmoney' && <SmartMoneyPage />}
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
