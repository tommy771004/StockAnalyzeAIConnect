/**
 * server/services/notifier/DiscordNotifier.ts
 * target 格式：完整 Discord webhook URL
 * 例：https://discord.com/api/webhooks/123/abc...
 */
import type { NotifierChannel } from './index.js';

export const discordNotifier: NotifierChannel = {
  channel: 'discord',
  async send(target, subject, body) {
    if (!target.startsWith('https://')) {
      return { ok: false, message: 'target 必須為 Discord webhook URL' };
    }
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: subject,
          description: body,
          color: 0x6366f1,
          timestamp: new Date().toISOString(),
        }],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, message: `Discord ${res.status}` };
    return { ok: true };
  },
};
