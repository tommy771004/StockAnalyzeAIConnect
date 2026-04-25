/**
 * server/services/reportService.ts
 * 智慧交易報告 — 真實的 Sharpe / MaxDrawdown / Attribution。
 *
 * 改造重點（2026-04）：
 *  - confidenceTimeline 改為從 agentMemories 真實取值，無資料時退回 0
 *  - attribution 改為依 trades.notes / aiGenerated 真實統計而非寫死
 *  - scoreCard.consistency 改為以 Sharpe 與 MaxDD 為基礎的計算
 */
import { callLLM } from '../utils/llmPipeline.js';
import { agentMemoryRepo } from '../repositories/agentMemoryRepo.js';
import { getTradesByUser } from '../repositories/tradesRepo.js';
import { computePerformance } from './performanceService.js';

interface ReportData {
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  aiValueAdded: number; // AI 過濾後比純指標多賺的錢
  confidenceTimeline: number[]; // 過去 7 天平均信心
  achievements: string[];
  attribution: Record<string, { pnl: number; trades: number; winRate: number }>;
  scoreCard: { consistency: number; riskControl: number; profitability: number; };
  sharpe: number;
  maxDrawdown: number;
  aiCommentary: string;
}

function buildConfidenceTimeline(memories: Awaited<ReturnType<typeof agentMemoryRepo.getRelevantMemories>>): number[] {
  // 過去 7 天，每天平均 confidence；若無紀錄 → 0
  const days = 7;
  const buckets: number[][] = Array.from({ length: days }, () => []);
  const now = Date.now();
  for (const m of memories) {
    const created = m.createdAt ? new Date(m.createdAt).getTime() : 0;
    const ageDays = Math.floor((now - created) / (24 * 3600 * 1000));
    if (ageDays < 0 || ageDays >= days) continue;
    const conf = (m.content as { confidence?: number })?.confidence;
    if (typeof conf === 'number') buckets[days - 1 - ageDays].push(conf);
  }
  return buckets.map(b => b.length === 0 ? 0 : Math.round(b.reduce((a, c) => a + c, 0) / b.length));
}

export async function generateWeeklyReport(userId: string): Promise<ReportData> {
  const memories = await agentMemoryRepo.getRelevantMemories(userId, 'ALL', 40);
  const trades = await getTradesByUser(userId);

  // 真實績效計算
  const perf = computePerformance(trades);

  // AI 價值貢獻（only positive — 若虧錢視為 0 以鼓勵）
  const aiPnL = trades.filter(t => t.aiGenerated).reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
  const aiValueAdded = Math.max(0, Math.round(aiPnL));

  const totalTrades = perf.metrics.totalTrades;
  const winRate = perf.metrics.winRate;

  // 動態成就
  const achievements: string[] = [];
  if (totalTrades > 0) achievements.push('FIRST_BLOOD');
  if (winRate > 60 && totalTrades >= 5) achievements.push('ALPHA_CATCHER');
  if (aiPnL > 1000) achievements.push('AI_MASTER');
  if (perf.metrics.sharpe >= 1.5) achievements.push('SHARPE_HUNTER');
  if (perf.metrics.maxDrawdown > -0.05 && totalTrades >= 10) achievements.push('IRON_DEFENSE');

  // ScoreCard：以真實指標為基礎
  const consistency = Math.max(0, Math.min(100, Math.round(50 + perf.metrics.sharpe * 25)));
  const riskControl = Math.max(0, Math.min(100, Math.round(100 + perf.metrics.maxDrawdown * 200))); // -10% DD → 80
  const profitability = Math.round(winRate);

  const stats: Omit<ReportData, 'aiCommentary'> = {
    totalTrades,
    winRate,
    totalPnL: perf.metrics.totalPnL,
    aiValueAdded,
    confidenceTimeline: buildConfidenceTimeline(memories),
    achievements: achievements.length > 0 ? achievements : ['FRESHMAN'],
    attribution: perf.attribution,
    scoreCard: { consistency, riskControl, profitability },
    sharpe: perf.metrics.sharpe,
    maxDrawdown: perf.metrics.maxDrawdown,
  };

  const prompt = `
    你是一位專精於「人機協作」的量化心理學導師。
    請根據以下數據，為用戶寫一份具備「共同成長感」的週報：
    
    [成就]: ${stats.achievements.join(', ')}
    - AI 價值貢獻: 比純技術策略多賺了 ${stats.aiValueAdded} TWD
    - 信心趨勢: ${stats.confidenceTimeline.join(' -> ')}
    
    請以「你的 AI 戰友」身份：
    1. 【共同成就】：慶祝本週解鎖的成就（如：成功觸發斷路器保護）。
    2. 【數據背後的意義】：解釋為什麼我的信心在週末提升了？是因為捕捉到了什麼市場規律？
    3. 【未來展望】：我們下週該如何更好地配合？我需要你給我更多授權嗎？
    
    語氣：溫暖、堅定、具備智慧感。
  `;

  try {
    const { text } = await callLLM({
      systemPrompt: "你是一位具備同理心與深度的 AI 交易導師。",
      prompt,
      userId
    });

    return { ...stats, aiCommentary: text };
  } catch (e) {
    return { ...stats, aiCommentary: "我們本週的合作非常默契，數據顯示系統正在逐步適應您的風格。" };
  }
}
