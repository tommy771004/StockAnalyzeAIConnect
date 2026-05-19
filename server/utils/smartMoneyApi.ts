/**
 * server/utils/smartMoneyApi.ts
 *
 * Smart Money 追蹤：
 *  1. 13F 機構持倉（重點標示新建倉）
 *  2. Form 4 內部人公開市場交易
 *
 * 兩者都直接使用 SEC EDGAR 公開資料，避免依賴不穩定的第三方爬蟲。
 */

import { getCikByTicker } from './edgarApi.js';

const EDGAR_BASE = 'https://data.sec.gov';
const EDGAR_SEARCH = 'https://efts.sec.gov/LATEST/search-index';
const EDGAR_ARCHIVES_BASE = 'https://www.sec.gov/Archives/edgar/data';
const USER_AGENT = 'StockAnalyzeAI/1.0 (contact@example.com)';

interface FilingRef {
  accessionNumber: string;
  filingDate: string;
  reportDate: string | null;
  form: string;
  primaryDocument: string;
  description: string;
}

interface SubmissionsResponse {
  cik: string;
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate?: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

interface DirectoryIndexResponse {
  directory?: {
    item?: Array<{
      name?: string;
      type?: string;
      size?: string;
      'last-modified'?: string;
    }>;
  };
}

export interface TrackedManager {
  id: string;
  name: string;
  cik: string;
}

export interface ManagerSearchResult extends TrackedManager {
  displayName: string;
  form: string | null;
  has13F: boolean;
  last13FFilingDate: string | null;
  verificationStatus: 'verified' | 'not_found' | 'unavailable';
}

export interface SmartMoneyHolding {
  issuer: string;
  classTitle: string;
  cusip: string;
  valueUsd: number;
  shares: number;
  shareType: string;
  investmentDiscretion: string;
  isNewPosition: boolean;
}

export interface SmartMoney13FOverview {
  availableManagers: TrackedManager[];
  manager: TrackedManager;
  currentFiling: {
    accessionNumber: string;
    filingDate: string;
    reportDate: string | null;
    url: string;
  };
  previousFiling: {
    accessionNumber: string;
    filingDate: string;
    reportDate: string | null;
    url: string;
  } | null;
  summary: {
    totalHoldings: number;
    totalValueUsd: number;
    newPositions: number;
  };
  newPositions: SmartMoneyHolding[];
  topHoldings: SmartMoneyHolding[];
  sourceLinks: {
    sec: string;
    whaleWisdom: string;
    dataroma: string;
  };
}

export interface InsiderTransaction {
  filingDate: string;
  tradeDate: string;
  insiderName: string;
  title: string;
  securityTitle: string;
  action: 'Buy' | 'Sell';
  code: 'P' | 'S';
  shares: number | null;
  price: number | null;
  amountUsd: number | null;
  ownership: 'D' | 'I' | null;
  filingUrl: string;
  isLargeBuy: boolean;
}

export interface InsiderActivityOverview {
  company: {
    ticker: string;
    name: string;
    cik: string;
  };
  summary: {
    openMarketBuys: number;
    openMarketSells: number;
    largeBuys: number;
    clusterBuying: boolean;
    clusterBuyerCount: number;
    latestTradeDate: string | null;
  };
  transactions: InsiderTransaction[];
  sourceLinks: {
    sec: string;
    openInsider: string;
    finviz: string;
  };
}

const TRACKED_MANAGERS: TrackedManager[] = [
  { id: 'berkshire-hathaway', name: 'Berkshire Hathaway', cik: '1067983' },
  { id: 'bridgewater-associates', name: 'Bridgewater Associates', cik: '1350694' },
  { id: 'soros-fund-management', name: 'Soros Fund Management', cik: '1029160' },
  { id: 'pershing-square', name: 'Pershing Square Capital Management', cik: '1336528' },
  { id: 'scion-asset-management', name: 'Scion Asset Management', cik: '1649339' },
];

const filingVerificationCache = new Map<string, Promise<{ has13F: boolean; last13FFilingDate: string | null; verificationStatus: 'verified' | 'not_found' | 'unavailable' }>>();

export function getTrackedManagers(customManagers: TrackedManager[] = []): TrackedManager[] {
  const merged = [...TRACKED_MANAGERS, ...customManagers]
    .map((manager) => ({ ...manager }));

  const deduped = new Map<string, TrackedManager>();
  for (const manager of merged) {
    deduped.set(manager.id, manager);
  }

  return Array.from(deduped.values());
}

function getTrackedManagerById(id: string, customManagers: TrackedManager[] = []): TrackedManager | null {
  return getTrackedManagers(customManagers).find((manager) => manager.id === id) ?? null;
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

async function secGetJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`SEC ${res.status}: ${url}`);
  }

  return res.json() as Promise<T>;
}

