/**
 * server/repositories/autotradingConfigRepo.ts
 * 處理自動交易配置的持久化存取
 */
import { db } from '../../src/db/index.js';
import { autotradingConfigs, type AutotradingConfig, type NewAutotradingConfig } from '../../src/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import type { AgentConfig } from '../../src/components/AutoTrading/types.js';

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
      userId: row.userId,
      mode: row.mode as 'simulated' | 'real',
      strategies: row.strategies as any,
      params: row.params as any,
      symbols: row.symbols,
      tickIntervalMs: row.tickIntervalMs,
      budgetLimitTWD: Number(row.budgetLimitTwd || 0),
      maxDailyLossTWD: Number(row.maxDailyLossTwd || 0),
      status: row.status as any,
      lossStreakCount: row.lossStreakCount,
      posTrack: (row.posTrack as any) || {},
      ...((row.params as any)?.extra || {})
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
    };

    return await db.insert(autotradingConfigs)
      .values(data)
      .onConflictDoUpdate({
        target: autotradingConfigs.userId,
        set: data
      });
  },

  /**
   * 僅儲存運行狀態與計數 (P1)
   * 含 3 次指數退避重試，應對 Neon HTTP 瞬斷問題。
   */
  async saveState(userId: string, state: { status: string; lossStreakCount: number; posTrack: any }) {
    const MAX_RETRIES = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await db!.update(autotradingConfigs)
          .set({
            status: state.status as any,
            lossStreakCount: state.lossStreakCount,
            posTrack: state.posTrack,
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
