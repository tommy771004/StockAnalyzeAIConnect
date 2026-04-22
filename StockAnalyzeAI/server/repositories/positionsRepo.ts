/**
 * server/repositories/positionsRepo.ts
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { positions, type Position, type NewPosition } from '../../src/db/schema.js';

export async function getPositionsByUser(userId: string): Promise<Position[]> {
  return db.select().from(positions).where(eq(positions.userId, userId));
}

/** Replace the whole positions list for a user. */
export async function replacePositions(
  userId: string,
  items: Array<{ symbol: string; name?: string; shares: number | string; avgCost: number | string; currency?: string }>,
): Promise<Position[]> {
  // neon-http does not support interactive transactions; use sequential ops instead
  await db.delete(positions).where(eq(positions.userId, userId));
  if (items.length === 0) return [];
  return db
    .insert(positions)
    .values(
      items.map((p) => ({
        userId,
        symbol:   p.symbol,
        name:     p.name ?? null,
        shares:   String(p.shares),
        avgCost:  String(p.avgCost),
        currency: p.currency ?? 'USD',
      })),
    )
    .returning();
}

export async function upsertPosition(userId: string, data: Omit<NewPosition, 'userId'>): Promise<Position> {
  const [pos] = await db
    .insert(positions)
    .values({ ...data, userId })
    .onConflictDoUpdate({
      target: [positions.userId, positions.symbol],
      set: { shares: data.shares, avgCost: data.avgCost, currency: data.currency, updatedAt: new Date() },
    })
    .returning();
  return pos;
}

export async function removePosition(userId: string, symbol: string): Promise<void> {
  await db.delete(positions).where(and(eq(positions.userId, userId), eq(positions.symbol, symbol)));
}
