/**
 * server/repositories/watchlistRepo.ts
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { watchlistItems, type WatchlistItem, type NewWatchlistItem } from '../../src/db/schema.js';

export async function getWatchlistByUser(userId: string): Promise<WatchlistItem[]> {
  return db.select().from(watchlistItems).where(eq(watchlistItems.userId, userId));
}

/** Replace the whole watchlist for a user (bulk upsert via delete + insert). */
export async function replaceWatchlist(userId: string, items: Array<{ symbol: string; name?: string; addedAt?: number }>): Promise<WatchlistItem[]> {
  return db.transaction(async (tx) => {
    await tx.delete(watchlistItems).where(eq(watchlistItems.userId, userId));
    if (items.length === 0) return [];
    return tx
      .insert(watchlistItems)
      .values(items.map((i) => ({ userId, symbol: i.symbol, name: i.name ?? null, addedAt: i.addedAt ?? Date.now() })))
      .returning();
  });
}

export async function addWatchlistItem(data: NewWatchlistItem): Promise<WatchlistItem> {
  try {
    const [item] = await db
      .insert(watchlistItems)
      .values(data)
      .onConflictDoUpdate({
        target: [watchlistItems.userId, watchlistItems.symbol],
        set: { name: data.name, addedAt: data.addedAt },
      })
      .returning();
    return item;
  } catch {
    // Fallback when unique index is missing in DB (schema not yet pushed/migrated):
    // Check for existing row and return it, or rethrow if it's a different error.
    const [existing] = await db
      .select()
      .from(watchlistItems)
      .where(and(eq(watchlistItems.userId, data.userId), eq(watchlistItems.symbol, data.symbol)));
    if (existing) return existing;
    // Re-attempt plain insert without conflict clause
    const [item] = await db.insert(watchlistItems).values(data).returning();
    return item;
  }
}

export async function removeWatchlistItem(userId: string, symbol: string): Promise<void> {
  await db.delete(watchlistItems).where(and(eq(watchlistItems.userId, userId), eq(watchlistItems.symbol, symbol)));
}
