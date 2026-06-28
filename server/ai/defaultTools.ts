import { z } from 'zod';

import type { DataEnvelope, DataMarket, DataRequestInput } from '../data/types.js';
import { CrossSectionalConfigSchema } from '../types/strategyRuntime.js';
import {
  AgentToolRegistry,
  ToolAccessDeniedError,
  type AgentToolContext,
} from './toolRegistry.js';

interface DefaultAgentToolDependencies {
  resolveData(request: DataRequestInput): Promise<DataEnvelope>;
  getPortfolio(userId: string): Promise<unknown[]>;
  getTrades(userId: string): Promise<unknown[]>;
  getDataHealth?(): unknown;
  queueBacktest(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<{ jobId: string; status: string }>;
  createStrategyVersion?(
    userId: string,
    strategyId: number,
    command: {
      runtime: 'indicator' | 'script';
      source: string;
      provenance: 'ai';
    },
  ): Promise<unknown>;
  validateStrategyVersion?(
    userId: string,
    strategyVersionId: string,
  ): Promise<unknown>;
  getBacktestJob?(
    userId: string,
    jobId: string,
  ): Promise<unknown | null>;
  startPaperStrategy?(
    userId: string,
    input: {
      ticker: string;
      strategyVersionId: string;
      paperOnly: true;
    },
  ): Promise<unknown>;
  stopPaperStrategy?(userId: string): Promise<unknown>;
  inspectPaperSession?(userId: string): Promise<unknown>;
  inspectPaperOrders?(userId: string): Promise<unknown>;
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
  ticker: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()).optional(),
  crossSectional: CrossSectionalConfigSchema.optional(),
  strategyVersionId: z.string().min(1),
  initialCapital: z.number().positive().optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
}).superRefine((input, context) => {
  if (!input.ticker && !input.crossSectional) {
    context.addIssue({
      code: 'custom',
      message: 'ticker or crossSectional configuration is required',
      path: ['ticker'],
    });
  }
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

const FundamentalsInputSchema = z.object({
  ticker: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()),
});

const StrategyDraftInputSchema = z.object({
  strategyId: z.number().int().positive(),
  runtime: z.enum(['indicator', 'script']),
  source: z.string().trim().min(1).max(100_000),
});

const StrategyVersionInputSchema = z.object({
  strategyVersionId: z.string().min(1).max(200),
});

const BacktestJobInputSchema = z.object({
  jobId: z.string().min(1).max(200),
});

const StartPaperStrategyInputSchema = z.object({
  ticker: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()),
  strategyVersionId: z.string().min(1).max(200),
  paperOnly: z.literal(true).default(true),
});

