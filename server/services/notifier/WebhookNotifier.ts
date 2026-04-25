/**
 * server/services/notifier/WebhookNotifier.ts
 * target 格式：任一可接收 POST JSON 的 URL
 * payload 為 { subject, body, timestamp }
 */
import type { NotifierChannel } from './index.js';

export const webhookNotifier: NotifierChannel = {
  channel: 'webhook',
  async send(target, subject, body) {
    if (!target.startsWith('http')) return { ok: false, message: 'target 必須為 URL' };
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body, timestamp: new Date().toISOString(), source: 'StockAnalyzeAI' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, message: `Webhook ${res.status}` };
    return { ok: true };
  },
};
