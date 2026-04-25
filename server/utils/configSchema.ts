/**
 * server/utils/configSchema.ts
 * 嚴格的配置驗證 Schema，防止惡意配置注入
 */
import { z } from 'zod';

export const StrategyParamsSchema = z.object({
  RSI_REVERSION: z.object({
    period: z.number().min(2).max(100),
    overbought: z.number().min(50).max(95),
    oversold: z.number().min(5).max(50),
    weight: z.number().min(0).max(1)
  }).optional(),
  BOLLINGER_BREAKOUT: z.object({
    period: z.number().min(5).max(100),
    stdDev: z.number().min(1).max(5),
    weight: z.number().min(0).max(1)
  }).optional(),
  MACD_CROSS: z.object({
    fast: z.number().min(5).max(50),
    slow: z.number().min(20).max(100),
    signal: z.number().min(2).max(20),
    weight: z.number().min(0).max(1)
  }).optional(),
  AI_LLM: z.object({
    confidenceThreshold: z.number().min(0).max(100),
    weight: z.number().min(0).max(1)
  }).optional(),
  stopLossPct: z.number().min(0.1).max(20),
  takeProfitPct: z.number().min(0.5).max(100),
  trailingStopPct: z.number().min(0.1).max(10),
  maxAllocationPerTrade: z.number().min(0.01).max(0.5),
  enableMTF: z.boolean().optional()
}).partial();

export const AgentConfigPatchSchema = z.object({
  userId: z.string().uuid().optional(),
  mode: z.enum(['simulated', 'real']),
  symbols: z.array(z.string()),
  params: StrategyParamsSchema,
  symbolConfigs: z.record(z.string(), StrategyParamsSchema), // 修正：加入 keyType 引數
  shadowConfigs: z.record(z.string(), z.any()),            // 修正：加入 keyType 引數
  hedgeConfig: z.object({
    enabled: z.boolean(),
    hedgeRatio: z.number(),
    hedgeSymbol: z.string().optional()
  }),
  circuitBreaker: z.object({
    enabled: z.boolean(),
    maxLossStreak: z.number(),
    maxDailyLossPct: z.number(),
    cooldownMinutes: z.number()
  }),
  tickIntervalMs: z.number(),

  budgetLimitTWD: z.number(),
  maxDailyLossTWD: z.number()
}).partial();
