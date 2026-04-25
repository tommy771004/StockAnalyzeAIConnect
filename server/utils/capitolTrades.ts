/**
 * server/utils/capitolTrades.ts
 *
 * 美國國會議員股票交易申報追蹤
 * 根據《STOCK Act》(2012)，國會議員必須在 45 天內申報所有股票交易
 *
 * 資料來源：
 *  1. Quiver Quantitative (免費 tier) — https://api.quiverquant.com/beta/live/congresstrading
 *  2. House Disclosure Portal — https://disclosures-clerk.house.gov/
 *
 * 環境變數：
 *  QUIVER_API_KEY — Quiver Quantitative API Key (免費申請：https://quiverquant.com/)
 *  若無 Key，使用公開 House Disclosure CSV 備援
 */

const QUIVER_BASE = 'https://api.quiverquant.com/beta';
const QUIVER_KEY  = process.env.QUIVER_API_KEY ?? '';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CongressTrade {
  politician:   string;   // "Nancy Pelosi"
  party:        'D' | 'R' | 'I';
  chamber:      'House' | 'Senate';
  ticker:       string;   // "NVDA"
  tradeDate:    string;   // "2024-01-15"
  reportedDate: string;   // "2024-02-28"  (STOCK Act allows 45-day delay)
  action:       'Buy' | 'Sell' | 'Exchange';
  amount:       string;   // "$15,001 - $50,000" (lawmakers report ranges, not exact)
  comment:      string;
  state:        string;   // "CA"
}

// ─── Quiver Quantitative API ──────────────────────────────────────────────────

async function quiverGet<T>(endpoint: string): Promise<T> {
  if (!QUIVER_KEY) throw new Error('QUIVER_API_KEY not configured');

  const res = await fetch(`${QUIVER_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Token ${QUIVER_KEY}`,
      'Accept':        'application/json',
      'User-Agent':    'StockAnalyzeAI/1.0',
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) throw new Error(`Quiver ${res.status}: ${endpoint}`);
  return res.json() as Promise<T>;
}

// ─── House XML/JSON Backup (no API key needed) ────────────────────────────────
// The House Clerk publishes XML reports we can parse as a fallback

interface HouseDisclosureEntry {
  First:   string;
  Last:    string;
  Ticker:  string;
  Transaction: string;
  Date:    string;
  Amount:  string;
  Capitol: string;
}

