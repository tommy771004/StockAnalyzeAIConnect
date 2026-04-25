/**
 * server/services/tradingSession.ts
 * 盤前盤後守門 — 判斷指定 symbol 在指定時間是否處於盤中交易時段。
 *
 * 規則：
 *  - 台股 (.TW / .TWO)：09:00–13:30 台北時間，週一到週五。
 *  - 美股：09:30–16:00 美東時間（換算成台北時間 21:30–04:00 跨日）。
 *  - 其他（加密貨幣、未指定）：永遠視為開市。
 *
 * 注意：本檔案僅判斷「常規交易時段」，國定假日、提早收盤等特殊日曆需在
 * 後續整合台股交易日曆 API 後再加強。
 */

export type MarketKind = 'TW' | 'US' | 'OTHER';

export function classifySymbol(symbol: string): MarketKind {
  const s = symbol.toUpperCase();
  if (s.endsWith('.TW') || s.endsWith('.TWO')) return 'TW';
  if (/^[A-Z]{1,5}$/.test(s)) return 'US';
  return 'OTHER';
}

interface SessionWindow {
  start: string; // HH:mm
  end: string;   // HH:mm
}

const TW_DEFAULT: SessionWindow = { start: '09:00', end: '13:30' };
const US_DEFAULT_TPE: { start: string; end: string } = { start: '21:30', end: '04:00' };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(n => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

function nowInTaipei(now: Date = new Date()): { weekday: number; minutes: number } {
  // 將任意 UTC 時間轉為台北時區（UTC+8）— 直接以 UTC 加 8h 後讀小時/分。
  const tpe = new Date(now.getTime() + 8 * 3600 * 1000);
  const weekday = tpe.getUTCDay(); // 0 (Sun) – 6 (Sat)
  return { weekday, minutes: tpe.getUTCHours() * 60 + tpe.getUTCMinutes() };
}

export interface SessionCheck {
  open: boolean;
  reason: string;
  market: MarketKind;
}

export function isTradingSession(
  symbol: string,
  override?: { start?: string; end?: string },
  now: Date = new Date(),
): SessionCheck {
  const market = classifySymbol(symbol);
  const { weekday, minutes } = nowInTaipei(now);

  // 週末
  if (weekday === 0 || weekday === 6) {
    return { open: market === 'OTHER', reason: '週末非交易日', market };
  }

  if (market === 'OTHER') return { open: true, reason: '24h 市場', market };

  let win: SessionWindow;
  if (market === 'TW') {
    win = { start: override?.start ?? TW_DEFAULT.start, end: override?.end ?? TW_DEFAULT.end };
    const startM = toMinutes(win.start);
    const endM = toMinutes(win.end);
    const open = minutes >= startM && minutes < endM;
    return {
      open,
      reason: open ? `台股盤中 (${win.start}-${win.end})` : `台股非交易時間 (${win.start}-${win.end})`,
      market,
    };
  }

  // US 市場：09:30–16:00 ET，對應台北 21:30–次日 04:00
  win = { start: US_DEFAULT_TPE.start, end: US_DEFAULT_TPE.end };
  const startM = toMinutes(win.start);
  const endM = toMinutes(win.end);
  const open = minutes >= startM || minutes < endM;
  return {
    open,
    reason: open ? `美股盤中 (台北 ${win.start}-次日 ${win.end})` : '美股非交易時間',
    market,
  };
}

/** 任一 symbol 處於盤中即返回 true，全部都收盤才回 false。 */
export function anyMarketOpen(symbols: string[], override?: { start?: string; end?: string }, now: Date = new Date()): boolean {
  return symbols.some(s => isTradingSession(s, override, now).open);
}
