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
});

export const StrategySignalRequestSchema = StrategySourceSchema.extend({
  symbol: z.string().min(1),
  bars: z.array(BarSchema).min(2).max(10_000),
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
});

export type StrategyValidationRequest = z.input<typeof StrategyValidationRequestSchema>;
export type StrategyBacktestRequest = z.input<typeof StrategyBacktestRequestSchema>;
export type StrategySignalRequest = z.input<typeof StrategySignalRequestSchema>;
export type StrategySignalResult = z.infer<typeof StrategySignalResultSchema>;

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
