/**
 * server/repositories/strategiesRepo.ts
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { strategies, type Strategy, type NewStrategy } from '../../src/db/schema.js';

export async function getStrategiesByUser(userId: string): Promise<Strategy[]> {
  return db.select().from(strategies).where(eq(strategies.userId, userId));
}

export async function getStrategyById(userId: string, id: number): Promise<Strategy | undefined> {
  return db.query.strategies.findFirst({
    where: and(eq(strategies.id, id), eq(strategies.userId, userId)),
  });
}

export async function createStrategy(userId: string, data: Omit<NewStrategy, 'userId'>): Promise<Strategy> {
  const [strategy] = await db
    .insert(strategies)
    .values({ ...data, userId })
    .returning();
  return strategy;
}

export async function updateStrategy(userId: string, id: number, data: Partial<Omit<NewStrategy, 'userId' | 'id'>>): Promise<Strategy | undefined> {
  const [updated] = await db
    .update(strategies)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
    .returning();
  return updated;
}

export async function deleteStrategy(userId: string, id: number): Promise<boolean> {
  const result = await db
    .delete(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
    .returning({ id: strategies.id });
  return result.length > 0;
}

/** Ensure only one strategy is marked active per user. */
export async function setActiveStrategy(userId: string, id: number): Promise<void> {
  await db.update(strategies).set({ isActive: false }).where(eq(strategies.userId, userId));
  await db.update(strategies).set({ isActive: true }).where(and(eq(strategies.id, id), eq(strategies.userId, userId)));
}
