import fetch from 'node-fetch';

export interface Sector {
  id: string;
  name: string;
}

/**
 * Map WantGoo 行業指數 ID → 證交所/櫃買中心公佈的「產業類別」中文字串，
 * 用於以 TWSE/TPEX OpenAPI 取代被 Cloudflare 阻擋的 WantGoo HTML 抓取。
 *
 * 上市資料：https://openapi.twse.com.tw/v1/opendata/t187ap03_L
 * 上櫃資料：https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O
 */
const TWSE_INDUSTRY_BY_ID: Record<string, string> = {
  '^011': '水泥工業',
  '^012': '食品工業',
  '^013': '塑膠工業',
  '^014': '紡織纖維',
  '^015': '電機機械',
  '^016': '電器電纜',
  '^017': '化學工業',
  '^018': '生技醫療業',
  '^019': '玻璃陶瓷',
  '^020': '造紙工業',
  '^021': '鋼鐵工業',
  '^022': '橡膠工業',
  '^023': '汽車工業',
  '^024': '半導體業',
  '^025': '電腦及週邊設備業',
  '^026': '光電業',
  '^027': '通信網路業',
  '^028': '電子零組件業',
  '^029': '電子通路業',
  '^030': '資訊服務業',
  '^031': '其他電子業',
  '^032': '建材營造業',
  '^033': '航運業',
  '^034': '觀光餐旅',
  '^035': '金融保險業',
  '^036': '貿易百貨業',
  '^037': '油電燃氣業',
  '^038': '其他業',
};

const TPEX_INDUSTRY_BY_ID: Record<string, string> = {
  '^048': '生技醫療',
  '^052': '半導體業',
  '^053': '電腦及週邊設備業',
  '^054': '光電業',
  '^055': '通信網路業',
  '^056': '電子零組件業',
  '^057': '電子通路業',
  '^058': '資訊服務業',
  '^059': '其他電子業',
  '^063': '金融保險業',
};

interface IndustryStock {
  code: string;
  market: 'TWSE' | 'TPEX';
}

let _industryCache: IndustryStock[] | null = null;
let _industryCacheTime = 0;
const INDUSTRY_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h
let _industryByName = new Map<string, IndustryStock[]>();

async function fetchIndustryDirectory(): Promise<Map<string, IndustryStock[]>> {
  const now = Date.now();
  if (_industryCache && now - _industryCacheTime < INDUSTRY_CACHE_TTL) {
    return _industryByName;
  }

  const byName = new Map<string, IndustryStock[]>();
  const all: IndustryStock[] = [];

  // 1. TWSE 上市公司行業別
  try {
    const r = await fetch('https://openapi.twse.com.tw/v1/opendata/t187ap03_L', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const data = await r.json() as Array<Record<string, string>>;
      for (const item of data) {
        // TWSE OpenAPI 真實欄位名稱：公司代號 / 產業別 (中文)；英文欄位 Code / Industry 為兼容
        const code = item['公司代號'] ?? item['Code'] ?? item['SecuritiesCompanyCode'];
        const industry = item['產業別'] ?? item['產業類別'] ?? item['Industry'];
        if (!code || !industry) continue;
        const stock: IndustryStock = { code, market: 'TWSE' };
        all.push(stock);
        const list = byName.get(industry) ?? [];
        list.push(stock);
        byName.set(industry, list);
      }
    }
  } catch (e) {
    console.warn('[SectorService] TWSE industry directory failed:', (e as Error).message);
  }

  // 2. TPEX 上櫃公司行業別
  try {
    const r = await fetch('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const data = await r.json() as Array<Record<string, string>>;
      for (const item of data) {
        const code = item['SecuritiesCompanyCode'] ?? item['公司代號'] ?? item['Code'];
        const industry = item['Industry'] ?? item['產業別'] ?? item['產業類別'];
        if (!code || !industry) continue;
        const stock: IndustryStock = { code, market: 'TPEX' };
        all.push(stock);
        const list = byName.get(industry) ?? [];
        list.push(stock);
        byName.set(industry, list);
      }
    }
  } catch (e) {
    console.warn('[SectorService] TPEX industry directory failed:', (e as Error).message);
  }

  // 3. ETF 列表 (上市) — t187ap03 不含 ETF，用 STOCK_DAY_ALL 過濾「00 開頭」代號
  try {
    const r = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const data = await r.json() as Array<Record<string, string>>;
      for (const item of data) {
        const code = item['Code'] ?? item['證券代號'];
        if (!code || !/^00/.test(code)) continue; // ETF 代碼一律 00 開頭
        const stock: IndustryStock = { code, market: 'TWSE' };
        all.push(stock);
        const list = byName.get('ETF') ?? [];
        list.push(stock);
        byName.set('ETF', list);
      }
    }
  } catch (e) {
    console.warn('[SectorService] TWSE ETF directory failed:', (e as Error).message);
  }

  if (all.length > 0) {
    _industryCache = all;
    _industryCacheTime = now;
    _industryByName = byName;
    console.log(`[SectorService] Industry directory cached: ${all.length} stocks across ${byName.size} categories`);
  }

  return _industryByName;
}

