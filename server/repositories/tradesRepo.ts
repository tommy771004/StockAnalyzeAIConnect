/**
 * server/repositories/tradesRepo.ts
 */
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { trades, type Trade, type NewTrade } from '../../src/db/schema.js';
import { saveSnapshot, linkTradeId, type FeatureSnapshot } from './featureSnapshotRepo.js';

export async function getTradesByUser(userId: string): Promise<Trade[]> {
  return db.select().from(trades).where(eq(trades.userId, userId)).orderBy(desc(trades.createdAt));
}

export async function createTrade(userId: string, data: Omit<NewTrade, 'userId'>): Promise<Trade> {
  const [trade] = await db
    .insert(trades)
    .values({ ...data, userId })
    .returning();
  return trade;
}

export async function updateTrade(userId: string, id: number, data: Partial<Omit<NewTrade, 'userId' | 'id'>>): Promise<Trade | undefined> {
  const [updated] = await db
    .update(trades)
    .set(data)
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))
    .returning();
  return updated;
}

export async function deleteTrade(userId: string, id: number): Promise<boolean> {
  const result = await db
    .delete(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))
    .returning({ id: trades.id });
  return result.length > 0;
}

/** 建立交易並同時儲存下單前特徵快照，支援決策回溯。 */
export async function createTradeWithSnapshot(
  userId: string,
  data: Omit<NewTrade, 'userId'>,
  snapshot: Omit<FeatureSnapshot, 'tradeId'>,
): Promise<Trade> {
  saveSnapshot(snapshot);
  const trade = await createTrade(userId, data);
  linkTradeId(snapshot.correlationId, trade.id);
  return trade;
}
