import { z } from 'zod';

import type { DataEnvelope, DataMarket, DataRequestInput } from '../data/types.js';
import {
  AgentToolRegistry,
  ToolAccessDeniedError,
  type AgentToolContext,
} from './toolRegistry.js';

interface DefaultAgentToolDependencies {
  resolveData(request: DataRequestInput): Promise<DataEnvelope>;
  getPortfolio(userId: string): Promise<unknown[]>;
  getTrades(userId: string): Promise<unknown[]>;
  queueBacktest(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<{ jobId: string; status: string }>;
  now?: () => number;
}

const StockInputSchema = z.object({
  ticker: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()),
  timeframe: z.enum(['1D', '1W', '1M', '3M', '1Y']).default('1M'),
  showMA: z.boolean().default(true),
});

const NewsInputSchema = z.object({
  ticker: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()),
  limit: z.number().int().positive().max(50).default(5),
});

const PortfolioInputSchema = z.object({
  period: z.enum(['1D', '1W', '1M', '3M', 'YTD', '1Y']).default('1M'),
});

const BacktestInputSchema = z.object({
  ticker: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()),
  strategyVersionId: z.string().min(1),
  initialCapital: z.number().positive().optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
});

const MacroInputSchema = z.object({
  indicators: z.array(z.string().trim().min(1).max(64)).max(20).default([
    'FED_FUNDS_RATE',
    'US10Y',
    'CPI_ALL',
    'UNEMPLOYMENT',
    'VIX',
  ]),
});

function marketFor(symbol: string): DataMarket {
  if (symbol.endsWith('.TW') || symbol.endsWith('.TWO')) return 'tw_stock';
  if (symbol.endsWith('-USD') || symbol.endsWith('-USDT')) return 'crypto';
  if (symbol.endsWith('=X')) return 'forex';
  return 'us_stock';
}

function assertAllowed(
  symbol: string,
  market: DataMarket,
  context: AgentToolContext,
): void {
  if (
    context.allowedInstruments.length
    && !context.allowedInstruments.includes(symbol)
  ) {
    throw new ToolAccessDeniedError(`${symbol} is outside the instrument allowlist`);
  }
  if (
    context.allowedMarkets.length
    && !context.allowedMarkets.includes(market)
  ) {
    throw new ToolAccessDeniedError(`${market} is outside the market allowlist`);
  }
}

function evidence(
  id: string,
  title: string,
  data: unknown,
  envelope: DataEnvelope,
) {
  const {
    providerId,
    providerVersion,
    retrievedAt,
    marketTimestamp,
    delayed,
  } = envelope.provenance;
  return {
    id,
    title,
    content: JSON.stringify(data).slice(0, 20_000),
    source: {
      providerId,
      providerVersion,
      retrievedAt,
      marketTimestamp,
      delayed,
    },
  };
}

function internalEvidence(
  id: string,
  title: string,
  data: unknown,
  providerId: string,
  timestamp: string,
) {
  return {
    id,
    title,
    content: JSON.stringify(data).slice(0, 20_000),
    source: {
      providerId,
      providerVersion: '1',
      retrievedAt: timestamp,
      marketTimestamp: timestamp,
      delayed: false,
    },
  };
}

function unavailable(toolName: string, toolVersion: string, code: string) {
  return {
    toolName,
    toolVersion,
    evidence: [],
    dataUnavailable: {
      code,
      message: 'No attributable data is currently available.',
    },
    warnings: [],
  };
}