async function secGetText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/xml,text/xml,text/plain;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`SEC ${res.status}: ${url}`);
  }

  return res.text();
}

function normalizeCik(cik: string | number): string {
  return String(Number(cik));
}

function padCik(cik: string | number): string {
  return normalizeCik(cik).padStart(10, '0');
}

function accessionDigits(accessionNumber: string): string {
  return accessionNumber.replace(/-/g, '');
}

function filingBaseUrl(cik: string, accessionNumber: string): string {
  return `${EDGAR_ARCHIVES_BASE}/${normalizeCik(cik)}/${accessionDigits(accessionNumber)}`;
}

function filingDocumentUrl(cik: string, filing: FilingRef): string {
  return `${filingBaseUrl(cik, filing.accessionNumber)}/${filing.primaryDocument}`;
}

function companyBrowseUrl(cik: string, formType: string): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${normalizeCik(cik)}&type=${encodeURIComponent(formType)}&owner=include&count=40`;
}

async function getSubmissionsByCik(cik: string): Promise<SubmissionsResponse> {
  return secGetJson<SubmissionsResponse>(`${EDGAR_BASE}/submissions/CIK${padCik(cik)}.json`);
}

function getRecentFilings(
  submissions: SubmissionsResponse,
  forms: string[],
  limit: number,
): FilingRef[] {
  const recent = submissions.filings.recent;
  const filings: FilingRef[] = [];

  for (let index = 0; index < recent.accessionNumber.length && filings.length < limit; index += 1) {
    const form = recent.form[index] ?? '';
    if (!forms.includes(form)) continue;

    filings.push({
      accessionNumber: recent.accessionNumber[index] ?? '',
      filingDate: recent.filingDate[index] ?? '',
      reportDate: recent.reportDate?.[index] ?? null,
      form,
      primaryDocument: recent.primaryDocument[index] ?? '',
      description: recent.primaryDocDescription[index] ?? form,
    });
  }

  return filings;
}

async function listArchiveXmlFiles(
  cik: string,
  accessionNumber: string,
  subdir = '',
  depth = 1,
): Promise<string[]> {
  const indexUrl = subdir
    ? `${filingBaseUrl(cik, accessionNumber)}/${subdir}/index.json`
    : `${filingBaseUrl(cik, accessionNumber)}/index.json`;

  const index = await secGetJson<DirectoryIndexResponse>(indexUrl);
  const items = index.directory?.item ?? [];
  const xmlFiles: string[] = [];

  for (const item of items) {
    const itemName = item.name;
    if (!itemName) continue;

    const relativePath = subdir ? `${subdir}/${itemName}` : itemName;
    if (relativePath.toLowerCase().endsWith('.xml')) {
      xmlFiles.push(relativePath);
    }

    if ((item.type ?? '').toLowerCase() === 'dir' && depth > 0) {
      const nested = await listArchiveXmlFiles(cik, accessionNumber, relativePath, depth - 1);
      xmlFiles.push(...nested);
    }
  }

  return xmlFiles;
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-fA-F]+);/g, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, ' ');
}

function extractBlocks(xml: string, tagName: string): string[] {
  const escapedTag = escapeRegex(tagName);
  const regex = new RegExp(
    `<(?:[\\w.-]+:)?${escapedTag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${escapedTag}>`,
    'gi',
  );

  const blocks: string[] = [];
  let match: RegExpExecArray | null = regex.exec(xml);
  while (match) {
    blocks.push(match[1] ?? '');
    match = regex.exec(xml);
  }

  return blocks;
}

function extractText(xml: string, tagName: string): string | null {
  const block = extractBlocks(xml, tagName)[0];
  if (!block) return null;
  return normalizeWhitespace(decodeEntities(stripTags(block)));
}

function parseNumber(raw: string | null): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/[$,%\s,]/g, '');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function formatIssuerKey(issuer: string, classTitle: string, cusip: string): string {
  if (cusip) return cusip.toUpperCase();
  return `${issuer}|${classTitle}`.replace(/\s+/g, ' ').trim().toUpperCase();
}

function score13FXmlPath(path: string, primaryDocument: string): number {
  const lower = path.toLowerCase();
  const primary = primaryDocument.toLowerCase();
  let score = 0;

  if (lower === primary || lower.endsWith('/primary_doc.xml') || lower.endsWith('primary_doc.xml')) score -= 60;
  if (/info|table/.test(lower)) score += 40;
  if (/primary|cover|index/.test(lower)) score -= 20;
  if (/xsl/.test(lower)) score -= 10;
  if (/\/(?:\d+\.xml)$/.test(`/${lower}`) || /^\d+\.xml$/.test(lower)) score += 15;

  return score;
}

async function verify13FSupport(cik: string): Promise<{ has13F: boolean; last13FFilingDate: string | null; verificationStatus: 'verified' | 'not_found' | 'unavailable' }> {
  const normalizedCik = String(Number(cik));
  if (!filingVerificationCache.has(normalizedCik)) {
    filingVerificationCache.set(normalizedCik, (async () => {
      try {
        const submissions = await getSubmissionsByCik(normalizedCik);
        const filings = getRecentFilings(submissions, ['13F-HR', '13F-HR/A'], 1);
        return {
          has13F: filings.length > 0,
          last13FFilingDate: filings[0]?.filingDate ?? null,
          verificationStatus: filings.length > 0 ? 'verified' : 'not_found',
        };
      } catch {
        filingVerificationCache.delete(normalizedCik);
        return {
          has13F: false,
          last13FFilingDate: null,
          verificationStatus: 'unavailable',
        };
      }
    })());
  }

  return filingVerificationCache.get(normalizedCik)!;
}

async function resolve13FInfoTableUrl(cik: string, filing: FilingRef): Promise<string> {
  const xmlFiles = await listArchiveXmlFiles(cik, filing.accessionNumber, '', 1);
  const sorted = xmlFiles
    .map((path) => ({ path, score: score13FXmlPath(path, filing.primaryDocument) }))
    .sort((left, right) => right.score - left.score);

  const winner = sorted.find((candidate) => candidate.score > -10) ?? sorted.find((candidate) => candidate.path !== filing.primaryDocument);
  if (!winner) {
    throw new Error(`13F info table not found for ${filing.accessionNumber}`);
  }

  return `${filingBaseUrl(cik, filing.accessionNumber)}/${winner.path}`;
}

async function resolveForm4XmlUrl(cik: string, filing: FilingRef): Promise<string> {
  if (filing.primaryDocument.toLowerCase().endsWith('.xml')) {
    return filingDocumentUrl(cik, filing);
  }

  const xmlFiles = await listArchiveXmlFiles(cik, filing.accessionNumber, '', 1);
  const preferred = xmlFiles.find((path) => /form4|ownership/i.test(path));
  const fallback = xmlFiles[0];

  if (!preferred && !fallback) {
    throw new Error(`Form 4 XML not found for ${filing.accessionNumber}`);
  }

  return `${filingBaseUrl(cik, filing.accessionNumber)}/${preferred ?? fallback}`;
}

function parse13FHoldings(xml: string, previousKeys: Set<string>): SmartMoneyHolding[] {
  return extractBlocks(xml, 'infoTable')
    .map((block) => {
      const issuer = extractText(block, 'nameOfIssuer') ?? 'Unknown Issuer';
      const classTitle = extractText(block, 'titleOfClass') ?? '';
      const cusip = extractText(block, 'cusip') ?? '';
      const valueThousands = parseNumber(extractText(block, 'value')) ?? 0;
      const shares = parseNumber(extractText(block, 'sshPrnamt')) ?? 0;
      const shareType = extractText(block, 'sshPrnamtType') ?? '';
      const investmentDiscretion = extractText(block, 'investmentDiscretion') ?? '';
      const key = formatIssuerKey(issuer, classTitle, cusip);

      return {
        issuer,
        classTitle,
        cusip,
        valueUsd: valueThousands * 1_000,
        shares,
        shareType,
        investmentDiscretion,
        isNewPosition: !previousKeys.has(key),
      } satisfies SmartMoneyHolding;
    })
    .filter((holding) => holding.valueUsd > 0)
    .sort((left, right) => right.valueUsd - left.valueUsd);
}

function parseInsiderTransactions(xml: string, filingDate: string, filingUrl: string): InsiderTransaction[] {
  const ownerBlock = extractBlocks(xml, 'reportingOwner')[0] ?? '';
  const insiderName = extractText(ownerBlock, 'rptOwnerName') ?? 'Unknown Insider';
  const title = extractText(ownerBlock, 'officerTitle')
    ?? extractText(ownerBlock, 'otherText')
    ?? extractText(ownerBlock, 'reportingOwnerRelationship')
    ?? 'Insider';

  return extractBlocks(xml, 'nonDerivativeTransaction')
    .map((block) => {
      const code = (extractText(block, 'transactionCode') ?? '').toUpperCase();
      if (code !== 'P' && code !== 'S') return null;

      const shares = parseNumber(extractText(block, 'transactionShares'));
      const price = parseNumber(extractText(block, 'transactionPricePerShare'));
      const amountUsd = shares != null && price != null ? shares * price : null;
      const ownershipRaw = (extractText(block, 'directOrIndirectOwnership') ?? '').toUpperCase();
      const ownership = ownershipRaw === 'D' || ownershipRaw === 'I'
        ? ownershipRaw as 'D' | 'I'
        : null;

      return {
        filingDate,
        tradeDate: extractText(block, 'transactionDate') ?? filingDate,
        insiderName,
        title,
        securityTitle: extractText(block, 'securityTitle') ?? 'Common Stock',
        action: code === 'P' ? 'Buy' : 'Sell',
        code: code as 'P' | 'S',
        shares,
        price,
        amountUsd,
        ownership,
        filingUrl,
        isLargeBuy: code === 'P' && (amountUsd ?? 0) >= 100_000,
      } satisfies InsiderTransaction;
    })
    .filter((transaction): transaction is InsiderTransaction => transaction !== null);
}

export async function getLatest13FOverview(
  managerId: string,
  customManagers: TrackedManager[] = [],
): Promise<SmartMoney13FOverview> {
  const manager = getTrackedManagerById(managerId, customManagers);
  if (!manager) {
    throw new Error(`Unsupported 13F manager: ${managerId}`);
  }

  const submissions = await getSubmissionsByCik(manager.cik);
  const filings = getRecentFilings(submissions, ['13F-HR', '13F-HR/A'], 2);
  const currentFiling = filings[0];
  const previousFiling = filings[1] ?? null;

  if (!currentFiling) {
    throw new Error(`No recent 13F filing found for ${manager.name}`);
  }

  const currentInfoTableUrl = await resolve13FInfoTableUrl(manager.cik, currentFiling);
  const previousInfoTableUrl = previousFiling
    ? await resolve13FInfoTableUrl(manager.cik, previousFiling).catch(() => null)
    : null;

  const [currentXml, previousXml] = await Promise.all([
    secGetText(currentInfoTableUrl),
    previousInfoTableUrl ? secGetText(previousInfoTableUrl).catch(() => null) : Promise.resolve(null),
  ]);

  const previousHoldings = previousXml ? parse13FHoldings(previousXml, new Set<string>()) : [];
  const previousKeys = new Set(previousHoldings.map((holding) => formatIssuerKey(holding.issuer, holding.classTitle, holding.cusip)));
  const holdings = parse13FHoldings(currentXml, previousKeys);
  const newPositions = holdings.filter((holding) => holding.isNewPosition);
  const totalValueUsd = holdings.reduce((sum, holding) => sum + holding.valueUsd, 0);

  return {
    availableManagers: getTrackedManagers(customManagers),
    manager,
    currentFiling: {
      accessionNumber: currentFiling.accessionNumber,
      filingDate: currentFiling.filingDate,
      reportDate: currentFiling.reportDate,
      url: filingDocumentUrl(manager.cik, currentFiling),
    },
    previousFiling: previousFiling
      ? {
          accessionNumber: previousFiling.accessionNumber,
          filingDate: previousFiling.filingDate,
          reportDate: previousFiling.reportDate,
          url: filingDocumentUrl(manager.cik, previousFiling),
        }
      : null,
    summary: {
      totalHoldings: holdings.length,
      totalValueUsd,
      newPositions: newPositions.length,
    },
    newPositions: newPositions.slice(0, 8),
    topHoldings: holdings.slice(0, 10),
    sourceLinks: {
      sec: companyBrowseUrl(manager.cik, '13F-HR'),
      whaleWisdom: 'https://whalewisdom.com/',
      dataroma: 'https://www.dataroma.com/',
    },
  };
}

export async function getRecentInsiderActivity(ticker: string): Promise<InsiderActivityOverview | null> {
  const cik = await getCikByTicker(ticker);
  if (!cik) return null;

  const submissions = await getSubmissionsByCik(cik);
  const filings = getRecentFilings(submissions, ['4'], 8);

  const parsed = await Promise.allSettled(
    filings.map(async (filing) => {
      const xmlUrl = await resolveForm4XmlUrl(cik, filing);
      const xml = await secGetText(xmlUrl);
      return parseInsiderTransactions(xml, filing.filingDate, xmlUrl);
    }),
  );

  const transactions = parsed
    .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    .sort((left, right) => {
      if (left.tradeDate === right.tradeDate) {
        return right.filingDate.localeCompare(left.filingDate);
      }
      return right.tradeDate.localeCompare(left.tradeDate);
    })
    .slice(0, 40);

  const buyTransactions = transactions.filter((transaction) => transaction.action === 'Buy');
  const sellTransactions = transactions.filter((transaction) => transaction.action === 'Sell');
  const largeBuys = buyTransactions.filter((transaction) => transaction.isLargeBuy);
  const clusterBuyerCount = new Set(largeBuys.map((transaction) => `${transaction.insiderName}|${transaction.title}`)).size;
  const upperTicker = ticker.toUpperCase();

  return {
    company: {
      ticker: upperTicker,
      name: submissions.name,
      cik,
    },
    summary: {
      openMarketBuys: buyTransactions.length,
      openMarketSells: sellTransactions.length,
      largeBuys: largeBuys.length,
      clusterBuying: clusterBuyerCount >= 2,
      clusterBuyerCount,
      latestTradeDate: transactions[0]?.tradeDate ?? null,
    },
    transactions,
    sourceLinks: {
      sec: companyBrowseUrl(cik, '4'),
      openInsider: `https://openinsider.com/screener?s=${encodeURIComponent(upperTicker)}`,
      finviz: `https://finviz.com/quote.ashx?t=${encodeURIComponent(upperTicker)}`,
    },
  };
}

