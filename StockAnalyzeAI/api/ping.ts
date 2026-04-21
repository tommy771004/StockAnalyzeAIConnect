/**
 * 獨立診斷端點：不經過 Express / 不 import server.ts。
 * 若 /api/ping 回 200 但 /api/health 回 500，問題在 Express app 初始化。
 * 若 /api/ping 也 500，問題在 Vercel function runtime / 設定。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    pong: true,
    time: new Date().toISOString(),
    vercel: !!(process.env.VERCEL || process.env.VERCEL_ENV),
    region: process.env.VERCEL_REGION ?? null,
    node: process.version,
  });
}
