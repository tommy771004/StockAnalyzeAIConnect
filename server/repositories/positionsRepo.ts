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
  await db.delete(positions).where(eq(positions.userId, userId));
  if (items.length === 0) return [];

  // Deduplicate items by symbol (keep the last one or merge)
  // To be safe and predictable, we'll merge shares and avgCost
  const merged = items.reduce((acc, item) => {
    if (!item.symbol) return acc;
    const sym = item.symbol.toUpperCase();
    const shares = Number(item.shares);
    const avgCost = Number(item.avgCost);
    
    if (!isFinite(shares) || !isFinite(avgCost)) return acc;

    if (!acc[sym]) {
      acc[sym] = { ...item, symbol: sym, shares, avgCost };
    } else {
      const existing = acc[sym];
      const eShares = Number(existing.shares) || 0;
      const eCost = Number(existing.avgCost) || 0;
      
      const totalShares = eShares + shares;
      if (totalShares > 0) {
        existing.avgCost = (eShares * eCost + shares * avgCost) / totalShares;
        existing.shares = totalShares;
      }
    }
    return acc;
  }, {} as Record<string, typeof items[number]>);

  const finalItems = Object.values(merged);
  
  if (finalItems.length === 0) return [];

  return db
    .insert(positions)
    .values(
      finalItems.map((p) => ({
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