const EmptyInputSchema = z.object({}).strict();

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
      name: 'start_paper_strategy',
      version: '1',
      description: '啟動使用者擁有且已驗證的不可變策略版本；僅限隔離模擬交易',
      riskClass: 'paper_trade',
      requiredScopes: ['T'],
      inputSchema: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          strategyVersionId: { type: 'string' },
          paperOnly: { type: 'boolean', const: true },
        },
        required: ['ticker', 'strategyVersionId'],
      },
    },
    input: StartPaperStrategyInputSchema,
    execute: async (input, context) => {
      if (!dependencies.startPaperStrategy || !dependencies.validateStrategyVersion) {
        return unavailable('start_paper_strategy', '1', 'PAPER_SESSION_UNAVAILABLE');
      }
      const market = marketFor(input.ticker);
      assertAllowed(input.ticker, market, context);
      const validation = await dependencies.validateStrategyVersion(
        context.userId,
        input.strategyVersionId,
      );
      if (
        !validation
        || typeof validation !== 'object'
        || (validation as { valid?: boolean }).valid !== true
      ) {
        throw new ToolAccessDeniedError('Strategy version is not valid for paper execution');
      }
      const data = await dependencies.startPaperStrategy(context.userId, {
        ticker: input.ticker,
        strategyVersionId: input.strategyVersionId,
        paperOnly: true,
      });
      const timestamp = new Date(now()).toISOString();
      return {
        toolName: 'start_paper_strategy',
        toolVersion: '1',
        data,
        evidence: [internalEvidence(
          'E1',
          `Paper session ${context.userId}`,
          data,
          'hermes-paper-session',
          timestamp,
        )],
        warnings: [],
      };
    },
  });

  tools.register({
    definition: {
      name: 'stop_paper_strategy',
      version: '1',
      description: '停止目前 Agent token 所屬使用者的模擬交易工作階段',
      riskClass: 'paper_trade',
      requiredScopes: ['T'],
      inputSchema: { type: 'object', properties: {} },
    },
    input: EmptyInputSchema,
    execute: async (_input, context) => {
      if (!dependencies.stopPaperStrategy) {
        return unavailable('stop_paper_strategy', '1', 'PAPER_SESSION_UNAVAILABLE');
      }
      const data = await dependencies.stopPaperStrategy(context.userId);
      const timestamp = new Date(now()).toISOString();
      return {
        toolName: 'stop_paper_strategy',
        toolVersion: '1',
        data,
        evidence: [internalEvidence(
          'E1',
          `Stopped paper session ${context.userId}`,
          data,
          'hermes-paper-session',
          timestamp,
        )],
        warnings: [],
      };
    },
  });

  tools.register({
    definition: {
      name: 'inspect_paper_session',
      version: '1',
      description: '讀取目前 Agent token 所屬使用者的模擬交易狀態與風控',
      riskClass: 'read',
      requiredScopes: ['T'],
      inputSchema: { type: 'object', properties: {} },
    },
    input: EmptyInputSchema,
    execute: async (_input, context) => {
      if (!dependencies.inspectPaperSession) {
        return unavailable('inspect_paper_session', '1', 'PAPER_SESSION_UNAVAILABLE');
      }
      const data = await dependencies.inspectPaperSession(context.userId);
      const timestamp = new Date(now()).toISOString();
      return {
        toolName: 'inspect_paper_session',
        toolVersion: '1',
        data,
        evidence: [internalEvidence(
          'E1',
          `Paper session status ${context.userId}`,
          data,
          'hermes-paper-session',
          timestamp,
        )],
        warnings: [],
      };
    },
  });

  tools.register({
    definition: {
      name: 'inspect_paper_orders',
      version: '1',
      description: '讀取目前 Agent token 所屬使用者的模擬委託與持倉',
      riskClass: 'read',
      requiredScopes: ['T'],
      inputSchema: { type: 'object', properties: {} },
    },
    input: EmptyInputSchema,
    execute: async (_input, context) => {
      if (!dependencies.inspectPaperOrders) {
        return unavailable('inspect_paper_orders', '1', 'PAPER_SESSION_UNAVAILABLE');
      }
      const data = await dependencies.inspectPaperOrders(context.userId);
      const timestamp = new Date(now()).toISOString();
      return {
        toolName: 'inspect_paper_orders',
        toolVersion: '1',
        data,
        evidence: [internalEvidence(
          'E1',
          `Paper orders ${context.userId}`,
          data,
          'hermes-paper-session',
          timestamp,
        )],
        warnings: [],
      };
    },
  });

  tools.register({
    definition: {
      name: 'get_fundamentals',
      version: '1',
      description: '取得具 SEC EDGAR 來源追溯的美股基本面與申報資料',
      riskClass: 'read',
      requiredScopes: ['R'],
      inputSchema: {
        type: 'object',
        properties: { ticker: { type: 'string' } },
        required: ['ticker'],
      },
    },
    input: FundamentalsInputSchema,
    execute: async (input, context) => {
      assertAllowed(input.ticker, 'us_stock', context);
      try {
        const envelope = await dependencies.resolveData({
          operation: 'fundamentals',
          symbol: input.ticker,
          market: 'us_stock',
        });
        return {
          toolName: 'get_fundamentals',
          toolVersion: '1',
          data: envelope.data,
          evidence: [evidence(
            'E1',
            `${input.ticker} fundamentals`,
            envelope.data,
            envelope,
          )],
          warnings: envelope.warnings,
        };
      } catch {
        return unavailable('get_fundamentals', '1', 'NO_PROVIDER_DATA');
      }
    },
  });

  tools.register({
    definition: {
      name: 'get_data_source_health',
      version: '1',
      description: '檢查已註冊資料來源、熔斷器、限流與快取健康狀態',
      riskClass: 'read',
      requiredScopes: ['R'],
      inputSchema: { type: 'object', properties: {} },
    },
    input: z.object({}),
    execute: async () => {
      if (!dependencies.getDataHealth) {
        return unavailable('get_data_source_health', '1', 'HEALTH_UNAVAILABLE');
      }
      const data = dependencies.getDataHealth();
      const timestamp = new Date(now()).toISOString();
      return {
        toolName: 'get_data_source_health',
        toolVersion: '1',
        data,
        evidence: [internalEvidence(
          'E1',
          'Hermes data source health',
          data,
          'hermes-data-registry',
          timestamp,
        )],
        warnings: [],
      };
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
      name: 'create_strategy_draft',
      version: '1',
      description: '建立使用者擁有且不可變的 AI 策略草稿版本',
      riskClass: 'workspace',
      requiredScopes: ['W'],
      inputSchema: {
        type: 'object',
        properties: {
          strategyId: { type: 'number' },
          runtime: { type: 'string', enum: ['indicator', 'script'] },
          source: { type: 'string' },
        },
        required: ['strategyId', 'runtime', 'source'],
      },
    },
    input: StrategyDraftInputSchema,
    execute: async (input, context) => {
      if (!dependencies.createStrategyVersion) {
        return unavailable('create_strategy_draft', '1', 'STRATEGY_SERVICE_UNAVAILABLE');
      }
      const data = await dependencies.createStrategyVersion(
        context.userId,
        input.strategyId,
        {
          runtime: input.runtime,
          source: input.source,
          provenance: 'ai',
        },
      );
      const timestamp = new Date(now()).toISOString();
      return {
        toolName: 'create_strategy_draft',
        toolVersion: '1',
        data,
        evidence: [internalEvidence(
          'E1',
          'Immutable strategy draft',
          data,
          'hermes-strategy-registry',
          timestamp,
        )],
        warnings: [],
      };
    },
  });

  tools.register({
    definition: {
      name: 'validate_strategy',
      version: '1',
      description: '透過受限 Python runtime 驗證使用者擁有的策略版本',
      riskClass: 'workspace',
      requiredScopes: ['W'],
      inputSchema: {
        type: 'object',
        properties: { strategyVersionId: { type: 'string' } },
        required: ['strategyVersionId'],
      },
    },
    input: StrategyVersionInputSchema,
    execute: async (input, context) => {
      if (!dependencies.validateStrategyVersion) {
        return unavailable('validate_strategy', '1', 'STRATEGY_SERVICE_UNAVAILABLE');
      }
      const data = await dependencies.validateStrategyVersion(
        context.userId,
        input.strategyVersionId,
      );
      const timestamp = new Date(now()).toISOString();
      return {
        toolName: 'validate_strategy',
        toolVersion: '1',
        data,
        evidence: [internalEvidence(
          'E1',
          `Strategy validation ${input.strategyVersionId}`,
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
      name: 'inspect_backtest',
      version: '1',
      description: '讀取使用者擁有的非同步回測工作與結果',
      riskClass: 'read',
      requiredScopes: ['R'],
      inputSchema: {
        type: 'object',
        properties: { jobId: { type: 'string' } },
        required: ['jobId'],
      },
    },
    input: BacktestJobInputSchema,
    execute: async (input, context) => {
      if (!dependencies.getBacktestJob) {
        return unavailable('inspect_backtest', '1', 'STRATEGY_SERVICE_UNAVAILABLE');
      }
      const data = await dependencies.getBacktestJob(context.userId, input.jobId);
      if (!data) return unavailable('inspect_backtest', '1', 'BACKTEST_NOT_FOUND');
      const timestamp = new Date(now()).toISOString();
      return {
        toolName: 'inspect_backtest',
        toolVersion: '1',
        data,
        evidence: [internalEvidence(
          'E1',
          `Backtest job ${input.jobId}`,
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
      name: 'execute_backtest',
      version: '1',
      description: '對已驗證的不可變策略版本建立非同步回測工作',
      riskClass: 'backtest',
      requiredScopes: ['B'],
      inputSchema: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          crossSectional: {
            type: 'object',
            properties: {
              symbols: { type: 'array', items: { type: 'string' }, minItems: 2 },
              portfolioSize: { type: 'number' },
              longRatio: { type: 'number' },
              rebalanceFrequency: {
                type: 'string',
                enum: ['daily', 'weekly', 'monthly'],
              },
            },
            required: ['symbols', 'portfolioSize', 'longRatio', 'rebalanceFrequency'],
          },
          strategyVersionId: { type: 'string' },
          initialCapital: { type: 'number' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
        },
        required: ['strategyVersionId'],
      },
    },
    input: BacktestInputSchema,
    execute: async (input, context) => {
      const symbols = input.crossSectional?.symbols ?? [input.ticker!];
      for (const symbol of symbols) {
        assertAllowed(symbol, marketFor(symbol), context);
      }
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
