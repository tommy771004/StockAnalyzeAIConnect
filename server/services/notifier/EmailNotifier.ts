/**
 * server/services/notifier/EmailNotifier.ts
 * Stub — 之後接 SES / SendGrid / Resend / SMTP。
 * 目前若有 RESEND_API_KEY 環境變數，就用 Resend HTTPS API 發送，
 * 沒設定就靜默成功（log only）。
 *
 * target 格式：收件人 email 字串
 */
import type { NotifierChannel } from './index.js';

export const emailNotifier: NotifierChannel = {
  channel: 'email',
  async send(target, subject, body) {
    const env = process.env as Record<string, string | undefined>;
    const apiKey = env.RESEND_API_KEY;
    const from = env.RESEND_FROM ?? 'noreply@stockanalyze.ai';
    if (!apiKey) {
      console.log(`[EmailNotifier] (no RESEND_API_KEY) → ${target}: ${subject}`);
      return { ok: true, message: 'log only — RESEND_API_KEY 未設定' };
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [target], subject, text: body }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, message: `Resend ${res.status}` };
    return { ok: true };
  },
};
