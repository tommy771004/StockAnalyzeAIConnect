import { describe, expect, it } from 'vitest';
import market from '../Market.tsx?raw';
import portfolio from '../Portfolio.tsx?raw';
import dashboard from '../Dashboard.tsx?raw';
import news from '../News.tsx?raw';
import strategyTab from '../../../components/AutoTrading/StrategyTab.tsx?raw';
import backtestHeader from '../../../components/backtest/BacktestHeaderSection.tsx?raw';
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
});