export function createDefaultAgentTools(
  dependencies: DefaultAgentToolDependencies,
): AgentToolRegistry {
  const tools = new AgentToolRegistry();
  const now = dependencies.now ?? Date.now;

  tools.register({
    definition: {
      name: 'show_stock_chart',
      version: '1',
      description: '顯示特定股票的互動式 K 線圖',
      riskClass: 'read',
      requiredScopes: ['R'],
      inputSchema: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          timeframe: { type: 'string', enum: ['1D', '1W', '1M', '3M', '1Y'] },
          showMA: { type: 'boolean' },
        },
        required: ['ticker'],
      },
    },
    input: StockInputSchema,
    execute: async (input, context) => {
      const market = marketFor(input.ticker);
      assertAllowed(input.ticker, market, context);
      try {
        const envelope = await dependencies.resolveData({
          operation: 'quote',
          symbol: input.ticker,
          market,
        });
        const data = {
          rendered_on_client: true,
          args: input,
          quote: envelope.data,
        };
        return {
          toolName: 'show_stock_chart',
          toolVersion: '1',
          data,
          evidence: [evidence('E1', `${input.ticker} quote`, envelope.data, envelope)],
          warnings: envelope.warnings,
        };
      } catch {
        return unavailable('show_stock_chart', '1', 'NO_PROVIDER_DATA');
      }
    },
  });

  tools.register({
    definition: {
      name: 'show_news_sentiment',
      version: '1',
      description: '顯示特定標的的最新新聞情緒分析卡片',
      riskClass: 'read',
      requiredScopes: ['R'],
      inputSchema: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['ticker'],
      },
    },
    input: NewsInputSchema,
    execute: async (input, context) => {
      const market = marketFor(input.ticker);
      assertAllowed(input.ticker, market, context);
      try {
        const envelope = await dependencies.resolveData({
          operation: 'news',
          symbol: input.ticker,
          market,
          params: { limit: input.limit, scope: 'symbol' },
        });
        const data = {
          rendered_on_client: true,
          args: input,
          news: envelope.data,
        };
        return {
          toolName: 'show_news_sentiment',
          toolVersion: '1',
          data,
          evidence: [evidence('E1', `${input.ticker} news`, envelope.data, envelope)],
          warnings: envelope.warnings,
        };
      } catch {
        return unavailable('show_news_sentiment', '1', 'NO_PROVIDER_DATA');
      }
    },
  });

  tools.register({
    definition: {
      name: 'get_portfolio_performance',
      version: '1',
      description: '讀取使用者的投資組合績效，包含持倉明細與損益統計',
      riskClass: 'read',
      requiredScopes: ['R'],
      inputSchema: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['1D', '1W', '1M', '3M', 'YTD', '1Y'],
          },
        },
      },
    },
    input: PortfolioInputSchema,
    execute: async (input, context) => {
      const [positions, recentTrades] = await Promise.all([
        dependencies.getPortfolio(context.userId),
        dependencies.getTrades(context.userId),
      ]);
      const data = {
        period: input.period,
        positions,
        recentTrades: recentTrades.slice(0, 10),
      };
      const timestamp = new Date(now()).toISOString();
      return {
        toolName: 'get_portfolio_performance',
        toolVersion: '1',
        data,
        evidence: [internalEvidence(
          'E1',
          'Hermes portfolio ledger',
          data,
          'hermes-portfolio',
          timestamp,
        )],
        warnings: [],
      };
    },
  });

  tools.register({
    definition: {
      name: 'execute_backtest',
      version: '1',
      description: '對已驗證的不可變策略版本建立非同步回測工作',
      riskClass: 'backtest',
      requiredScopes: ['B'],
      inputSchema: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          strategyVersionId: { type: 'string' },
          initialCapital: { type: 'number' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
        },
        required: ['ticker', 'strategyVersionId'],
      },
    },
    input: BacktestInputSchema,
    execute: async (input, context) => {
      const market = marketFor(input.ticker);
      assertAllowed(input.ticker, market, context);
      const args = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      );
      const data = await dependencies.queueBacktest(context.userId, args);
      const timestamp = new Date(now()).toISOString();
      return {
        toolName: 'execute_backtest',
        toolVersion: '1',
        data,
        evidence: [internalEvidence(
          'E1',
          `Backtest job ${data.jobId}`,
          data,
          'hermes-strategy-runtime',
          timestamp,
        )],
        warnings: [],
      };
    },
  });

  tools.register({
    definition: {
      name: 'get_economic_data',
      version: '1',
      description: '取得具來源追溯的 FRED 總體經濟數列',
      riskClass: 'read',
      requiredScopes: ['R'],
      inputSchema: {
        type: 'object',
        properties: {
          indicators: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    input: MacroInputSchema,
    execute: async (input) => {
      const settled = await Promise.allSettled(input.indicators.map((symbol) => (
        dependencies.resolveData({
          operation: 'macroSeries',
          symbol,
          market: 'macro',
          params: { limit: 12 },
        })
      )));
      const available = settled.flatMap((item, index) => (
        item.status === 'fulfilled'
          ? [{ symbol: input.indicators[index]!, envelope: item.value }]
          : []
      ));
      if (!available.length) {
        return unavailable('get_economic_data', '1', 'NO_PROVIDER_DATA');
      }
      const data = Object.fromEntries(
        available.map(({ symbol, envelope }) => [symbol, envelope.data]),
      );
      return {
        toolName: 'get_economic_data',
        toolVersion: '1',
        data,
        evidence: available.map(({ symbol, envelope }, index) => evidence(
          `E${index + 1}`,
          `${symbol} macro series`,
          envelope.data,
          envelope,
        )),
        warnings: available.flatMap(({ envelope }) => envelope.warnings),
      };
    },
  });

  return tools;
}
