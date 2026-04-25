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
        'Accept': 'application/json',
        'Referer': 'https://www.wantgoo.com/',
      }
    });
    
    if (!res.ok) {
      console.error(`[SectorService] WantGoo API returned ${res.status} for ${sectorId}`);
      return [];
    }

    const data = await res.json();
    
    // WantGoo API usually returns an array of objects
    // Format based on common WantGoo patterns: [{ stockNo: '1101', ... }, ...]
    // or a direct array if simpler. We'll handle both.
    const list = Array.isArray(data) ? data : (data.stocks || data.data || []);
    
    if (!Array.isArray(list)) {
      console.warn(`[SectorService] Unexpected API response format for ${sectorId}:`, data);
      return [];
    }
    
    const codes: string[] = list.map((item: any) => {
      // Handle different possible key names
      return item.stockNo || item.code || item.symbol || (typeof item === 'string' ? item : null);
    }).filter(Boolean);

    console.log(`[SectorService] Found ${codes.length} symbols via JSON API for ${sectorId}`);
    return codes;
  } catch (e) {
    console.error(`[SectorService] Failed to fetch symbols for ${sectorId} via JSON API:`, e);
    return [];
  }
}
