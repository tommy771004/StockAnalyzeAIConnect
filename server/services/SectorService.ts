import fetch from 'node-fetch';

export interface Sector {
  id: string;
  name: string;
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
 * Fetch symbols for a specific sector from WantGoo's JSON API.
 * API: https://www.wantgoo.com/api/invest-stats/index-stocks?id=^011
 */
export async function getSectorSymbols(sectorId: string): Promise<string[]> {
  const url = `https://www.wantgoo.com/api/invest-stats/index-stocks?id=${encodeURIComponent(sectorId)}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': `https://www.wantgoo.com/index/${encodeURIComponent(sectorId)}/stocks`,
        'X-Requested-With': 'XMLHttpRequest',
      }
    });
    
    if (res.status === 404 || res.status === 403) {
      console.warn(`[SectorService] JSON API failed with ${res.status} for ${sectorId}. Falling back to HTML scraping.`);
      return await scrapeSectorHtml(sectorId);
    }

    if (!res.ok) {
      console.error(`[SectorService] WantGoo API returned ${res.status} for ${sectorId}`);
      return await scrapeSectorHtml(sectorId);
    }

    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.stocks || data.data || data.list || []);
    
    if (!Array.isArray(list) || list.length === 0) {
      console.warn(`[SectorService] No stocks found in JSON response for ${sectorId}. Data keys:`, Object.keys(data));
      return await scrapeSectorHtml(sectorId);
    }
    
    const codes: string[] = list.map((item: any) => {
      return item.stockNo || item.code || item.symbol || item.id || (typeof item === 'string' ? item : null);
    }).filter(Boolean);

    console.log(`[SectorService] Found ${codes.length} symbols for ${sectorId} via JSON API`);
    return codes;
  } catch (e) {
    console.error(`[SectorService] JSON API error for ${sectorId}, trying HTML fallback:`, e);
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
