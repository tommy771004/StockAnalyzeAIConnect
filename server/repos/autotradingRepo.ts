/**
 * server/repos/autotradingRepo.ts
 * 自動交易資料持久化層
 */
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { autotradingConfigs, autotradingLogs } from '../../src/db/schema.js';
import type { AgentConfig } from '../../src/components/AutoTrading/types.js';

export class AutotradingRepo {
  /** 
   * Neon + Drizzle 不需要手動 initSchema (通常透過 migration 或 db push)
   * 這裡提供空函數以保持相容性
   */
  async initSchema() {}

  async saveConfig(userId: string, config: AgentConfig) {
    if (!db) return;
    
    // Drizzle Upsert
    await db.insert(autotradingConfigs).values({
      userId,
      mode: config.mode,
      strategies: config.strategies,
      params: config.params,
      symbols: config.symbols,
      tickIntervalMs: config.tickIntervalMs,
      budgetLimitTwd: String(config.budgetLimitTWD),
      maxDailyLossTwd: String(config.maxDailyLossTWD),
      updatedAt: new Date()
    }).onConflictDoUpdate({
      target: autotradingConfigs.userId,
      set: {
        mode: config.mode,
        strategies: config.strategies,
        params: config.params,
        symbols: config.symbols,
        tickIntervalMs: config.tickIntervalMs,
        budgetLimitTwd: String(config.budgetLimitTWD),
        maxDailyLossTwd: String(config.maxDailyLossTWD),
        updatedAt: new Date()
      }
    });
  }

  async getConfig(userId: string): Promise<AgentConfig | null> {
    if (!db) return null;
    const row = await db.query.autotradingConfigs.findFirst({
      where: eq(autotradingConfigs.userId, userId)
    });
    if (!row) return null;
    
    return {
      mode: row.mode as any,
      strategies: row.strategies as any,
      params: row.params as any,
      symbols: row.symbols,
      tickIntervalMs: row.tickIntervalMs,
      budgetLimitTWD: Number(row.budgetLimitTwd),
      maxDailyLossTWD: Number(row.maxDailyLossTwd)
    };
  }

  async saveLogs(logs: any[]) {
    if (!db || logs.length === 0) return;
    await db.insert(autotradingLogs).values(logs.map(log => ({
      id: log.id,
      timestamp: new Date(log.timestamp),
      level: log.level,
      source: log.source,
      message: log.message,
      symbol: log.symbol,
      confidence: log.confidence,
      action: log.action
    }))).onConflictDoNothing();
  }
}

export const autotradingRepo = new AutotradingRepo();
