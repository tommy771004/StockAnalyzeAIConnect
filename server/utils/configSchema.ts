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
  TIMESFM_FORECAST: z.object({
    horizonTicks: z.number().min(3).max(32),
    minEdgePct: z.number().min(0.01).max(10),
    weight: z.number().min(0).max(1)
  }).optional(),
  stopLossPct: z.number().min(0.1).max(20),
  takeProfitPct: z.number().min(0.5).max(100),
  trailingStopPct: z.number().min(0.1).max(10),
  maxAllocationPerTrade: z.number().min(0.01).max(0.5),
  maxPositionPct: z.number().min(0.01).max(1).optional(),
  riskPerTradePct: z.number().min(0.05).max(20).optional(),
  sizingMethod: z.enum(['fixed', 'risk_base']).optional(),
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
  tradingHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }).optional(),
  tickIntervalMs: z.number().min(5_000).max(3_600_000),
  budgetLimitTWD: z.number().positive(),
  maxDailyLossTWD: z.number().positive(),
  strategies: z.array(z.enum(['RSI_REVERSION', 'BOLLINGER_BREAKOUT', 'MACD_CROSS', 'AI_LLM'])).optional(),
}).partial();
