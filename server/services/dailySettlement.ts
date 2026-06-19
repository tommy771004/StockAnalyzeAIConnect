import { riskManager } from './RiskManager.js';
import { generateWeeklyReport } from './reportService.js';
import { notifier } from './notifier/index.js';

let lastSettledDate = '';

export function startDailySettlementSchedule() {
  console.log('[DailySettlement] 啟動每日結算排程');
  // 每 1 分鐘檢查一次
  setInterval(async () => {
    const now = new Date();
    // 轉換為台北時間 (UTC+8)
    const tpeTime = new Date(now.getTime() + 8 * 3600 * 1000);
    const dateStr = tpeTime.toISOString().split('T')[0];
    const hour = tpeTime.getUTCHours();
    const minute = tpeTime.getUTCMinutes();

    // 判斷是否過下午 1:30 (13:30) 台股收盤
    if (hour > 13 || (hour === 13 && minute >= 30)) {
      if (lastSettledDate !== dateStr) {
        lastSettledDate = dateStr;
        await executeDailySettlement(dateStr);
      }
    }
  }, 60 * 1000);
}

async function executeDailySettlement(date: string) {
  console.log(`[DailySettlement] 執行每日結算: ${date}`);
  
  // 1. EOD 回撤疲勞保護：先結算當日回撤（連續多日超標會自動啟動 Kill Switch），再重設每日額度
  const fatigue = riskManager.settleDailyDrawdown();
  if (fatigue.fatigueTriggered) {
    console.warn(`[DailySettlement] 操作者回撤疲勞保護觸發（連續 ${fatigue.consecutiveDays} 日），已啟動 Kill Switch`);
    try {
      await notifier.dispatch('system', 'daily_report', {
        title: '⚠️ 回撤疲勞保護觸發',
        content: `連續 ${fatigue.consecutiveDays} 日回撤超標，已自動啟動 Kill Switch 暫停交易，需人工檢視後解除。`,
        data: { consecutiveDays: fatigue.consecutiveDays, drawdownPct: fatigue.drawdownPct },
      });
    } catch (err) {
      console.error('[DailySettlement] 疲勞保護通知失敗:', err);
    }
  }
  riskManager.resetDaily();

  // 2. 產生報告並發送通知 (預設 userId='system')
  try {
    const report = await generateWeeklyReport('system'); 
    
    await notifier.dispatch('system', 'daily_report', {
      title: `每日結算報告 (${date})`,
      content: `本日總結:\n勝率: ${report.winRate}%\n已實現損益: ${report.totalPnL}\n日風險重置已完成。`,
      data: report
    });
  } catch (err) {
    console.error(`[DailySettlement] 結算報告生成失敗:`, err);
  }
}
