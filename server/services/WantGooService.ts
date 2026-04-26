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

// ── 三大法人 OpenAPI fallback (TWSE / TPEX 官方來源) ─────────────────────────────
// 比 WantGoo HTML scrape 穩定，但僅提供三大法人買賣超欄位；其餘欄位 (集中度、家數差、
// 大戶持股比) 不在 OpenAPI 中，無法 fallback 取得，會以 0 呈現。
interface InstFlowCache {
  byCode: Map<string, { foreign: number; trust: number; dealer: number }>;
  fetchedAt: number;
}
const INST_CACHE_TTL = 30 * 60 * 1000; // 30 min
let _instCache: InstFlowCache | null = null;

async function fetchInstitutionalFlows(): Promise<InstFlowCache> {
  if (_instCache && Date.now() - _instCache.fetchedAt < INST_CACHE_TTL) {
    return _instCache;
  }

  const byCode = new Map<string, { foreign: number; trust: number; dealer: number }>();

  // TWSE: 三大法人買賣超日報 (上市)
  try {
    const r = await fetch('https://openapi.twse.com.tw/v1/fund/T86', {
      headers: { 'Accept': 'application/json', 'User-Agent': UA },
    });
    if (r.ok) {
      const arr = await r.json() as Array<Record<string, string>>;
      for (const row of arr) {
        const code = row['證券代號'] ?? row.SecuritiesCompanyCode;
        if (!code) continue;
        const foreign = parseFloat((row['外陸資買賣超股數(不含外資自營商)'] ?? row['外資買賣超股數'] ?? '0').replace(/,/g, '')) || 0;
        const trust = parseFloat((row['投信買賣超股數'] ?? '0').replace(/,/g, '')) || 0;
        const dealer = parseFloat((row['自營商買賣超股數'] ?? '0').replace(/,/g, '')) || 0;
        // OpenAPI 是 "股", 換算為「張」(1 張 = 1000 股)
        byCode.set(code, {
          foreign: Math.round(foreign / 1000),
          trust:   Math.round(trust / 1000),
          dealer:  Math.round(dealer / 1000),
        });
      }
    }
  } catch (e) {
    console.warn('[WantGoo/fallback] TWSE T86 failed:', (e as Error).message);
  }

  // TPEX: 三大法人買賣超 (上櫃)
  try {
    const r = await fetch('https://www.tpex.org.tw/openapi/v1/tpex_three_investors_listed', {
      headers: { 'Accept': 'application/json', 'User-Agent': UA },
    });
    if (r.ok) {
      const arr = await r.json() as Array<Record<string, string>>;
      for (const row of arr) {
        const code = row['SecuritiesCompanyCode'] ?? row['證券代號'];
        if (!code) continue;
        const foreign = parseFloat((row['ForeignInvestorNetBuySell'] ?? row['外陸資買賣超股數'] ?? '0').replace(/,/g, '')) || 0;
        const trust = parseFloat((row['InvestmentTrustNetBuySell'] ?? row['投信買賣超股數'] ?? '0').replace(/,/g, '')) || 0;
        const dealer = parseFloat((row['DealerNetBuySell'] ?? row['自營商買賣超股數'] ?? '0').replace(/,/g, '')) || 0;
        byCode.set(code, {
          foreign: Math.round(foreign / 1000),
          trust:   Math.round(trust / 1000),
          dealer:  Math.round(dealer / 1000),
        });
      }
    }
  } catch (e) {
    console.warn('[WantGoo/fallback] TPEX investors failed:', (e as Error).message);
  }

  _instCache = { byCode, fetchedAt: Date.now() };
  return _instCache;
}

/**
 * Fetch "Chip" (籌碼) data for Taiwan stocks.
 *
 * 主來源：玩股網 HTML scrape (易被 Cloudflare 阻擋)
 * 備援：TWSE / TPEX 三大法人買賣超 OpenAPI (官方來源穩定但欄位較少)
 */
