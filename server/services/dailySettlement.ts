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
  
  // 1. 重設風控每日額度
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
