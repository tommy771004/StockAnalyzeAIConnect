import { z } from 'zod';

export const StrategyRuntimeSchema = z.enum(['indicator', 'script']);
export type StrategyRuntime = z.infer<typeof StrategyRuntimeSchema>;

export const BarSchema = z.object({
  timestamp: z.string().min(1),
  open: z.number().finite().positive(),
  high: z.number().finite().positive(),
  low: z.number().finite().positive(),
  close: z.number().finite().positive(),
  volume: z.number().finite().nonnegative(),
}).superRefine((bar, context) => {
  const highestBodyPrice = Math.max(bar.open, bar.close);
  const lowestBodyPrice = Math.min(bar.open, bar.close);
  if (bar.high < highestBodyPrice) {
    context.addIssue({
      code: 'custom',
      message: 'high must be greater than or equal to open and close',
      path: ['high'],
    });
  }
  if (bar.low > lowestBodyPrice) {
    context.addIssue({
      code: 'custom',
      message: 'low must be less than or equal to open and close',
      path: ['low'],
    });
  }
  if (bar.low > bar.high) {
    context.addIssue({
      code: 'custom',
      message: 'low must not exceed high',
      path: ['low'],
    });
  }
});

export type StrategyBar = z.infer<typeof BarSchema>;

export const ExecutionPolicySchema = z.object({
  initialCapital: z.number().positive().default(1_000_000),
  feeRate: z.number().min(0).max(0.1).default(0.001),
  slippageBps: z.number().min(0).max(1_000).default(5),
  entryPct: z.number().positive().max(1).default(0.1),
  stopLossPct: z.number().positive().max(1).optional(),
  takeProfitPct: z.number().positive().max(10).optional(),
  trailingStopPct: z.number().positive().max(1).optional(),
  tradeDirection: z.enum(['long', 'short', 'both']).default('long'),
  exitOwner: z.enum(['engine', 'strategy']).default('engine'),
});

export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;

export const CrossSectionalConfigSchema = z.object({
  symbols: z.array(
    z.string().trim().min(1).max(64).transform((symbol) => symbol.toUpperCase()),
  ).min(2).max(50).refine(
    (symbols) => new Set(symbols).size === symbols.length,
    { message: 'Cross-sectional symbols must be unique' },
  ),
  portfolioSize: z.number().int().min(1).max(50),
  longRatio: z.number().min(0).max(1),
  rebalanceFrequency: z.enum(['daily', 'weekly', 'monthly']),
}).superRefine((config, context) => {
  if (config.portfolioSize > config.symbols.length) {
    context.addIssue({
      code: 'custom',
      message: 'portfolioSize must not exceed the universe size',
      path: ['portfolioSize'],
    });
  }
});

export type CrossSectionalConfig = z.infer<typeof CrossSectionalConfigSchema>;

const StrategySourceSchema = z.object({
  strategyVersionId: z.string().min(1),
  runtime: StrategyRuntimeSchema,
  source: z.string().min(1).max(100_000),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

export const StrategyValidationRequestSchema = StrategySourceSchema;

export const StrategyBacktestRequestSchema = StrategySourceSchema.extend({
  runId: z.string().min(1),
  symbol: z.string().min(1),
  bars: z.array(BarSchema).min(2).max(100_000),
  execution: ExecutionPolicySchema,
  crossSectional: CrossSectionalConfigSchema.optional(),
  universeBars: z.record(
    z.string().min(1),
    z.array(BarSchema).min(2).max(100_000),
  ).optional(),
}).superRefine((request, context) => {
  if (!request.crossSectional) {
    if (request.universeBars) {
      context.addIssue({
        code: 'custom',
        message: 'universeBars requires crossSectional configuration',
        path: ['universeBars'],
      });
    }
    return;
  }
  if (request.runtime !== 'indicator') {
    context.addIssue({
      code: 'custom',
      message: 'Cross-sectional backtests require indicator runtime',
      path: ['runtime'],
    });
  }
  if (!request.universeBars) {
    context.addIssue({
      code: 'custom',
      message: 'Cross-sectional backtests require universeBars',
      path: ['universeBars'],
    });
    return;
  }
  const expected = [...request.crossSectional.symbols].sort();
  const actual = Object.keys(request.universeBars).sort();
  if (expected.join('\0') !== actual.join('\0')) {
    context.addIssue({
      code: 'custom',
      message: 'universeBars must match crossSectional symbols',
      path: ['universeBars'],
    });
  }
});

export const StrategySignalRequestSchema = StrategySourceSchema.extend({
  symbol: z.string().min(1),
  bars: z.array(BarSchema).min(2).max(10_000),
  runtimeState: z.record(z.string(), z.unknown()).default({}),
  lastProcessedTimestamp: z.string().min(1).optional(),
  cash: z.number().finite().nonnegative().default(0),
  equity: z.number().finite().nonnegative().default(0),
  positionSide: z.enum(['long', 'short']).nullable().default(null),
  quantity: z.number().finite().nonnegative().default(0),
}).superRefine((request, context) => {
  if (
    request.runtime === 'script'
    && Object.keys(request.runtimeState).length > 0
    && !request.lastProcessedTimestamp
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Script runtimeState requires lastProcessedTimestamp',
      path: ['lastProcessedTimestamp'],
    });
  }
});