async function fetchHouseDisclosureRecent(ticker?: string): Promise<CongressTrade[]> {
  // Use Kadoa Congress Trading Monitor (Free & Updated Daily)
  const url = 'https://raw.githubusercontent.com/kadoa-org/congress-trading-monitor/main/public/data/trades.json';

  const res = await fetch(url, { 
    headers: { 'User-Agent': 'StockAnalyzeAI/1.0' },
    signal: AbortSignal.timeout(25_000) 
  });
  if (!res.ok) throw new Error(`Congress Data fetch failed: ${res.status}`);

  const raw = await res.json() as Array<{
    filer_name:         string;
    transaction_date:   string;
    filing_date:        string;
    ticker:             string | null;
    transaction_type:   string;
    amount_range_label: string;
    comment?:           string | null;
    party?:             string | null;
    state?:             string | null;
    chamber?:           string | null;
  }>;

  return raw
    .filter(r => !ticker || r.ticker?.toUpperCase() === ticker.toUpperCase())
    .slice(0, 200)
    .map(r => ({
      politician:   r.filer_name,
      party:        (r.party?.startsWith('D') ? 'D' : r.party?.startsWith('R') ? 'R' : 'I') as CongressTrade['party'],
      chamber:      (r.chamber?.toLowerCase() === 'senate' ? 'Senate' : 'House') as CongressTrade['chamber'],
      ticker:       r.ticker?.toUpperCase() ?? '---',
      tradeDate:    r.transaction_date ?? '',
      reportedDate: r.filing_date       ?? '',
      action:       (r.transaction_type?.includes('Sale') ? 'Sell' : r.transaction_type?.includes('Purchase') ? 'Buy' : 'Exchange') as CongressTrade['action'],
      amount:       r.amount_range_label ?? '',
      comment:      r.comment ?? '',
      state:        r.state   ?? '',
    }))
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * 取得最近國會議員交易（全部或特定股票）
 * 優先使用 Quiver，回退至 House Disclosure
 */
export async function getRecentCongressTrades(
  ticker?: string,
  limit = 50,
): Promise<CongressTrade[]> {
  // Try Quiver first
  if (QUIVER_KEY) {
    try {
      const endpoint = ticker
        ? `/live/congresstrading/${ticker.toUpperCase()}`
        : '/live/congresstrading';

      const raw = await quiverGet<Array<{
        Name:          string;
        Party:         string;
        Chamber:       string;
        Ticker:        string;
        TransactionDate: string;
        ReportDate:    string;
        Transaction:   string;
        Range:         string;
        Comment?:      string;
        State?:        string;
      }>>(endpoint);

      return raw.slice(0, limit).map(r => ({
        politician:   r.Name,
        party:        (r.Party === 'Democrat' ? 'D' : r.Party === 'Republican' ? 'R' : 'I') as CongressTrade['party'],
        chamber:      (r.Chamber === 'Senate' ? 'Senate' : 'House') as CongressTrade['chamber'],
        ticker:       r.Ticker?.toUpperCase(),
        tradeDate:    r.TransactionDate,
        reportedDate: r.ReportDate,
        action:       (r.Transaction?.includes('Sale') ? 'Sell' : r.Transaction?.includes('Purchase') ? 'Buy' : 'Exchange') as CongressTrade['action'],
        amount:       r.Range,
        comment:      r.Comment ?? '',
        state:        r.State   ?? '',
      }));
    } catch (e) {
      console.warn('[Capitol] Quiver failed, falling back to House Disclosure:', (e as Error).message);
    }
  }

  // Fallback: House Disclosure public S3
  return fetchHouseDisclosureRecent(ticker).then(r => r.slice(0, limit));
}

/**
 * 分析特定股票的國會議員交易模式
 */
export function analyzeCongressTrades(trades: CongressTrade[]): {
  totalTrades:  number;
  buyCount:     number;
  sellCount:    number;
  buyBias:      'bullish' | 'bearish' | 'neutral';
  recentActivity: CongressTrade[];
  topTraders:   Array<{ name: string; count: number; lastAction: string }>;
} {
  const buyCount  = trades.filter(t => t.action === 'Buy').length;
  const sellCount = trades.filter(t => t.action === 'Sell').length;

  const buyBias: 'bullish' | 'bearish' | 'neutral' =
    buyCount > sellCount * 1.5  ? 'bullish' :
    sellCount > buyCount * 1.5  ? 'bearish' : 'neutral';

  // Top traders
  const traderMap = new Map<string, { count: number; lastAction: string; lastDate: string }>();
  for (const t of trades) {
    const existing = traderMap.get(t.politician);
    if (!existing || t.tradeDate > existing.lastDate) {
      traderMap.set(t.politician, {
        count:      (existing?.count ?? 0) + 1,
        lastAction: t.action,
        lastDate:   t.tradeDate,
      });
    } else {
      existing.count++;
    }
  }

  const topTraders = [...traderMap.entries()]
    .map(([name, { count, lastAction }]) => ({ name, count, lastAction }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalTrades: trades.length,
    buyCount,
    sellCount,
    buyBias,
    recentActivity: trades.slice(0, 10),
    topTraders,
  };
}

/** Format amount range for display */
export function formatAmountRange(amount: string): string {
  const map: Record<string, string> = {
    '$1,001 - $15,000':    '$1K–$15K',
    '$15,001 - $50,000':   '$15K–$50K',
    '$50,001 - $100,000':  '$50K–$100K',
    '$100,001 - $250,000': '$100K–$250K',
    '$250,001 - $500,000': '$250K–$500K',
    '$500,001 - $1,000,000': '$500K–$1M',
    '$1,000,001 - $5,000,000': '$1M–$5M',
    'Over $5,000,000':     '> $5M',
  };
  return map[amount] ?? amount;
}
