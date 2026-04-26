/**
 * server/repositories/ordersRepo.ts
 * 訂單生命週期持久化 — 提供 PENDING → PARTIAL → FILLED / CANCELLED / REJECTED 全部
 * 狀態流的記錄與查詢。
 *
 * 設計原則：
 *  - 任一 broker.placeOrder 結果都應寫入；後續 status 變化用 update。
 *  - retryCount / lastError 由 OrderExecutor 維護，repo 只負責讀寫。
 *  - 用 brokerOrderId 作為「broker 端唯一鍵」反查；本系統內仍以 serial id 為主。
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { orders, type OrderRow, type NewOrderRow } from '../../src/db/schema.js';

const OPEN_STATUSES = ['PENDING', 'PARTIAL'] as const;

export const ordersRepo = {
  async create(input: NewOrderRow): Promise<OrderRow> {
    const [row] = await db.insert(orders).values(input).returning();
    return row;
  },

  async update(id: number, patch: Partial<NewOrderRow>): Promise<OrderRow | null> {
    const [row] = await db
      .update(orders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return row ?? null;
  },

  async findByBrokerOrderId(brokerOrderId: string): Promise<OrderRow | null> {
    const [row] = await db.select().from(orders).where(eq(orders.brokerOrderId, brokerOrderId)).limit(1);
    return row ?? null;
  },

  async findByIdForUser(id: number, userId: string): Promise<OrderRow | null> {
    const [row] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId)))
      .limit(1);
    return row ?? null;
  },

  async listByUser(userId: string, limit = 100): Promise<OrderRow[]> {
    return db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(limit);
  },

  async listOpenByUser(userId: string): Promise<OrderRow[]> {
    return db
      .select()
      .from(orders)
      .where(and(eq(orders.userId, userId), inArray(orders.status, [...OPEN_STATUSES])))
      .orderBy(desc(orders.createdAt));
  },

  async cancel(id: number, reason: string): Promise<OrderRow | null> {
    return ordersRepo.update(id, { status: 'CANCELLED', lastError: reason });
  },
};
