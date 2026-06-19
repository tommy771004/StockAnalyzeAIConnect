/**
 * server/services/sectorMap.ts
 * 同步的「個股 → 產業」對照（供 RiskManager 產業集中度風控在熱路徑使用，無網路 IO）。
 *
 * 涵蓋台股主要大型權值股；查無對照時回傳 undefined，集中度檢查會對該標的優雅略過。
 * 需擴充覆蓋率時直接於下表新增；不要在風控熱路徑改用 SectorService（async / 爬蟲）。
 */

export type SectorTag =
  | 'semiconductor'
  | 'electronics'
  | 'financial'
  | 'telecom'
  | 'materials'   // 塑化 / 鋼鐵 / 水泥
  | 'shipping'
  | 'optics'
  | 'auto'
  | 'food'
  | 'etf';

/** 鍵為去除交易所後綴的台股代號（含 ETF 與槓桿/反向 ETF 字尾如 00632R）。 */
const SYMBOL_SECTOR: Record<string, SectorTag> = {
  // 半導體
  '2330': 'semiconductor', '2454': 'semiconductor', '2303': 'semiconductor',
  '3711': 'semiconductor', '2408': 'semiconductor', '3034': 'semiconductor',
  '2379': 'semiconductor', '6415': 'semiconductor', '3443': 'semiconductor',
  '5347': 'semiconductor', '6770': 'semiconductor', '3661': 'semiconductor',
  // 電子 / 組裝 / 零組件
  '2317': 'electronics', '2382': 'electronics', '2357': 'electronics',
  '2353': 'electronics', '4938': 'electronics', '2324': 'electronics',
  '2376': 'electronics', '3231': 'electronics', '2356': 'electronics',
  '2377': 'electronics', '3017': 'electronics',
  // 光學
  '3008': 'optics', '2409': 'optics',
  // 金融
  '2881': 'financial', '2882': 'financial', '2891': 'financial',
  '2886': 'financial', '2884': 'financial', '2885': 'financial',
  '2890': 'financial', '2892': 'financial', '2880': 'financial',
  '2883': 'financial', '2887': 'financial', '5880': 'financial', '2801': 'financial',
  // 電信
  '2412': 'telecom', '3045': 'telecom', '4904': 'telecom',
  // 塑化 / 鋼鐵 / 水泥
  '1301': 'materials', '1303': 'materials', '1326': 'materials',
  '6505': 'materials', '2002': 'materials', '1101': 'materials', '1102': 'materials',
  // 航運
  '2603': 'shipping', '2609': 'shipping', '2615': 'shipping', '2610': 'shipping',
  // 汽車
  '2207': 'auto', '2201': 'auto',
  // 食品
  '1216': 'food', '1227': 'food', '1210': 'food',
  // ETF（含槓桿/反向）
  '0050': 'etf', '0056': 'etf', '00878': 'etf', '00632R': 'etf',
  '00631L': 'etf', '006208': 'etf', '00692': 'etf', '00713': 'etf', '00929': 'etf',
};

/** 去除交易所後綴並標準化代號。 */
function normalizeSymbol(symbol: string): string {
  return symbol.split('.')[0].trim().toUpperCase();
}

/** 回傳個股所屬產業；查無對照回傳 undefined（集中度檢查會略過）。 */
export function sectorOf(symbol: string): SectorTag | undefined {
  if (!symbol) return undefined;
  return SYMBOL_SECTOR[normalizeSymbol(symbol)];
}
