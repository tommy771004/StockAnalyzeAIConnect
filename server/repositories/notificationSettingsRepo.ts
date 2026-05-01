/**
 * server/repositories/notificationSettingsRepo.ts
 * AutoTrading 通知設定 CRUD
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { notificationSettings, type NotificationSetting } from '../../src/db/schema.js';

export type NotifyEvent =
  | 'kill_switch'
  | 'risk_block'
  | 'fill'
  | 'daily_report'
  | 'stop_loss_intercept'
  | 'quantum_forced_liquidation';

export interface NotificationSettingInput {
  channel: string;
  target: string;
  triggers: NotifyEvent[];
  enabled?: boolean;
}

export async function listNotificationSettingsByUser(userId: string): Promise<NotificationSetting[]> {
  return db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .orderBy(desc(notificationSettings.createdAt));
}

export async function upsertNotificationSettingByTarget(userId: string, input: NotificationSettingInput): Promise<NotificationSetting> {
  const [existing] = await db
    .select()
    .from(notificationSettings)
    .where(
      and(
        eq(notificationSettings.userId, userId),
        eq(notificationSettings.channel, input.channel),
        eq(notificationSettings.target, input.target),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(notificationSettings)
      .set({
        triggers: input.triggers,
        enabled: input.enabled ?? true,
      })
      .where(eq(notificationSettings.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(notificationSettings)
    .values({
      userId,
      channel: input.channel,
      target: input.target,
      triggers: input.triggers,
      enabled: input.enabled ?? true,
    })
    .returning();

  return created;
}

export async function deleteNotificationSettingByUser(userId: string, id: number): Promise<boolean> {
  const rows = await db
    .delete(notificationSettings)
    .where(and(eq(notificationSettings.id, id), eq(notificationSettings.userId, userId)))
    .returning({ id: notificationSettings.id });
  return rows.length > 0;
}
