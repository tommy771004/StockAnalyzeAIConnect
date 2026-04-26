import { db } from '../../src/db/index.js';
import { portfolioHistory } from '../../src/db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { getAllSectorFeatures, type SectorFeatureAggregate } from '../services/analytics/featureStoreService.js';

export interface HistoryRecord {
  userId: string;
  totalEquity: number;
  date: string;
}

/** 取得特定用戶的歷史 NAV 曲線數據 */
export const getHistoryByUser = async (userId: string, limit = 30) => {
  return db.select()
    .from(portfolioHistory)
    .where(eq(portfolioHistory.userId, userId))
    .orderBy(desc(portfolioHistory.date))
    .limit(limit);
};

/** 取得歷史 NAV 並附加最新的產業聚合特徵（供前端 Screener 策略前置篩選使用）。 */
export const getHistoryWithSectorFeatures = async (
  userId: string,
  limit = 30,
): Promise<{ history: Awaited<ReturnType<typeof getHistoryByUser>>; sectorFeatures: SectorFeatureAggregate[] }> => {
  const [history, sectorFeatures] = await Promise.all([
    getHistoryByUser(userId, limit),
    Promise.resolve(getAllSectorFeatures()),
  ]);
  return { history, sectorFeatures };
};

/** 紀錄快照 */
export const recordSnapshot = async (userId: string, totalEquity: number) => {
  const date = new Date().toISOString().split('T')[0];
  // 檢查當天是否已存在紀錄，若存在則更新，否則新增
  const existing = await db.select()
    .from(portfolioHistory)
    .where(and(eq(portfolioHistory.userId, userId), eq(portfolioHistory.date, date)))
    .limit(1);

  if (existing.length > 0) {
    return db.update(portfolioHistory)
      .set({ totalEquity: totalEquity.toString() })
      .where(eq(portfolioHistory.id, existing[0].id));
  } else {
    return db.insert(portfolioHistory)
      .values({ 
        userId, 
        totalEquity: totalEquity.toString(), 
        date 
      });
  }
};
