/**
 * server/services/twCalendar.ts
 * 台灣證交所交易日曆。
 *
 *   - 國定假日 (full close)
 *   - 半日交易 (early close at 12:00) — 例：除夕前一日、農曆春節後首個交易日
 *
 * 主要 API：
 *   isTwHoliday(date)       — 國定假日（不開盤）
 *   getEarlyCloseTime(date) — 若為半日交易回傳 'HH:mm'，否則 null
 *   nextTradingDay(date)    — 找下一個交易日
 *
 * 維護方式：
 *   1. 每年初手動更新 HOLIDAYS_BY_YEAR 常數，資料來源
 *      https://www.twse.com.tw/zh/page/announcement/holidaySchedule.html
 *   2. 預留 fetchAndCache(year) 之後可改為從 TWSE 抓取，
 *      若 fetch 失敗則退回硬編碼資料。
 */

interface YearCalendar {
  /** 完整收盤日（國定假日、補假、調整放假）— ISO 'YYYY-MM-DD' */
  holidays: string[];
  /** 半日交易日 — ISO 'YYYY-MM-DD' → 提早收盤時間 'HH:mm' */
  earlyClose: Record<string, string>;
}

const HOLIDAYS_BY_YEAR: Record<number, YearCalendar> = {
  2026: {
    // 資料來源：證交所 2026 年休市日曆（政府行事曆）
    holidays: [
      '2026-01-01', // 元旦
      '2026-02-16', // 春節初一
      '2026-02-17', // 春節初二
      '2026-02-18', // 春節初三
      '2026-02-19', // 春節初四
      '2026-02-20', // 補假
      '2026-02-27', // 228 連假補休
      '2026-02-28', // 和平紀念日
      '2026-04-03', // 兒童節 / 清明節調整放假
      '2026-04-06', // 清明補假
      '2026-05-01', // 勞動節
      '2026-06-19', // 端午節
      '2026-09-25', // 中秋節
      '2026-10-09', // 國慶連假
      '2026-10-10', // 國慶日
    ],
    earlyClose: {
      '2026-02-13': '12:00', // 除夕前一交易日
    },
  },
  2027: {
    holidays: [
      '2027-01-01', // 元旦
      '2027-02-05', // 春節
      '2027-02-08',
      '2027-02-09',
      '2027-02-10',
      '2027-02-11',
      '2027-02-12',
      '2027-02-26', // 228
      '2027-04-02', // 清明
      '2027-04-05',
      '2027-05-03', // 勞動節（補假）
      '2027-06-08', // 端午
      '2027-09-14', // 中秋
      '2027-10-08', // 國慶補假
      '2027-10-11',
    ],
    earlyClose: {},
  },
};

function toISO(date: Date): string {
  // 以台北時區（UTC+8）取日期，避免 UTC 邊界誤判
  const tpe = new Date(date.getTime() + 8 * 3600 * 1000);
  return tpe.toISOString().slice(0, 10);
}

export function isTwHoliday(date: Date = new Date()): boolean {
  const iso = toISO(date);
  const year = parseInt(iso.slice(0, 4), 10);
  const cal = HOLIDAYS_BY_YEAR[year];
  if (!cal) return false; // 未維護的年度 — 寬鬆處理：不視為假日，請於跨年前更新表
  return cal.holidays.includes(iso);
}

export function getEarlyCloseTime(date: Date = new Date()): string | null {
  const iso = toISO(date);
  const year = parseInt(iso.slice(0, 4), 10);
  const cal = HOLIDAYS_BY_YEAR[year];
  if (!cal) return null;
  return cal.earlyClose[iso] ?? null;
}

export function nextTradingDay(date: Date = new Date()): Date {
  const cursor = new Date(date.getTime());
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  for (let i = 0; i < 14; i++) {
    const tpe = new Date(cursor.getTime() + 8 * 3600 * 1000);
    const dow = tpe.getUTCDay();
    if (dow !== 0 && dow !== 6 && !isTwHoliday(cursor)) return cursor;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cursor;
}

/** 暴露年份覆蓋範圍，供前端／日誌呈現 */
export function getMaintainedYears(): number[] {
  return Object.keys(HOLIDAYS_BY_YEAR).map(n => parseInt(n, 10)).sort();
}
