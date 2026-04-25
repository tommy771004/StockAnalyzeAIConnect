import fetch from 'node-fetch';

export interface WantGooChipData {
  mainPlayersNet: number;      // 主力買賣超
  brokerDiff: number;          // 家數差
  concentration5d: number;     // 5日籌碼集中度
  concentration20d: number;    // 20日籌碼集中度
  foreignNet: number;          // 外資買賣超
  trustNet: number;            // 投信買賣超
  dealerNet: number;           // 自營商買賣超
  holder400Pct: number;        // 400張大戶持股比
  holder1000Pct: number;       // 1000張大戶持股比
  foreignPct: number;          // 外資持股比
  trustPct: number;            // 投信持股比
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch "Chip" (籌碼) data from WantGoo for Taiwan stocks.
 */
export async function getChipData(symbol: string): Promise<WantGooChipData | null> {
  const code = symbol.replace(/\.(TW|TWO)$/i, '');
  if (!/^\d{4,6}$/.test(code)) return null;

  try {
    // WantGoo's "Main Trend" page has Main Players Net and Concentration
    const mainTrendUrl = `https://www.wantgoo.com/stock/${code}/major-investors/main-trend`;
    const instTrendUrl = `https://www.wantgoo.com/stock/${code}/institutional-investors/trend`;
    const concentrationUrl = `https://www.wantgoo.com/stock/${code}/major-investors/concentration`;

    const [mainRes, instRes, concRes] = await Promise.all([
      fetch(mainTrendUrl, { headers: { 'User-Agent': UA } }).then(r => r.text()),
      fetch(instTrendUrl, { headers: { 'User-Agent': UA } }).then(r => r.text()),
      fetch(concentrationUrl, { headers: { 'User-Agent': UA } }).then(r => r.text()),
    ]);

    // Simple regex-based extraction for speed and low overhead
    // In a real production app, use a proper HTML parser like cheerio
    
    // 1. Extract from Main Trend (主力、集中度)
    // We look for the first row of the table which usually contains the latest data
    const mainPlayersNet = extractNumber(mainRes, /主力買賣超.*?<td.*?>([\d,.-]+)<\/td>/s) || 0;
    const brokerDiff = extractNumber(mainRes, /家數差.*?<td.*?>([\d,.-]+)<\/td>/s) || 0;
    const concentration5d = extractNumber(mainRes, /5日集中度.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0;
    const concentration20d = extractNumber(mainRes, /20日集中度.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0;

    // 2. Extract from Institutional Trend (三大法人)
    const foreignNet = extractNumber(instRes, /外資買賣超.*?<td.*?>([\d,.-]+)<\/td>/s) || 0;
    const trustNet = extractNumber(instRes, /投信買賣超.*?<td.*?>([\d,.-]+)<\/td>/s) || 0;
    const dealerNet = extractNumber(instRes, /自營商買賣超.*?<td.*?>([\d,.-]+)<\/td>/s) || 0;

    // 3. Extract from Concentration (大戶持股)
    const holder400Pct = extractNumber(concRes, /400張大戶持股比.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0;
    const holder1000Pct = extractNumber(concRes, /1000張大戶持股比.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0;
    const foreignPct = extractNumber(concRes, /外資持股比.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0;
    const trustPct = extractNumber(concRes, /投信持股比.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0;

    return {
      mainPlayersNet,
      brokerDiff,
      concentration5d,
      concentration20d,
      foreignNet,
      trustNet,
      dealerNet,
      holder400Pct,
      holder1000Pct,
      foreignPct,
      trustPct,
    };
  } catch (e) {
    console.error(`[WantGooService] Error fetching data for ${code}:`, e);
    return null;
  }
}

function extractNumber(html: string, regex: RegExp): number | null {
  const match = html.match(regex);
  if (!match) return null;
  // Remove commas and percent signs
  const val = match[1].replace(/,/g, '').replace(/%/g, '');
  return parseFloat(val);
}
