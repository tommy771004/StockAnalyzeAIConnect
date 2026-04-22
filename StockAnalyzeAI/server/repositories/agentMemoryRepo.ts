/**
 * server/repositories/agentMemoryRepo.ts
 * Drizzle 存取層：Hermes Agent 長期記憶庫
 */
import { db } from '../../src/db/index.js';
import { agentMemories, type AgentMemoryType } from '../../src/db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export interface MemoryEntry {
  id: number;
  userId: string;
  memoryType: AgentMemoryType;
  content: unknown;
  createdAt: Date;
}

/** 取得某使用者所有記憶（依 createdAt 降冪，最多 limit 筆） */
export async function getMemoriesByUser(
  userId: string,
  limit = 50,
): Promise<MemoryEntry[]> {
  const rows = await db
    .select()
    .from(agentMemories)
    .where(eq(agentMemories.userId, userId))
    .orderBy(desc(agentMemories.createdAt))
    .limit(limit);

  return rows as MemoryEntry[];
}

/** 依類型篩選記憶 */
export async function getMemoriesByType(
  userId: string,
  memoryType: AgentMemoryType,
  limit = 20,
): Promise<MemoryEntry[]> {
  const rows = await db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.userId, userId), eq(agentMemories.memoryType, memoryType)))
    .orderBy(desc(agentMemories.createdAt))
    .limit(limit);

  return rows as MemoryEntry[];
}

/** 新增一筆記憶 */
export async function createMemory(params: {
  userId: string;
  memoryType: AgentMemoryType;
  content: unknown;
}): Promise<MemoryEntry> {
  const [row] = await db
    .insert(agentMemories)
    .values({
      userId:     params.userId,
      memoryType: params.memoryType,
      content:    params.content as Record<string, unknown>,
    })
    .returning();

  return row as MemoryEntry;
}

/** 刪除單筆記憶 */
export async function deleteMemory(id: number, userId: string): Promise<void> {
  await db
    .delete(agentMemories)
    .where(and(eq(agentMemories.id, id), eq(agentMemories.userId, userId)));
}
