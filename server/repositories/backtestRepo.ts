/**
 * server/repositories/backtestRepo.ts
 * Backtest session & trade persistence
 */
import { db } from '../../src/db/index.js';
import { backtestSessions, backtestTrades } from '../../src/db/schema.js';
import type { NewBacktestSession, NewBacktestTrade } from '../../src/db/schema.js';
import { eq, and } from 'drizzle-orm';

export const backtestRepo = {
  async createSession(data: NewBacktestSession) {
    const rows = await db.insert(backtestSessions).values(data).returning();
    return rows[0] ?? null;
  },

  async updateSession(sessionId: number, updates: Partial<Omit<NewBacktestSession, 'userId'>>) {
    const rows = await db
      .update(backtestSessions)
      .set(updates)
      .where(eq(backtestSessions.id, sessionId))
      .returning();
    return rows[0] ?? null;
  },

  async getSession(sessionId: number) {
    const rows = await db.select().from(backtestSessions).where(eq(backtestSessions.id, sessionId));
    return rows[0] ?? null;
  },

  async listByUser(userId: string, limit = 50) {
    return db
      .select()
      .from(backtestSessions)
      .where(eq(backtestSessions.userId, userId))
      .orderBy(backtestSessions.createdAt)
      .limit(limit);
  },

  async findByHash(hash: string) {
    const rows = await db
      .select()
      .from(backtestSessions)
      .where(eq(backtestSessions.strategyParamsHash, hash))
      .orderBy(backtestSessions.createdAt);
    return rows;
  },

  async addTrade(data: NewBacktestTrade) {
    const rows = await db.insert(backtestTrades).values(data).returning();
    return rows[0] ?? null;
  },

  async getTradesBySession(sessionId: number) {
    return db.select().from(backtestTrades).where(eq(backtestTrades.sessionId, sessionId));
  },
};
