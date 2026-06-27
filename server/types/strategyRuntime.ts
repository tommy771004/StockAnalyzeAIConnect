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

export type StrategyValidationRequest = z.infer<typeof StrategyValidationRequestSchema>;
export type StrategyBacktestRequest = z.infer<typeof StrategyBacktestRequestSchema>;

export interface StrategyDiagnostic {
  code: string;
  message: string;
  line?: number;
  severity: 'error' | 'warning';
}

export interface StrategyValidationResult {
  valid: boolean;
  diagnostics: StrategyDiagnostic[];
  sourceHash: string;
  engineVersion: string;
}

export interface StrategyEquityPoint {
  timestamp: string;
  equity: number;
  drawdownPct: number;
}

export interface StrategyTrade {
  side: 'long' | 'short';
  entryTimestamp: string;
  exitTimestamp: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  returnPct: number;
  exitReason: string;
}

export interface StrategyBacktestResult {
  runId: string;
  strategyVersionId: string;
  sourceHash: string;
  engineVersion: string;
  equityCurve: StrategyEquityPoint[];
  trades: StrategyTrade[];
  metrics: Record<string, number>;
  assumptions: Record<string, unknown>;
  warnings: string[];
}