export async function getChipData(symbol: string): Promise<WantGooChipData | null> {
  const code = symbol.replace(/\.(TW|TWO)$/i, '');
  if (!/^\d{4,6}$/.test(code)) return null;

  const empty: WantGooChipData = {
    mainPlayersNet: 0,
    brokerDiff: 0,
    concentration5d: 0,
    concentration20d: 0,
    foreignNet: 0,
    trustNet: 0,
    dealerNet: 0,
    holder400Pct: 0,
    holder1000Pct: 0,
    foreignPct: 0,
    trustPct: 0,
  };

  let parsed: WantGooChipData = { ...empty };
  let allZero = true;

  try {
    const mainTrendUrl = `https://www.wantgoo.com/stock/${code}/major-investors/main-trend`;
    const instTrendUrl = `https://www.wantgoo.com/stock/${code}/institutional-investors/trend`;
    const concentrationUrl = `https://www.wantgoo.com/stock/${code}/major-investors/concentration`;

    const [mainRes, instRes, concRes] = await Promise.all([
      fetch(mainTrendUrl, { headers: { 'User-Agent': UA } }).then(r => r.text()).catch(() => ''),
      fetch(instTrendUrl, { headers: { 'User-Agent': UA } }).then(r => r.text()).catch(() => ''),
      fetch(concentrationUrl, { headers: { 'User-Agent': UA } }).then(r => r.text()).catch(() => ''),
    ]);

    parsed = {
      mainPlayersNet:  extractNumber(mainRes, /主力買賣超.*?<td.*?>([\d,.-]+)<\/td>/s) || 0,
      brokerDiff:      extractNumber(mainRes, /家數差.*?<td.*?>([\d,.-]+)<\/td>/s) || 0,
      concentration5d: extractNumber(mainRes, /5日集中度.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0,
      concentration20d:extractNumber(mainRes, /20日集中度.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0,
      foreignNet:      extractNumber(instRes, /外資買賣超.*?<td.*?>([\d,.-]+)<\/td>/s) || 0,
      trustNet:        extractNumber(instRes, /投信買賣超.*?<td.*?>([\d,.-]+)<\/td>/s) || 0,
      dealerNet:       extractNumber(instRes, /自營商買賣超.*?<td.*?>([\d,.-]+)<\/td>/s) || 0,
      holder400Pct:    extractNumber(concRes, /400張大戶持股比.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0,
      holder1000Pct:   extractNumber(concRes, /1000張大戶持股比.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0,
      foreignPct:      extractNumber(concRes, /外資持股比.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0,
      trustPct:        extractNumber(concRes, /投信持股比.*?<td.*?>([\d,.-]+)%?<\/td>/s) || 0,
    };

    allZero = Object.values(parsed).every(v => v === 0);
  } catch (e) {
    console.error(`[WantGooService] Error fetching data for ${code}:`, e);
  }

  // 若 WantGoo 全部抓不到 (Cloudflare blocked)，補上官方 OpenAPI 的三大法人買賣超
  if (allZero) {
    try {
      const cache = await fetchInstitutionalFlows();
      const flow = cache.byCode.get(code);
      if (flow) {
        parsed.foreignNet = flow.foreign;
        parsed.trustNet = flow.trust;
        parsed.dealerNet = flow.dealer;
        return parsed;
      }
    } catch (e) {
      console.warn(`[WantGooService] OpenAPI fallback failed for ${code}:`, (e as Error).message);
    }
    // 任何來源都沒有資料 → 回傳 null 讓前端隱藏面板
    return null;
  }

  return parsed;
}

function extractNumber(html: string, regex: RegExp): number | null {
  if (!html) return null;
  const match = html.match(regex);
  if (!match) return null;
  // Remove commas and percent signs
  const val = match[1].replace(/,/g, '').replace(/%/g, '');
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : null;
}
