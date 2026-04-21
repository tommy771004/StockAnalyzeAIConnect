/**
 * server/repositories/alertsRepo.ts
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { alerts, type Alert, type NewAlert } from '../../src/db/schema.js';

export async function getAlertsByUser(userId: string): Promise<Alert[]> {
  return db.select().from(alerts).where(eq(alerts.userId, userId));
}

export async function createAlert(userId: string, data: Omit<NewAlert, 'userId'>): Promise<Alert> {
  const [alert] = await db
    .insert(alerts)
    .values({ ...data, userId })
    .returning();
  return alert;
}

export async function markAlertTriggered(userId: string, id: number, price: number): Promise<Alert | undefined> {
  const [updated] = await db
    .update(alerts)
    .set({ triggered: true, triggeredAt: new Date(), triggeredPrice: String(price) })
    .where(and(eq(alerts.id, id), eq(alerts.userId, userId)))
    .returning();
  return updated;
}

export async function deleteAlert(userId: string, id: number): Promise<boolean> {
  const result = await db
    .delete(alerts)
    .where(and(eq(alerts.id, id), eq(alerts.userId, userId)))
    .returning({ id: alerts.id });
  return result.length > 0;
}

/** Get all untriggered alerts across all users — used by the polling job. */
export async function getAllPendingAlerts(): Promise<Alert[]> {
  return db.select().from(alerts).where(eq(alerts.triggered, false));
}