export const StrategySignalResultSchema = z.object({
  strategyVersionId: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  engineVersion: z.string().min(1),
  symbol: z.string().min(1),
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  confidence: z.number().min(0).max(100),
  price: z.number().finite().positive(),
  marketTimestamp: z.string().min(1),
  runtimeState: z.record(z.string(), z.unknown()).optional(),
  lastProcessedTimestamp: z.string().min(1).optional(),
  allocationPct: z.number().positive().max(1).optional(),
  runtimeReset: z.boolean().optional(),
});

export type StrategyValidationRequest = z.input<typeof StrategyValidationRequestSchema>;
export type StrategyBacktestRequest = z.input<typeof StrategyBacktestRequestSchema>;
export type StrategySignalRequest = z.input<typeof StrategySignalRequestSchema>;
export type StrategySignalResult = z.infer<typeof StrategySignalResultSchema>;
export interface StrategySignalRuntimeContext {
  runtimeState?: Record<string, unknown>;
  lastProcessedTimestamp?: string;
  cash?: number;
  equity?: number;
  positionSide?: 'long' | 'short' | null;
  quantity?: number;
}

export const StrategyDiagnosticSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  line: z.number().int().positive().optional(),
  severity: z.enum(['error', 'warning']),
});

export const StrategyValidationResultSchema = z.object({
  valid: z.boolean(),
  diagnostics: z.array(StrategyDiagnosticSchema),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  engineVersion: z.string().min(1),
});

export const StrategyEquityPointSchema = z.object({
  timestamp: z.string().min(1),
  equity: z.number().finite(),
  drawdownPct: z.number().finite().nonnegative(),
});

export const StrategyTradeSchema = z.object({
  symbol: z.string().min(1).optional(),
  side: z.enum(['long', 'short']),
  entryTimestamp: z.string().min(1),
  exitTimestamp: z.string().min(1),
  entryPrice: z.number().finite().positive(),
  exitPrice: z.number().finite().positive(),
  quantity: z.number().finite().positive(),
  grossPnl: z.number().finite(),
  fees: z.number().finite().nonnegative(),
  netPnl: z.number().finite(),
  returnPct: z.number().finite(),
  exitReason: z.string().min(1),
});

export const StrategyBacktestResultSchema = z.object({
  runId: z.string().min(1),
  strategyVersionId: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  engineVersion: z.string().min(1),
  equityCurve: z.array(StrategyEquityPointSchema).min(1),
  trades: z.array(StrategyTradeSchema),
  metrics: z.record(z.string(), z.number().finite()),
  assumptions: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()),
});

export type StrategyDiagnostic = z.infer<typeof StrategyDiagnosticSchema>;
export type StrategyValidationResult = z.infer<typeof StrategyValidationResultSchema>;
export type StrategyEquityPoint = z.infer<typeof StrategyEquityPointSchema>;
export type StrategyTrade = z.infer<typeof StrategyTradeSchema>;
export type StrategyBacktestResult = z.infer<typeof StrategyBacktestResultSchema>;
