/**
 * server/utils/edgarApi.ts
 *
 * SEC EDGAR 公開 API 包裝器
 * 資料來源：https://data.sec.gov/ — 完全免費，無需 API Key
 * 文件：https://www.sec.gov/developer
 *
 * 功能：
 *  1. CIK 查詢（股票代號 → SEC 公司識別碼）
 *  2. 最近申報列表（10-K, 10-Q, 8-K, 4...）
 *  3. 財務摘要（XBRL 財務數據）
 */

const EDGAR_BASE     = 'https://data.sec.gov';
const EDGAR_SEARCH   = 'https://efts.sec.gov/LATEST/search-index';
const USER_AGENT     = 'StockAnalyzeAI/1.0 (contact@example.com)'; // EDGAR requires UA

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EdgarFiling {
  accessionNumber: string;  // '0000320193-24-000123'
  filingDate:      string;  // '2024-02-02'
  form:            string;  // '10-K', '10-Q', '8-K', '4'
  primaryDocument: string;  // filename of primary doc
  description:     string;
  url:             string;  // direct URL to filing index
}

export interface EdgarCompanyInfo {
  cik:       string;
  name:      string;
  ticker:    string;
  sic:       string;  // SIC industry code
  sicDesc:   string;
  stateInc:  string;
  filings:   EdgarFiling[];
}

export interface EdgarFinancials {
  cik:      string;
  ticker:   string;
  revenue:  number | null;       // USD (most recent annual)
  netIncome:number | null;
  eps:      number | null;
  assets:   number | null;
  equity:   number | null;
  period:   string;             // '2024'
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function edgarGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept':     'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`EDGAR ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

// Pad CIK to 10 digits
function padCik(cik: string | number): string {
  return String(cik).padStart(10, '0');
}

// Ticker → CIK map (cached in memory, loaded once)
let tickerMap: Record<string, { cik_str: string; title: string }> | null = null;

async function getTickerMap(): Promise<Record<string, { cik_str: string; title: string }>> {
  if (tickerMap) return tickerMap;
  const data = await edgarGet<Record<string, { cik_str: string; title: string }>>(
    `${EDGAR_BASE}/files/company_tickers.json`,
  );
  // Reindex by ticker (uppercase)
  const byTicker: typeof tickerMap = {};
  for (const item of Object.values(data)) {
    // item has { cik_str, title } and key is serial number; we need to reverse
    // Actually the format is { "0": { cik_str, title }, "1": {...} }
    // We need to also get the ticker field
    // The actual format has a 'ticker' field too
  }
  // The actual company_tickers.json format:
  // { "0": { "cik_str": "320193", "ticker": "AAPL", "title": "Apple Inc." }, ... }
  const raw = data as unknown as Record<string, { cik_str: string; ticker: string; title: string }>;
  const result: Record<string, { cik_str: string; title: string }> = {};
  for (const item of Object.values(raw)) {
    result[item.ticker.toUpperCase()] = { cik_str: item.cik_str, title: item.title };
  }
  tickerMap = result;
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * 透過股票代號查詢 SEC CIK
 */
export async function getCikByTicker(ticker: string): Promise<string | null> {
  try {
    const map = await getTickerMap();
    return map[ticker.toUpperCase()]?.cik_str ?? null;
  } catch {
    return null;
  }
}

/**
 * 取得公司基本資訊與最近申報
 */
export async function getCompanyFilings(
  ticker: string,
  formTypes: string[] = ['10-K', '10-Q', '8-K'],
  limit = 10,
): Promise<EdgarCompanyInfo | null> {
  const cik = await getCikByTicker(ticker);
  if (!cik) return null;

  const paddedCik = padCik(cik);

  interface SubmissionsResponse {
    cik:       string;
    name:      string;
    sic:       string;
    sicDescription: string;
    stateOfIncorporation: string;
    tickers:   string[];
    filings: {
      recent: {
        accessionNumber: string[];
        filingDate:      string[];
        form:            string[];
        primaryDocument: string[];
        primaryDocDescription: string[];
      };
    };
  }

  const data = await edgarGet<SubmissionsResponse>(
    `${EDGAR_BASE}/submissions/CIK${paddedCik}.json`,
  );

  const recent   = data.filings.recent;
  const filings: EdgarFiling[] = [];

  for (let i = 0; i < recent.accessionNumber.length && filings.length < limit; i++) {
    const form = recent.form[i]!;
    if (!formTypes.some(t => form.startsWith(t))) continue;

    const accNo  = recent.accessionNumber[i]!.replace(/-/g, '');
    const accFmt = recent.accessionNumber[i]!;

    filings.push({
      accessionNumber: accFmt,
      filingDate:      recent.filingDate[i]!,
      form,
      primaryDocument: recent.primaryDocument[i]!,
      description:     recent.primaryDocDescription[i] ?? '',
      url:             `https://www.sec.gov/Archives/edgar/data/${cik}/${accNo}/${recent.primaryDocument[i]}`,
    });
  }

  return {
    cik,
    name:     data.name,
    ticker:   ticker.toUpperCase(),
    sic:      data.sic,
    sicDesc:  data.sicDescription,
    stateInc: data.stateOfIncorporation,
    filings,
  };
}

