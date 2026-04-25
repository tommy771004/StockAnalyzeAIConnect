/**
 * server/services/notifier/TelegramNotifier.ts
 * target 格式：`<BOT_TOKEN>:<CHAT_ID>`
 * 例：`123456:ABC-DEF...:998877665`
 */
import type { NotifierChannel } from './index.js';

export const telegramNotifier: NotifierChannel = {
  channel: 'telegram',
  async send(target, subject, body) {
    const idx = target.lastIndexOf(':');
    if (idx <= 0) return { ok: false, message: 'target 必須為 BOT_TOKEN:CHAT_ID 格式' };
    const token = target.slice(0, idx);
    const chatId = target.slice(idx + 1);
    const text = `*${subject}*\n${body}`;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, message: `Telegram ${res.status}` };
    return { ok: true };
  },
};
