/**
 * Registry-backed market context for the autonomous trading agent.
 */
import { getDataRegistry } from '../data/configure.js';
import type { DataProviderRegistry } from '../data/registry.js';
import type { DataMarket } from '../data/types.js';

type DataResolver = Pick<DataProviderRegistry, 'resolve'>;

function marketFor(symbol: string): DataMarket {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.TW') || upper.endsWith('.TWO') || /^\d{4,6}$/.test(upper)) {
    return 'tw_stock';
  }
  if (upper.endsWith('-USD') || upper.endsWith('-USDT')) return 'crypto';
  if (upper.endsWith('=X')) return 'forex';
  return 'us_stock';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Fetches symbol-specific news and includes machine-auditable source attribution.
 */
export async function getRecentNews(
  symbol: string,
  limit = 5,
  registry: DataResolver = getDataRegistry(),
): Promise<string> {
  try {
    const envelope = await registry.resolve({
      operation: 'news',
      symbol,
      market: marketFor(symbol),
      params: { limit, scope: 'symbol' },
    });
    const news = Array.isArray(envelope.data) ? envelope.data.slice(0, limit) : [];
    if (!news.length) return '近期無相關重大新聞。';

    const lines = news.map((item) => {
      const entry = record(item);
      const publisher = String(entry.publisher ?? entry.source ?? 'Unknown');
      const title = String(entry.title ?? '').trim();
      return title ? `- [${publisher}] ${title}` : '';
    }).filter(Boolean);
    if (!lines.length) return '近期無相關重大新聞。';
    lines.push(
      `資料來源: ${envelope.provenance.providerId} (${envelope.provenance.marketTimestamp})`,
    );
    return lines.join('\n');
  } catch (error) {
    console.error('[NewsService] Registry error:', error);
    return '新聞獲取失敗。';
  }
}

/**
 * Fetches real Taiwan institutional flow. Missing data is reported, never synthesized.
 */
export async function getInstitutionalFlow(
  symbol: string,
  registry: DataResolver = getDataRegistry(),
): Promise<string> {
  if (marketFor(symbol) !== 'tw_stock') {
    return '非台股標的，暫無三大法人籌碼數據。';
  }

  try {
    const envelope = await registry.resolve({
      operation: 'institutional',
      symbol,
      market: 'tw_stock',
    });
    const flow = record(envelope.data);
    const foreign = Number(flow.foreignNet);
    const investment = Number(flow.trustNet);
    const dealer = Number(flow.dealerNet);
    if (![foreign, investment, dealer].every(Number.isFinite)) {
      throw new Error('Institutional flow fields are unavailable');
    }

    const total = foreign + investment + dealer;
    const trend = total > 5_000 ? '強力買超' : total > 0 ? '偏多' : '偏空';
    const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;

    return [
      '三大法人動向:',
      `- 外資: ${signed(foreign)} 張`,
      `- 投信: ${signed(investment)} 張`,
      `- 自營商: ${signed(dealer)} 張`,
      `- 籌碼總體評價: ${trend}`,
      `- 資料來源: ${envelope.provenance.providerId} (${envelope.provenance.marketTimestamp})`,
    ].join('\n');
  } catch (error) {
    console.warn('[MarketData] Institutional flow unavailable:', error);
    return '三大法人籌碼數據暫時無法取得。';
  }
}

/**
 * Fetches daily technical context, falling back from indicators to a sourced quote.
 */
export async function getDailyContext(
  symbol: string,
  registry: DataResolver = getDataRegistry(),
) {
  const market = marketFor(symbol);
  try {
    const envelope = await registry.resolve({
      operation: 'technical',
      symbol,
      market,
      params: { interval: '1d' },
    });
    const indicators = record(envelope.data);
    const rsi = Number(indicators.RSI ?? 50);
    const ma20 = Number(indicators.MA20 ?? 0);
    const close = Number(indicators.close ?? 0);
    if (![rsi, ma20, close].every(Number.isFinite)) {
      throw new Error('Daily technical fields are unavailable');
    }
    const isBullish = close > ma20;
    return {
      period: 'Daily',
      trend: isBullish ? 'BULLISH (多頭)' : 'BEARISH (空頭)',
      ma20: ma20.toFixed(2),
      rsi: rsi.toFixed(1),
      summary: `日線級別處於${isBullish ? '多頭排列' : '空頭趨勢'}，RSI 目前為 ${rsi.toFixed(1)}。`,
      provenance: envelope.provenance,
    };
  } catch {
    try {
      const envelope = await registry.resolve({
        operation: 'quote',
        symbol,
        market,
      });
      const quote = record(envelope.data);
      const price = Number(quote.price ?? quote.regularMarketPrice);
      const previous = Number(quote.prevClose ?? quote.regularMarketPreviousClose);
      if (![price, previous].every(Number.isFinite)) {
        throw new Error('Daily quote fields are unavailable');
      }
      const isBullish = price > previous;
      return {
        period: 'Daily',
        trend: isBullish ? 'UP' : 'DOWN',
        ma20: previous.toFixed(2),
        rsi: 'N/A',
        summary: `今日股價${isBullish ? '上漲' : '下跌'}，當前價格 ${price}。`,
        provenance: envelope.provenance,
      };
    } catch (error) {
      console.warn('[MarketData] getDailyContext failed:', error);
    }
  }

  return {
    period: 'Daily',
    trend: 'UNKNOWN',
    ma20: '0',
    rsi: '0',
    summary: '暫時無法獲取日線背景數據。',
  };
}
