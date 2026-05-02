/**
 * server/services/notifier/index.ts
 * 通知派發中心 — 將 AI 自動化交易事件推送到使用者設定的通道。
 *
 * 設計：
 *  - dispatch(userId, event, payload)：根據 notification_settings 找出該使用者
 *    所有 enabled 且 triggers 包含 event 的通道，平行送出。
 *  - 任何通道失敗都不會把例外往上拋（避免影響 agent loop）。
 *  - 所有通道介面統一為 NotifierChannel.send(target, message)。
 *
 * 支援事件：
 *   'kill_switch'   — Kill Switch 觸發
 *   'risk_block'    — 訂單被 RiskManager 攔截
 *   'fill'          — 訂單成交
 *   'daily_report'  — 每日結算
 */
import { db } from '../../../src/db/index.js';
import { notificationSettings } from '../../../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { telegramNotifier } from './TelegramNotifier.js';
import { discordNotifier } from './DiscordNotifier.js';
import { webhookNotifier } from './WebhookNotifier.js';
import { emailNotifier } from './EmailNotifier.js';

export type NotifyEvent = 'kill_switch' | 'risk_block' | 'fill' | 'daily_report';
export type ExtendedNotifyEvent = NotifyEvent | 'stop_loss_intercept' | 'quantum_forced_liquidation' | 'margin_call';

export interface NotifierChannel {
  channel: string;
  send(target: string, subject: string, body: string): Promise<{ ok: boolean; message?: string }>;
}

const CHANNELS: Record<string, NotifierChannel> = {
  telegram: telegramNotifier,
  discord: discordNotifier,
  webhook: webhookNotifier,
  email: emailNotifier,
};

interface SettingRow {
  id: number;
  channel: string;
  target: string;
  enabled: boolean;
  triggers: unknown;
}

function formatMessage(event: ExtendedNotifyEvent, payload: Record<string, unknown>): { subject: string; body: string } {
  switch (event) {
    case 'kill_switch':
      return {
        subject: '🚨 Kill Switch 已觸發',
        body: `AI 自動交易已緊急停止。\n原因：${payload.reason ?? '使用者手動觸發'}`,
      };
    case 'risk_block':
      return {
        subject: '🛑 訂單被風控攔截',
        body: `${payload.symbol} ${payload.side} ${payload.qty}\n原因：${payload.reason}`,
      };
    case 'fill':
      return {
        subject: `✅ 訂單成交 ${payload.symbol}`,
        body: `${payload.side} ${payload.qty} @ ${payload.price}`,
      };
    case 'daily_report':
      return {
        subject: '📊 AI 自動交易每日報告',
        body: typeof payload.text === 'string' ? payload.text : JSON.stringify(payload),
      };
    case 'stop_loss_intercept':
      return {
        subject: `🛑 停損攔截 ${payload.symbol ?? ''}`.trim(),
        body: `標的：${payload.symbol ?? 'UNKNOWN'}\n原因：${payload.reason ?? 'stop loss triggered'}\n價格：${payload.price ?? '-'}`,
      };
    case 'quantum_forced_liquidation':
      return {
        subject: `⚛️ 量子強制平倉 ${payload.symbol ?? ''}`.trim(),
        body: `標的：${payload.symbol ?? 'UNKNOWN'}\n原因：${payload.reason ?? 'quantum risk gate'}\n信心度：${payload.confidence ?? '-'}\nregime_flip_prob：${payload.regimeFlipProb ?? '-'}`,
      };
    case 'margin_call':
      return {
        subject: `⚠️ 期貨保證金警示 ${payload.symbol ?? ''}`.trim(),
        body: [
          `「${payload.symbol ?? '期貨'}${payload.contractCount ? ` ×${payload.contractCount}口` : ''}」`,
          `維持保證金缺口：${payload.shortfallTwd ? `${Number(payload.shortfallTwd).toLocaleString()} TWD` : '-'}`,
          `缺口比例：${payload.shortfallPct ? `${Number(payload.shortfallPct).toFixed(1)}%` : '-'}`,
          payload.autoReduced ? `✅ 已自動減碼 ${payload.autoReduced} 口` : `⚠️ 建議手動減碼或補足保證金`,
        ].join('\n'),
      };
  }
}

export const notifier = {
  async dispatch(userId: string, event: ExtendedNotifyEvent, payload: Record<string, unknown>): Promise<void> {
    let rows: SettingRow[] = [];
    try {
      rows = await db.select().from(notificationSettings)
        .where(and(eq(notificationSettings.userId, userId), eq(notificationSettings.enabled, true))) as SettingRow[];
    } catch (e) {
      // DB 不可用或表尚未 migrate — 不影響 agent loop
      console.warn('[notifier] DB lookup 失敗：', (e as Error).message);
      return;
    }

    const targets = rows.filter(r => Array.isArray(r.triggers) && (r.triggers as string[]).includes(event));
    if (targets.length === 0) return;

    const { subject, body } = formatMessage(event, payload);
    await Promise.all(targets.map(async row => {
      const ch = CHANNELS[row.channel];
      if (!ch) return;
      try {
        await ch.send(row.target, subject, body);
      } catch (e) {
        console.warn(`[notifier] ${row.channel} 推送失敗：`, (e as Error).message);
      }
    }));
  },

  /** 測試用：直接以指定 channel + target 送一條訊息（不查 DB） */
  async test(channel: string, target: string, body = '這是一則測試訊息（StockAnalyzeAI）'): Promise<{ ok: boolean; message?: string }> {
    const ch = CHANNELS[channel];
    if (!ch) return { ok: false, message: `未支援通道 ${channel}` };
    return ch.send(target, '🔔 通道測試', body);
  },
};
