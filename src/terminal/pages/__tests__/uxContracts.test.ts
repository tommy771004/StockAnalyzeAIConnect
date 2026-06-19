import { describe, expect, it } from 'vitest';
import market from '../Market.tsx?raw';
import portfolio from '../Portfolio.tsx?raw';
import dashboard from '../Dashboard.tsx?raw';
import news from '../News.tsx?raw';
import strategyTab from '../../../components/AutoTrading/StrategyTab.tsx?raw';
import strategyFlow from '../../../components/AutoTrading/StrategyFlowBuilder.tsx?raw';
import backtestHeader from '../../../components/backtest/BacktestHeaderSection.tsx?raw';
import riskControl from '../../../components/AutoTrading/RiskControlPanel.tsx?raw';
import smartMoneySettings from '../../ui/SmartMoneyAlertSettingsPanel.tsx?raw';
import research from '../Research.tsx?raw';
import crypto from '../Crypto.tsx?raw';
import autoTrading from '../AutoTrading.tsx?raw';
import sectorSelector from '../../../components/AutoTrading/SectorSelector.tsx?raw';
import orderBook from '../../../components/AutoTrading/OrderBookPanel.tsx?raw';
import englishRaw from '../../../../public/locales/en/translation.json?raw';
import chineseRaw from '../../../../public/locales/zh/translation.json?raw';

describe('UX accessibility contracts', () => {
  it('uses a keyboard-accessible, overflow-safe market sector card', () => {
    expect(market).toContain('<button');
    expect(market).toContain('type="button"');
    expect(market).toContain("'min-w-0 flex flex-col");
    expect(market).toContain('block w-full truncate');
  });

  it('gives the strategy view toggles accessible names', () => {
    expect(strategyTab).toContain("aria-label={t('autotrading.strategy.showMap'");
    expect(strategyTab).toContain("aria-label={t('autotrading.strategy.showList'");
  });

  it('gives watchlist icon actions accessible names', () => {
    expect(dashboard).toContain("aria-label={t('dashboard.addSymbol'");
    expect(dashboard).toContain("aria-label={t('dashboard.removeSymbol'");
  });

  it('gives portfolio icon actions accessible names and a page heading', () => {
    expect(portfolio).toContain("<h1 className=\"sr-only\">{t('nav.portfolio'");
    expect(portfolio).toContain("aria-label={t('portfolio.editPosition'");
    expect(portfolio).toContain("aria-label={t('portfolio.deletePosition'");
  });

  it('keeps the News page heading hierarchy rooted at the page title', () => {
    expect(news).toContain("<h1 className=\"sr-only\">{t('nav.news'");
    expect(news).toContain('<h2 className="mb-6');
  });

  it('uses readable backtest labels and the requested strategy title', () => {
    const english = JSON.parse(englishRaw);

    expect(backtestHeader).toContain("const labelColor = 'var(--md-on-surface-variant)'");
    expect(english.autotrading.strategy.tacticalConfig).toBe('Stock Trading Strategies');
  });

  it('keeps internal filenames out of Smart Money product copy', () => {
    const english = JSON.parse(englishRaw);
    const chinese = JSON.parse(chineseRaw);

    expect(english.smartMoney.pageSubtitle).not.toContain('Follow.md');
    expect(chinese.smartMoney.pageSubtitle).not.toContain('Follow.md');
  });

  it('programmatically associates configuration labels with their inputs', () => {
    expect(backtestHeader).toContain('htmlFor="backtest-capital"');
    expect(backtestHeader).toContain('id="backtest-capital"');
    expect(backtestHeader).toContain('htmlFor="backtest-start-date"');
    expect(backtestHeader).toContain('id="backtest-start-date"');
    expect(riskControl).toContain('htmlFor={inputId}');
    expect(riskControl).toContain('id={inputId}');
    expect(smartMoneySettings).toContain('htmlFor="smart-money-min-buy"');
    expect(research).toContain("aria-label={t('research.modelLabel'");
  });

  it('makes data rows keyboard operable', () => {
    expect(dashboard).toContain("aria-label={t('dashboard.openSymbol'");
    expect(market).toContain("aria-label={t('market.openIndex'");
    expect(news).toContain("event.key === 'Enter' || event.key === ' '");
    expect(crypto).toContain("aria-label={t('crypto.openAsset'");
  });

  it('contains the crypto table on narrow screens and preserves heading order', () => {
    expect(crypto).toContain('overflow-x-auto');
    expect(crypto).toContain('min-w-[720px]');
    expect(backtestHeader).toContain('<h2 className="text-xs md:text-sm');
    expect(backtestHeader).not.toContain('<h3 className="text-xs md:text-sm');
  });

  it('uses readable functional labels in compact trading controls', () => {
    expect(strategyTab).toContain('text-[11px] font-bold');
    expect(strategyTab).not.toContain('text-[9px] font-bold');
    expect(riskControl).toContain('text-[11px] text-(--color-term-muted) uppercase');
    expect(riskControl).not.toContain('text-[9px] text-(--color-term-muted) uppercase');
  });

  it('gives frequent icon-only actions a 44px touch target', () => {
    expect(strategyTab).toContain('min-h-11 min-w-11');
    expect(smartMoneySettings).toContain('min-h-11 min-w-11');
    expect(dashboard).toContain('min-h-11 min-w-11');
  });

  it('removes sub-11px functional text from strategy and risk panels', () => {
    expect(strategyFlow).not.toContain('text-[8px]');
    expect(strategyFlow).not.toContain('text-[9px]');
    expect(strategyFlow).not.toContain('text-[10px]');
    expect(riskControl).not.toContain('text-[9px]');
    expect(riskControl).not.toContain('text-[10px]');
  });

  it('omits unavailable US realtime and brokerage modules without hiding other US data', () => {
    expect(dashboard).toContain('canShowUsBrokerageSymbol(selectedRow.symbol) &&');
    expect(autoTrading).toContain('.filter(canShowUsBrokerageSymbol)');
    expect(orderBook).toContain('.filter((row) => canShowUsBrokerageSymbol(row.symbol))');
    expect(sectorSelector).toContain('{marketFeatures.usBrokerage && (');
    expect(sectorSelector).toContain("marketBucket === 'TW'");
    expect(dashboard).toContain('<SelectedChartPanel');
    expect(dashboard).toContain('<SmartMoneyRecentEventsPanel');
  });

  it('keeps portfolio allocation visible and signals horizontal holdings overflow', () => {
    expect(portfolio).toContain('<AllocationPanel positions={enrichedPositions} />');
    expect(portfolio).toContain('if (total <= 0)');
    expect(portfolio).toContain('h-24 w-24 lg:h-20 lg:w-20');
    expect(portfolio).toContain('sm:flex-row sm:items-center');
    expect(portfolio).toContain('aria-label={t(\'portfolio.scrollHint\'');
    expect(portfolio).toContain('sm:hidden');
  });
});