/**
 * 取得財務摘要（從 XBRL company facts）
 * 只擷取最常用的幾個指標
 */
export async function getFinancialSummary(ticker: string): Promise<EdgarFinancials | null> {
  const cik = await getCikByTicker(ticker);
  if (!cik) return null;

  const paddedCik = padCik(cik);

  interface FactsResponse {
    facts: {
      'us-gaap'?: Record<string, {
        units: {
          USD?: Array<{ end: string; val: number; form: string; fp: string }>;
          'USD/shares'?: Array<{ end: string; val: number; form: string; fp: string }>;
        };
      }>;
    };
  }

  const data = await edgarGet<FactsResponse>(
    `${EDGAR_BASE}/api/xbrl/companyfacts/CIK${paddedCik}.json`,
  );

  const gaap = data.facts['us-gaap'];
  if (!gaap) return null;

  // Helper: get latest annual value for a GAAP concept
  const getLatestAnnual = (concept: string): { val: number; period: string } | null => {
    const entries = gaap[concept]?.units?.USD;
    if (!entries) return null;
    // Filter to 10-K annual reports only
    const annual = entries
      .filter(e => e.form === '10-K' && e.fp === 'FY')
      .sort((a, b) => b.end.localeCompare(a.end));
    return annual[0] ? { val: annual[0].val, period: annual[0].end.slice(0, 4) } : null;
  };

  const getLatestEPS = (): { val: number; period: string } | null => {
    const concept = 'EarningsPerShareBasic';
    const entries = gaap[concept]?.units?.['USD/shares'];
    if (!entries) return null;
    const annual = entries
      .filter(e => e.form === '10-K' && e.fp === 'FY')
      .sort((a, b) => b.end.localeCompare(a.end));
    return annual[0] ? { val: annual[0].val, period: annual[0].end.slice(0, 4) } : null;
  };

  const revenue   = getLatestAnnual('Revenues') ?? getLatestAnnual('RevenueFromContractWithCustomerExcludingAssessedTax');
  const netIncome = getLatestAnnual('NetIncomeLoss');
  const assets    = getLatestAnnual('Assets');
  const equity    = getLatestAnnual('StockholdersEquity');
  const eps       = getLatestEPS();

  return {
    cik,
    ticker:    ticker.toUpperCase(),
    revenue:   revenue?.val   ?? null,
    netIncome: netIncome?.val ?? null,
    eps:       eps?.val       ?? null,
    assets:    assets?.val    ?? null,
    equity:    equity?.val    ?? null,
    period:    revenue?.period ?? netIncome?.period ?? '---',
  };
}

/** Format large USD numbers for display */
export function formatUSD(n: number | null): string {
  if (n === null) return '---';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${abs.toLocaleString()}`;
}