// ^264 (電子上市) 是合成類別，包含所有電子相關產業
const TWSE_ELECTRONICS_INDUSTRIES = [
  '半導體業',
  '電腦及週邊設備業',
  '光電業',
  '通信網路業',
  '電子零組件業',
  '電子通路業',
  '資訊服務業',
  '其他電子業',
];

async function getSectorSymbolsViaOpenApi(sectorId: string): Promise<string[]> {
  const byName = await fetchIndustryDirectory();

  // 特殊類別 1：ETF (^554) — 全部 00 開頭代號
  if (sectorId === '^554') {
    const etfs = byName.get('ETF') ?? [];
    return etfs.map(e => e.code);
  }

  // 特殊類別 2：電子 (上市) ^264 — 合成所有電子相關產業
  if (sectorId === '^264') {
    const codes = new Set<string>();
    for (const ind of TWSE_ELECTRONICS_INDUSTRIES) {
      for (const s of byName.get(ind) ?? []) {
        if (s.market === 'TWSE') codes.add(s.code);
      }
    }
    return [...codes];
  }

  const isTpex = sectorId in TPEX_INDUSTRY_BY_ID;
  const isTwse = sectorId in TWSE_INDUSTRY_BY_ID;
  if (!isTpex && !isTwse) return [];

  const targetIndustry = isTpex ? TPEX_INDUSTRY_BY_ID[sectorId] : TWSE_INDUSTRY_BY_ID[sectorId];
  const targetMarket: 'TWSE' | 'TPEX' = isTpex ? 'TPEX' : 'TWSE';

  const matches = byName.get(targetIndustry) ?? [];
  const filtered = matches.filter(m => m.market === targetMarket);
  return filtered.map(m => m.code);
}

// Data source: WantGoo Industry Mapping
const SECTORS: Sector[] = [
  { "name": "水泥 (上市)", "id": "^011" },
  { "name": "食品 (上市)", "id": "^012" },
  { "name": "塑膠 (上市)", "id": "^013" },
  { "name": "紡織 (上市)", "id": "^014" },
  { "name": "電機 (上市)", "id": "^015" },
  { "name": "電器電纜 (上市)", "id": "^016" },
  { "name": "化學 (上市)", "id": "^017" },
  { "name": "生技醫療 (上市)", "id": "^018" },
  { "name": "玻璃 (上市)", "id": "^019" },
  { "name": "造紙 (上市)", "id": "^020" },
  { "name": "鋼鐵 (上市)", "id": "^021" },
  { "name": "橡膠 (上市)", "id": "^022" },
  { "name": "汽車 (上市)", "id": "^023" },
  { "name": "半導體 (上市)", "id": "^024" },
  { "name": "電腦週邊 (上市)", "id": "^025" },
  { "name": "光電 (上市)", "id": "^026" },
  { "name": "通信網路 (上市)", "id": "^027" },
  { "name": "電零組 (上市)", "id": "^028" },
  { "name": "電子通路 (上市)", "id": "^029" },
  { "name": "資訊服務 (上市)", "id": "^030" },
  { "name": "其它電子 (上市)", "id": "^031" },
  { "name": "營建 (上市)", "id": "^032" },
  { "name": "航運 (上市)", "id": "^033" },
  { "name": "觀光 (上市)", "id": "^034" },
  { "name": "金融 (上市)", "id": "^035" },
  { "name": "貿易百貨 (上市)", "id": "^036" },
  { "name": "油電燃氣 (上市)", "id": "^037" },
  { "name": "其他 (上市)", "id": "^038" },
  { "name": "電子 (上市)", "id": "^264" },
  { "name": "ETF (上市)", "id": "^554" },
  { "name": "半導體 (上櫃)", "id": "^052" },
  { "name": "電腦週邊 (上櫃)", "id": "^053" },
  { "name": "光電 (上櫃)", "id": "^054" },
  { "name": "通信網路 (上櫃)", "id": "^055" },
  { "name": "電零組 (上櫃)", "id": "^056" },
  { "name": "電子通路 (上櫃)", "id": "^057" },
  { "name": "資訊服務 (上櫃)", "id": "^058" },
  { "name": "其它電子 (上櫃)", "id": "^059" },
  { "name": "生技醫療 (上櫃)", "id": "^048" },
  { "name": "金融 (上櫃)", "id": "^063" },
  { "name": "IC設計服務 (電子)", "id": "^070" },
  { "name": "IC生產製造 (電子)", "id": "^071" },
  { "name": "工業電腦 (電子)", "id": "^072" },
  { "name": "PCB (電子)", "id": "^097" },
  { "name": "被動元件 (電子)", "id": "^101" },
  { "name": "組裝代工 (電子)", "id": "^104" }
];

