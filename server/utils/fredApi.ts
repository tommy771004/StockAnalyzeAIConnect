/**
 * server/utils/fredApi.ts
 *
 * FRED (Federal Reserve Economic Data) API 包裝器
 * 資料來源：St. Louis Federal Reserve — https://fred.stlouisfed.org/
 * 申請免費 API Key：https://fred.stlouisfed.org/docs/api/api_key.html
 *
 * 環境變數：FRED_API_KEY（選填，無 Key 時使用 FRED JSON 公開端點）
 */

const FRED_BASE = 'https://api.stlouisfed.org/fred';
const FRED_KEY  = process.env.FRED_API_KEY ?? '';

// ─── Series IDs (常用總體經濟指標) ───────────────────────────────────────────

export const FRED_SERIES = {
  // 利率
  FED_FUNDS_RATE:      'FEDFUNDS',      // 聯邦基金利率
  SOFR:                'SOFR',          // 有擔保隔夜融資利率
  US10Y:               'DGS10',         // 10年期美債殖利率
  US2Y:                'DGS2',          // 2年期美債殖利率
  YIELD_CURVE_2_10:    'T10Y2Y',        // 10Y-2Y 殖利率曲線利差

  // 通膨
  CPI_ALL:             'CPIAUCSL',      // 整體 CPI (YoY)
  CPI_CORE:            'CPILFESL',      // 核心 CPI (剔除食品能源)
  PCE:                 'PCEPI',         // PCE 通膨指數（Fed 偏好指標）
  PCE_CORE:            'PCEPILFE',      // 核心 PCE
  BREAKEVEN_5Y:        'T5YIE',         // 5年盈虧平衡通膨率

  // 經濟活動
  GDP:                 'GDP',           // 美國 GDP（季度）
  REAL_GDP:            'GDPC1',         // 實際 GDP
  UNEMPLOYMENT:        'UNRATE',        // 失業率
  NONFARM_PAYROLL:     'PAYEMS',        // 非農就業人數
  RETAIL_SALES:        'RSAFS',         // 零售銷售
  ISM_MFG:             'MANEMP',        // 製造業就業

  // 貨幣供給
  M2:                  'M2SL',          // M2 貨幣供給
  M2_VELOCITY:         'M2V',           // M2 貨幣流通速度

  // 市場/流動性
  TED_SPREAD:          'TEDRATE',       // TED 利差（信用壓力指標）
  VIX:                 'VIXCLS',        // VIX 恐慌指數
  CREDIT_SPREAD_IG:    'BAMLC0A0CM',    // 投資級信用利差
  CREDIT_SPREAD_HY:    'BAMLH0A0HYM2',  // 高收益信用利差

  // 房市
  HOUSING_STARTS:      'HOUST',         // 新屋開工
  CASE_SHILLER:        'CSUSHPISA',     // 凱斯希勒房價指數

  // 外匯
  DXY_TRADE:           'DTWEXBGS',      // 美元指數（廣義）
} as const;

export type FredSeriesId = keyof typeof FRED_SERIES;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FredObservation {
  date:  string;  // 'YYYY-MM-DD'
  value: number | null;
}

export interface FredSeriesData {
  seriesId:    string;
  title:       string;
  units:       string;
  frequency:   string;
  latest:      FredObservation | null;
  observations: FredObservation[];
}

// ─── Fetch Helpers ────────────────────────────────────────────────────────────

async function fredGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${FRED_BASE}${path}`);
  url.searchParams.set('file_type', 'json');
  if (FRED_KEY) url.searchParams.set('api_key', FRED_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10_000),
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`FRED API ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  return res.json();
}

function parseObs(raw: unknown): FredObservation[] {
  const list = (raw as { observations?: Array<{ date: string; value: string }> })?.observations ?? [];
  return list
    .map(o => ({
      date:  o.date,
      value: o.value === '.' ? null : parseFloat(o.value),
    }))
    .filter(o => o.value !== null) as FredObservation[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * 取得某個 FRED 數列的資料
 * @param seriesKey  FRED_SERIES 的 key，或直接填 FRED series ID
 * @param limit      最近幾筆（預設 12）
 */
export async function getFredSeries(
  seriesKey: FredSeriesId | string,
  limit = 12,
): Promise<FredSeriesData> {
  const id = FRED_SERIES[seriesKey as FredSeriesId] ?? seriesKey;

  const [seriesInfo, seriesObs] = await Promise.all([
    fredGet('/series', { series_id: id }),
    fredGet('/series/observations', {
      series_id: id,
      sort_order: 'desc',
      limit:      String(limit),
    }),
  ]);

  const info = (seriesInfo as { seriess?: Array<{ title: string; units: string; frequency_short: string }> })?.seriess?.[0];
  const obs  = parseObs(seriesObs).reverse(); // 改回升冪排列

  return {
    seriesId:     id,
    title:        info?.title        ?? id,
    units:        info?.units        ?? '',
    frequency:    info?.frequency_short ?? '',
    latest:       obs[obs.length - 1] ?? null,
    observations: obs,
  };
}

/**
 * 一次取得多個關鍵總體指標（供 AI Function Tool 使用）
 */
export async function getKeyMacroSnapshot(): Promise<Record<string, FredSeriesData>> {
  const keys: FredSeriesId[] = [
    'FED_FUNDS_RATE',
    'US10Y',
    'US2Y',
    'YIELD_CURVE_2_10',
    'CPI_ALL',
    'CPI_CORE',
    'PCE_CORE',
    'UNEMPLOYMENT',
    'M2',
    'CREDIT_SPREAD_HY',
    'VIX',
  ];

  const results = await Promise.allSettled(keys.map(k => getFredSeries(k, 3)));

  return Object.fromEntries(
    keys.map((k, i) => {
      const r = results[i];
      return [k, r.status === 'fulfilled' ? r.value : null];
    }).filter(([, v]) => v !== null),
  ) as Record<string, FredSeriesData>;
}

/**
 * 格式化 macro snapshot 為 LLM 可讀的文字
 */
export function formatMacroForPrompt(snap: Record<string, FredSeriesData>): string {
  const lines: string[] = ['## 美國總體經濟數據（來源：FRED / St. Louis Fed）'];

  const fmt = (v: number | null | undefined, decimals = 2) =>
    v == null ? 'N/A' : v.toFixed(decimals);

  const LABELS: Partial<Record<FredSeriesId, string>> = {
    FED_FUNDS_RATE:     '聯邦基金利率',
    US10Y:              '10年期美債殖利率',
    US2Y:               '2年期美債殖利率',
    YIELD_CURVE_2_10:   '殖利率曲線利差 (10Y-2Y)',
    CPI_ALL:            '整體 CPI (YoY)',
    CPI_CORE:           '核心 CPI',
    PCE_CORE:           '核心 PCE（Fed 目標 2%）',
    UNEMPLOYMENT:       '失業率',
    M2:                 'M2 貨幣供給',
    CREDIT_SPREAD_HY:   '高收益信用利差',
    VIX:                'VIX 恐慌指數',
  };

  for (const [key, data] of Object.entries(snap)) {
    if (!data?.latest) continue;
    const label = LABELS[key as FredSeriesId] ?? data.title;
    lines.push(`- **${label}**: ${fmt(data.latest.value)}${data.units?.includes('%') ? '%' : ''} (${data.latest.date})`);
  }

  return lines.join('\n');
}
