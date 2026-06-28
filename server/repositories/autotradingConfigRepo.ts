/**
 * server/repositories/autotradingConfigRepo.ts
 * 處理自動交易配置的持久化存取
 */
import { db } from '../../src/db/index.js';
import { autotradingConfigs, type AutotradingConfig, type NewAutotradingConfig } from '../../src/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import type { AgentConfig } from '../../src/components/AutoTrading/types.js';
import {
  TradingSessionState,
  type TradingSessionSnapshot,
} from '../services/tradingSessionState.js';

function configFromRow(row: AutotradingConfig): AgentConfig {
  const persisted = row.configState as AgentConfig | null;
  if (persisted) return structuredClone(persisted);
  return {
    userId: row.userId,
    mode: row.mode as AgentConfig['mode'],
    strategies: row.strategies as AgentConfig['strategies'],
    params: row.params as AgentConfig['params'],
    symbols: row.symbols,
    tickIntervalMs: row.tickIntervalMs,
    budgetLimitTWD: Number(row.budgetLimitTwd || 0),
    maxDailyLossTWD: Number(row.maxDailyLossTwd || 0),
    ...((row.params as { extra?: Partial<AgentConfig> })?.extra || {}),
  };
}

function snapshotFromRow(row: AutotradingConfig): TradingSessionSnapshot {
  const fallback = new TradingSessionState(row.userId).snapshot();
  const rawPosTrack = row.posTrack as
    | Array<[string, { avgCost: number; qty: number }]>
    | Record<string, { avgCost: number; qty: number }>
    | null;
  const posTrack = Array.isArray(rawPosTrack)
    ? rawPosTrack
    : Object.entries(rawPosTrack ?? {}).filter(([key]) => !key.startsWith('__'));
  const legacyRisk = !Array.isArray(rawPosTrack)
    ? (rawPosTrack?.__riskDaily as { dailyLoss?: number; killSwitchActive?: boolean } | undefined)
    : undefined;
  const risk = row.riskState
    ? row.riskState as TradingSessionSnapshot['risk']
    : {
        ...fallback.risk,
        currentDailyLoss: legacyRisk?.dailyLoss ?? 0,
        killSwitchActive: legacyRisk?.killSwitchActive === true,
      };

  return {
    ...fallback,
    userId: row.userId,
    status: row.status as TradingSessionSnapshot['status'],
    config: configFromRow(row),
    lastSentimentScore: row.lastSentimentScore ?? fallback.lastSentimentScore,
    lastEquityBroadcast: row.lastEquityBroadcast ?? fallback.lastEquityBroadcast,
    equityHistory: (row.equityHistory as TradingSessionSnapshot['equityHistory'] | null) ?? [],
    logs: (row.sessionLogs as TradingSessionSnapshot['logs'] | null) ?? [],
    recentPriceSeries:
      (row.recentPriceSeries as TradingSessionSnapshot['recentPriceSeries'] | null) ?? [],
    posTrack,
    peakPriceTrack:
      (row.peakPriceTrack as TradingSessionSnapshot['peakPriceTrack'] | null) ?? [],
    strategyRuntimeStates:
      (row.strategyRuntimeState as TradingSessionSnapshot['strategyRuntimeStates'] | null) ?? [],
    lossStreakCount: row.lossStreakCount,
    risk,
    paperBroker:
      (row.brokerState as TradingSessionSnapshot['paperBroker'] | null) ?? fallback.paperBroker,
    cooldownUntil: row.cooldownUntil?.toISOString() ?? null,
  };
}

export const autotradingConfigRepo = {
  /**
   * 獲取使用者的自動交易配置與狀態
   */
  async getConfig(userId: string): Promise<any | null> {
    const [row] = await db.select()
      .from(autotradingConfigs)
      .where(eq(autotradingConfigs.userId, userId))
      .limit(1);

    if (!row) return null;

    return {
      ...configFromRow(row),
      status: row.status as any,
      lossStreakCount: row.lossStreakCount,
      posTrack: (row.posTrack as any) || {},
      equityHistory: (row.equityHistory as any) || [],
    };
  },

  /**
   * 獲取所有處於運行狀態的配置 (P2)
   */
  async getAllActiveConfigs() {
    return await db.select()
      .from(autotradingConfigs)
      .where(inArray(autotradingConfigs.status, ['running', 'cooldown']));
  },

  async getAllActiveSessionSnapshots(): Promise<TradingSessionSnapshot[]> {
    const rows = await db!.select()
      .from(autotradingConfigs)
      .where(inArray(autotradingConfigs.status, ['running', 'cooldown']));
    return rows.map(snapshotFromRow);
  },

  /**
   * 儲存或更新配置
   */
  async saveConfig(userId: string, config: AgentConfig, status: string = 'stopped') {
    const data: NewAutotradingConfig = {
      userId,
      mode: config.mode,
      strategies: config.strategies,
      params: config.params as any,
      symbols: config.symbols,
      tickIntervalMs: config.tickIntervalMs,
      budgetLimitTwd: (config.budgetLimitTWD || 0).toString(),
      maxDailyLossTwd: (config.maxDailyLossTWD || 0).toString(),
      status: status as any,
      configState: config,
    };

    return await db.insert(autotradingConfigs)
      .values(data)
      .onConflictDoUpdate({
        target: autotradingConfigs.userId,
        set: data
      });
  },

  async saveSessionSnapshot(snapshot: TradingSessionSnapshot) {
    const config = snapshot.config;
    const data: NewAutotradingConfig = {
      userId: snapshot.userId,
      mode: config.mode,
      strategies: config.strategies,
      params: config.params,
      symbols: config.symbols,
      tickIntervalMs: config.tickIntervalMs,
      budgetLimitTwd: String(config.budgetLimitTWD || 0),
      maxDailyLossTwd: String(config.maxDailyLossTWD || 0),
      status: snapshot.status,
      lossStreakCount: snapshot.lossStreakCount,
      posTrack: snapshot.posTrack,
      equityHistory: snapshot.equityHistory,
      configState: config,
      brokerState: snapshot.paperBroker,
      riskState: snapshot.risk,
      peakPriceTrack: snapshot.peakPriceTrack,
      recentPriceSeries: snapshot.recentPriceSeries,
      strategyRuntimeState: snapshot.strategyRuntimeStates,
      sessionLogs: snapshot.logs,
      cooldownUntil: snapshot.cooldownUntil ? new Date(snapshot.cooldownUntil) : null,
      lastSentimentScore: snapshot.lastSentimentScore,
      lastEquityBroadcast: snapshot.lastEquityBroadcast,
      updatedAt: new Date(),
    };
    return db!.insert(autotradingConfigs)
      .values(data)
      .onConflictDoUpdate({
        target: autotradingConfigs.userId,
        set: data,
      });
  },

  /**
   * 僅儲存運行狀態與計數 (P1)
   * 含 3 次指數退避重試，應對 Neon HTTP 瞬斷問題。
   */
  async saveState(userId: string, state: { status: string; lossStreakCount: number; posTrack: any; equityHistory?: any }) {
    const MAX_RETRIES = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await db!.update(autotradingConfigs)
          .set({
            status: state.status as any,
            lossStreakCount: state.lossStreakCount,
            posTrack: state.posTrack,
            equityHistory: state.equityHistory,
            updatedAt: new Date(),
          })
          .where(eq(autotradingConfigs.userId, userId));
      } catch (e) {
        lastError = e;
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 300 * attempt));
        }
      }
    }
    throw lastError;
  }
};
