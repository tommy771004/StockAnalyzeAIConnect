/**
 * server/repositories/settingsRepo.ts
 * Key-value settings stored as JSONB.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { userSettings } from '../../src/db/schema.js';

export async function getSetting<T = unknown>(userId: string, key: string): Promise<T | null> {
  const row = await db.query.userSettings.findFirst({
    where: and(eq(userSettings.userId, userId), eq(userSettings.key, key)),
  });
  if (!row) return null;
  return row.value as T;
}

export async function getAllSettings(userId: string): Promise<Record<string, unknown>> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(userId: string, key: string, value: unknown): Promise<void> {
  await db
    .insert(userSettings)
    .values({ userId, key, value: value as any, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.key],
      set: { value: value as any, updatedAt: new Date() },
    });
}

export async function deleteSetting(userId: string, key: string): Promise<void> {
  await db.delete(userSettings).where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)));
}