export async function getSectors(): Promise<Sector[]> {
  return SECTORS;
}

/**
 * Fetch symbols for a specific sector. Resolution order:
 *   1. TWSE / TPEX OpenAPI 行業別 (穩定、官方來源)
 *   2. WantGoo JSON API (常被 Cloudflare 阻擋)
 *   3. WantGoo HTML 抓取
 */
export async function getSectorSymbols(sectorId: string): Promise<string[]> {
  // 1) 先用官方 OpenAPI（最穩定，不會 403）
  const officialCodes = await getSectorSymbolsViaOpenApi(sectorId).catch(() => [] as string[]);
  if (officialCodes.length > 0) {
    console.log(`[SectorService] Found ${officialCodes.length} symbols for ${sectorId} via TWSE/TPEX OpenAPI`);
    return officialCodes;
  }

  // 2) Fallback: WantGoo JSON
  const url = `https://www.wantgoo.com/api/invest-stats/index-stocks?id=${encodeURIComponent(sectorId)}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': `https://www.wantgoo.com/index/${encodeURIComponent(sectorId)}/stocks`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      // @ts-ignore node-fetch supports timeout via AbortSignal
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 404 || res.status === 403) {
      console.warn(`[SectorService] WantGoo JSON ${res.status} for ${sectorId}, trying HTML scrape.`);
      return await scrapeSectorHtml(sectorId);
    }

    if (!res.ok) {
      console.error(`[SectorService] WantGoo API returned ${res.status} for ${sectorId}`);
      return await scrapeSectorHtml(sectorId);
    }

    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.stocks || data.data || data.list || []);

    if (!Array.isArray(list) || list.length === 0) {
      console.warn(`[SectorService] No stocks found in JSON response for ${sectorId}.`);
      return await scrapeSectorHtml(sectorId);
    }

    const codes: string[] = list.map((item: any) => {
      return item.stockNo || item.code || item.symbol || item.id || (typeof item === 'string' ? item : null);
    }).filter(Boolean);

    console.log(`[SectorService] Found ${codes.length} symbols for ${sectorId} via WantGoo JSON`);
    return codes;
  } catch (e) {
    console.warn(`[SectorService] WantGoo JSON error for ${sectorId}, trying HTML fallback:`, (e as Error).message);
    return await scrapeSectorHtml(sectorId);
  }
}

/**
 * Fallback: Scrape the HTML page since the JSON API is often blocked or 404'd.
 * URL: https://www.wantgoo.com/index/{id}/stocks
 */
async function scrapeSectorHtml(sectorId: string): Promise<string[]> {
  const encodedId = sectorId.startsWith('^') ? encodeURIComponent(sectorId) : sectorId;
  const url = `https://www.wantgoo.com/index/${encodedId}/stocks`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Referer': 'https://www.wantgoo.com/'
      }
    });

    if (!res.ok) {
      console.error(`[SectorService] HTML scrape failed with status ${res.status} for ${url}`);
      return [];
    }

    const html = await res.text();
    // Pattern: <a class="stock-name-a" href="/stock/3122"><span>笙泉</span><span>3122</span></a>
    // The code is in the second span, or more reliably in the href.
    const matches = html.matchAll(/href="\/stock\/(\d{4,6})"/g);
    let codes = Array.from(new Set(Array.from(matches).map(m => m[1])));

    if (codes.length === 0) {
      // Backup pattern if structure changes slightly
      const altMatches = html.matchAll(/<span>(\d{4,6})<\/span>/g);
      codes = Array.from(new Set(Array.from(altMatches).map(m => m[1])));
    }

    console.log(`[SectorService] Found ${codes.length} symbols for ${sectorId} via HTML scraping`);
    return codes;
  } catch (err) {
    console.error(`[SectorService] HTML scraping error for ${sectorId}:`, err);
    return [];
  }
}
