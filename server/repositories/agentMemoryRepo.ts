/**
 * server/repositories/agentMemoryRepo.ts
 * 處理 AI 交易記憶的存取，實現進化功能
 */
import { db } from '../../src/db/index.js';
import { agentMemories } from '../../src/db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

export const agentMemoryRepo = {
  /**
   * 存入一條新記憶 (教訓、技能或偏好)
   */
  async saveMemory(userId: string, type: 'PREFERENCE' | 'SKILL' | 'CONTEXT', content: any) {
    return await db.insert(agentMemories).values({
      userId,
      memoryType: type,
      content,
      createdAt: new Date()
    });
  },

  /**
   * 獲取最近的相關記憶
   */
  async getRelevantMemories(userId: string, symbol?: string, limit = 5) {
    // 簡單實作：按時間排序獲取最近的記憶
    // 實務上可根據 content 內的 symbol 進行篩選
    const results = await db.select()
      .from(agentMemories)
      .where(eq(agentMemories.userId, userId))
      .orderBy(desc(agentMemories.createdAt))
      .limit(limit);
    
    return results;
  }
};
