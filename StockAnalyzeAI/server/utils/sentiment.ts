/**
 * server/utils/sentiment.ts
 * 新聞情緒分析模組 — 繁體中文關鍵字計分演算法
 *
 * 1. 透過 Yahoo Finance /v1/finance/search?q=SYMBOL&newsCount=5 取得新聞標題
 * 2. 對每則標題計算正向/負向關鍵字分數
 * 3. 回傳平均分數與「偏向樂觀 / 中立 / 偏向悲觀」結論
 */

export interface NewsItem {
  title: string;
  publisher?: string;
  link?: string;
  publishedAt?: number; // unix seconds
  score: number;        // -1 ~ +1
}

export interface SentimentResult {
  conclusion:    '偏向樂觀' | '中立' | '偏向悲觀';
  avgScore:      number;   // -1 ~ +1
  bullCount:     number;
  bearCount:     number;
  neutralCount:  number;
  news:          NewsItem[];
}

// ── 關鍵字庫 ──────────────────────────────────────────────────────────────────

const POSITIVE_KW = [
  // 英文
  'surge', 'rally', 'record', 'beat', 'growth', 'profit', 'strong', 'upgrade',
  'outperform', 'buy', 'positive', 'gain', 'rise', 'rose', 'high', 'bullish',
  'expansion', 'optimistic', 'boost', 'breakout', 'momentum', 'soar',
  // 繁體中文
  '上漲', '創高', '買進', '升級', '超越', '突破', '盈餘', '獲利', '強勁', '樂觀',
  '看漲', '買入', '上調', '利多', '增長', '推升', '反彈', '新高', '超預期',
  '成長', '走揚', '拉升', '好消息',
];

const NEGATIVE_KW = [
  // 英文
  'crash', 'plunge', 'decline', 'loss', 'miss', 'weak', 'downgrade', 'sell',
  'bearish', 'fall', 'fell', 'risk', 'warning', 'cut', 'lower', 'concern',
  'recession', 'pessimistic', 'drop', 'breakdown', 'slump', 'tumble',
  // 繁體中文
  '下跌', '崩盤', '虧損', '降級', '賣出', '看跌', '下調', '利空', '衰退',
  '風險', '警告', '急跌', '悲觀', '下修', '壓力', '跌破', '新低', '低迷',
  '走弱', '跌幅', '壞消息', '套牢',
];

// ── 單則新聞計分 ──────────────────────────────────────────────────────────────

function scoreTitle(title: string): number {
  const lower = title.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const kw of POSITIVE_KW) if (lower.includes(kw.toLowerCase())) pos++;
  for (const kw of NEGATIVE_KW) if (lower.includes(kw.toLowerCase())) neg++;
  const total = pos + neg;
  if (total === 0) return 0;
  return parseFloat(((pos - neg) / total).toFixed(3));
}

// ── 主函式 ────────────────────────────────────────────────────────────────────

/**
 * 傳入新聞陣列（通常來自 Yahoo Finance search API），
 * 回傳情緒分析結果。
 */
export function analyzeSentiment(
  rawNews: Array<{ title?: string; publisher?: string; link?: string; providerPublishTime?: number }>,
  maxItems = 3,
): SentimentResult {
  const items = rawNews.slice(0, maxItems);

  const scored: NewsItem[] = items.map(n => ({
    title:       n.title ?? '',
    publisher:   n.publisher,
    link:        n.link,
    publishedAt: n.providerPublishTime,
    score:       scoreTitle(n.title ?? ''),
  }));

  const bullCount    = scored.filter(n => n.score > 0.1).length;
  const bearCount    = scored.filter(n => n.score < -0.1).length;
  const neutralCount = scored.length - bullCount - bearCount;

  const avgScore = scored.length === 0
    ? 0
    : parseFloat((scored.reduce((s, n) => s + n.score, 0) / scored.length).toFixed(3));

  let conclusion: SentimentResult['conclusion'];
  if (avgScore > 0.12)       conclusion = '偏向樂觀';
  else if (avgScore < -0.12) conclusion = '偏向悲觀';
  else                       conclusion = '中立';

  return { conclusion, avgScore, bullCount, bearCount, neutralCount, news: scored };
}