function extractManagerName(displayName: string, fallbackQuery: string): string {
  const strippedCik = displayName.replace(/\s*\(CIK\s+\d+\)\s*$/i, '');
  const strippedMeta = strippedCik.replace(/\s*\([^)]*\)\s*$/i, '');
  const normalized = strippedMeta.replace(/\s+/g, ' ').trim();
  return normalized || fallbackQuery.trim();
}

function buildManagerSearchScore(queryTerms: string[], displayName: string, form: string | null): number {
  const haystack = displayName.toUpperCase();
  let score = 0;

  if (form?.startsWith('13F')) score += 50;
  if (queryTerms.every((term) => haystack.includes(term))) score += 25;
  if (queryTerms.length > 0 && haystack.startsWith(queryTerms.join(' '))) score += 10;
  if (/MANAGEMENT|CAPITAL|PARTNERS|ADVIS|INVEST|FUND|ASSET|OFFICE/i.test(displayName)) score += 5;

  return score;
}

interface SearchIndexHitSource {
  ciks?: string[];
  display_names?: string[];
  form?: string;
}

interface SearchIndexResponse {
  hits?: {
    hits?: Array<{
      _source?: SearchIndexHitSource;
    }>;
  };
}

export async function searchTrackedManagers(query: string, limit = 8): Promise<ManagerSearchResult[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  const response = await secGetJson<SearchIndexResponse>(`${EDGAR_SEARCH}?q=${encodeURIComponent(normalizedQuery)}`);
  const hits = response.hits?.hits ?? [];
  const queryTerms = normalizedQuery.toUpperCase().split(/\s+/).filter(Boolean);
  const deduped = new Map<string, { result: Omit<ManagerSearchResult, 'has13F' | 'last13FFilingDate' | 'verificationStatus'>; score: number }>();

  for (const hit of hits) {
    const source = hit._source;
    const cik = source?.ciks?.[0]?.replace(/\D/g, '');
    const displayName = source?.display_names?.[0]?.trim() ?? '';
    if (!cik || !displayName) continue;

    const name = extractManagerName(displayName, normalizedQuery);
    const result: Omit<ManagerSearchResult, 'has13F' | 'last13FFilingDate' | 'verificationStatus'> = {
      id: slugify(`${name}-${cik}`),
      name,
      cik: String(Number(cik)),
      displayName,
      form: source?.form ?? null,
    };
    const score = buildManagerSearchScore(queryTerms, `${displayName} ${name}`, result.form);

    const existing = deduped.get(result.cik);
    if (!existing || score > existing.score) {
      deduped.set(result.cik, { result, score });
    }
  }

  const preliminary = Array.from(deduped.values())
    .sort((left, right) => right.score - left.score || left.result.name.localeCompare(right.result.name))
    .slice(0, Math.max(limit * 2, limit));

  const verified = await Promise.all(preliminary.map(async (entry) => {
    const verification = await verify13FSupport(entry.result.cik);
    return {
      result: {
        ...entry.result,
        has13F: verification.has13F,
        last13FFilingDate: verification.last13FFilingDate,
        verificationStatus: verification.verificationStatus,
      } satisfies ManagerSearchResult,
      score: entry.score + (verification.has13F ? 80 : 0),
    };
  }));

  return verified
    .sort((left, right) => {
      if (left.result.verificationStatus !== right.result.verificationStatus) {
        const rank = { verified: 2, not_found: 1, unavailable: 0 } as const;
        return rank[right.result.verificationStatus] - rank[left.result.verificationStatus];
      }
      return right.score - left.score || left.result.name.localeCompare(right.result.name);
    })
    .slice(0, limit)
    .map((entry) => entry.result);
}