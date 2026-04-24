import type {
  CandlePoint,
  DashboardNews,
  HeatmapCell,
  Holding,
  Mover,
  NewsFeedItem,
  TickerSummary,
  TradeLog,
  WatchlistRow,
} from './types';

export const indexTickers: TickerSummary[] = [
  { label: 'S&P 500', value: '5,088.80', changePct: 0.03 },
  { label: 'DOW', value: '39,131.53', changePct: 0.16 },
  { label: 'NASDAQ', value: '15,996.82', changePct: -0.28 },
  { label: 'RUT', value: '2,016.69', changePct: 0.14 },
  { label: 'VIX', value: '13.75', changePct: -5.43 },
  { label: 'BTC/USD', value: '51,450.00', changePct: 1.2 },
];

export const watchlistRows: WatchlistRow[] = [
  { symbol: 'AAPL', last: 182.52, changePct: 1.24, volume: '45M' },
  { symbol: 'TSLA', last: 191.97, changePct: -2.76, volume: '112M' },
  { symbol: 'NVDA', last: 788.17, changePct: 0.36, volume: '68M' },
  { symbol: 'MSFT', last: 410.34, changePct: -0.32, volume: '22M' },
  { symbol: 'AMD', last: 176.52, changePct: 2.1, volume: '55M' },
];

export const heatmapCells: HeatmapCell[] = [
  { label: 'TECH', changePct: 1.2, weight: 3 },
  { label: 'FIN', changePct: -0.8, weight: 1 },
  { label: 'HC', changePct: 0.4, weight: 1 },
  { label: 'CD', changePct: 1.5, weight: 2 },
  { label: 'IND', changePct: -1.2, weight: 1 },
  { label: 'ENG', changePct: 0.0, weight: 1 },
  { label: 'COMM', changePct: 0.9, weight: 2 },
  { label: 'UTIL', changePct: -0.5, weight: 1 },
];

export const dashboardNews: DashboardNews[] = [
  {
    id: 'n1',
    category: 'EARNINGS',
    time: '10:42 AM',
    title: 'NVIDIA Q4 Revenue Surpasses Expectations, Driven by AI Data Center Demand',
    tickers: ['NVDA', 'AMD'],
  },
  {
    id: 'n2',
    category: 'MACRO',
    time: '10:15 AM',
    title: 'Fed Minutes Indicate Caution on Interest Rate Cuts Before Summer',
    tickers: ['SPY', 'TLT'],
  },
  {
    id: 'n3',
    category: 'ALERT',
    time: '09:58 AM',
    title: 'Tesla Halts Production at Giga Berlin Due to Supply Chain Disruptions',
    tickers: ['TSLA'],
  },
  {
    id: 'n4',
    category: 'CRYPTO',
    time: '09:30 AM',
    title: 'Bitcoin Stabilizes Above $51K as Institutional ETF Inflows Continue',
    tickers: ['BTC', 'COIN'],
  },
];

export const topGainers: Mover[] = [
  { symbol: 'SMCI', changePct: 12.5 },
  { symbol: 'ARM', changePct: 8.3 },
  { symbol: 'PLTR', changePct: 5.1 },
];

export const topLosers: Mover[] = [
  { symbol: 'BA', changePct: -4.7 },
  { symbol: 'PFE', changePct: -3.2 },
  { symbol: 'INTC', changePct: -2.4 },
];

export const nvdaWeekly: CandlePoint[] = [
  { t: 0, open: 770, high: 774, low: 766, close: 772, volume: 52 },
  { t: 1, open: 772, high: 776, low: 764, close: 768, volume: 48 },
  { t: 2, open: 768, high: 779, low: 766, close: 776, volume: 61 },
  { t: 3, open: 776, high: 788, low: 772, close: 784, volume: 72 },
  { t: 4, open: 784, high: 786, low: 774, close: 779, volume: 55 },
  { t: 5, open: 779, high: 790, low: 777, close: 787, volume: 64 },
  { t: 6, open: 787, high: 792.15, low: 775.2, close: 788.17, volume: 68 },
];

export const portfolioHoldings: Holding[] = [
  {
    symbol: 'AAPL',
    qty: 1500,
    cost: 175.2,
    price: 189.45,
    marketValue: 284175,
    pnl: 21375,
    pnlPct: 12.5,
    sectorTint: 'bg-amber-400',
  },
  {
    symbol: 'MSFT',
    qty: 800,
    cost: 390.1,
    price: 412.3,
    marketValue: 329840,
    pnl: 17760,
    pnlPct: 5.6,
    sectorTint: 'bg-cyan-400',
  },
  {
    symbol: 'TSLA',
    qty: 2000,
    cost: 215.5,
    price: 178.9,
    marketValue: 357800,
    pnl: -73200,
    pnlPct: -17.0,
    sectorTint: 'bg-rose-400',
  },
  {
    symbol: 'NVDA',
    qty: 450,
    cost: 780.0,
    price: 920.5,
    marketValue: 414225,
    pnl: 63225,
    pnlPct: 18.0,
    sectorTint: 'bg-amber-500',
  },
  {
    symbol: 'AMZN',
    qty: 1200,
    cost: 165.3,
    price: 180.2,
    marketValue: 216240,
    pnl: 17880,
    pnlPct: 9.0,
    sectorTint: 'bg-stone-400',
  },
];

export const navSeries: Array<{ t: number; v: number }> = [
  { t: 0, v: 2100000 },
  { t: 1, v: 2090000 },
  { t: 2, v: 2150000 },
  { t: 3, v: 2200000 },
  { t: 4, v: 2180000 },
  { t: 5, v: 2260000 },
  { t: 6, v: 2320000 },
  { t: 7, v: 2300000 },
  { t: 8, v: 2380000 },
  { t: 9, v: 2430000 },
  { t: 10, v: 2460000 },
  { t: 11, v: 2450183.45 },
];

export const tradeLog: TradeLog[] = [
  {
    datetime: '2024-05-14 09:30:15',
    type: 'BUY',
    symbol: 'NVDA',
    qty: 50,
    price: 915.2,
    total: 45760,
  },
  {
    datetime: '2024-05-10 14:15:00',
    type: 'SELL',
    symbol: 'TSLA',
    qty: 500,
    price: 175.4,
    total: 87700,
  },
  {
    datetime: '2024-05-02 10:05:22',
    type: 'BUY',
    symbol: 'AAPL',
    qty: 200,
    price: 170.5,
    total: 34100,
  },
];

export const sectorAllocation = [
  { label: '資訊科技 (IT)', pct: 35, color: '#a78b6a' },
  { label: '通訊服務 (Comm)', pct: 25, color: '#22d3ee' },
  { label: '非必需消費品', pct: 20, color: '#f59e0b' },
  { label: '金融 (Financials)', pct: 15, color: '#fca5a5' },
  { label: '其他 (Others)', pct: 5, color: '#6b7280' },
];

export const newsFeed: NewsFeedItem[] = [
  {
    id: 'RTRS-20241024-8849',
    referenceId: 'RTRS-20241024-8849',
    time: '10:42:05',
    source: 'REUTERS',
    title: '聯準會官員暗示可能暫停升息，市場預期通膨壓力趨緩',
    tags: [
      { label: '宏觀經濟', tone: 'sector' },
      { label: '看多', tone: 'bullish' },
    ],
    summary: '多位 Fed 官員發表談話，暗示可能暫停升息步伐。',
    body: [
      '華盛頓（路透社）- 多位美國聯邦準備理事會（Fed）官員週四發表談話，暗示在連續多次大幅升息後，央行可能在即將到來的政策會議上選擇暫停升息步伐，以評估緊縮政策對實體經濟的累積效應。',
      '這項轉變主要源於近期公佈的一系列經濟數據顯示，儘管核心通膨仍高於央行2%的目標，但整體物價上漲壓力已出現實質性趨緩的跡象。特別是在住房成本和部分服務業領域，價格增速正在放緩。',
      '消息傳出後，美國公債殖利率應聲回落，基準10年期公債殖利率跌破關鍵心理關卡。同時，股市三大指數在早盤交易中均呈現上揚態勢，反映出投資人對於借貸成本可能見頂的樂觀情緒。',
      '分析師指出，如果 Fed 確實暫停升息，這將標誌著本輪緊縮週期的重大轉折點，對於對利率敏感的科技股和房地產板塊可能帶來提振作用。然而，官員們也強調，將維持 "higher for longer"（較高利率維持更長時間）的立場，直到確信通膨穩步朝向目標回落。',
    ],
    pullQuote: {
      text: '我們已經採取了積極的行動，現在可能是時候讓這些政策在經濟中發揮作用，並仔細觀察數據的演變。',
      attribution: '不具名Fed資深官員',
    },
    impact: {
      sentiment: 'BULLISH',
      tickers: [
        { symbol: 'SPY', changePct: 0.45 },
        { symbol: 'QQQ', changePct: 0.62 },
        { symbol: 'TLT', changePct: -0.12 },
      ],
    },
    publishedUtc: '2024-10-24 10:42:05 UTC',
  },
  {
    id: 'BLBG-20241024-7712',
    referenceId: 'BLBG-20241024-7712',
    time: '10:35:12',
    source: 'BLOOMBERG',
    title: '蘋果公司供應鏈面臨挑戰，亞洲主要組裝廠產能下滑',
    tags: [
      { label: '科技', tone: 'sector' },
      { label: '看空', tone: 'bearish' },
    ],
    summary: 'Apple 供應鏈下修 Q3 出貨預估。',
    body: [
      '彭博社引述知情人士消息指出，Apple 亞洲關鍵組裝廠於本季出現明顯產能下滑，下修了原先對 Q3 旗艦新機的出貨預估，市場分析師正在重新評估公司短期營收展望。',
      '消息來源表示，下滑的主因包含關鍵零組件短缺、以及供應鏈上游部分廠商的勞動力問題。',
    ],
    impact: {
      sentiment: 'BEARISH',
      tickers: [
        { symbol: 'AAPL', changePct: -0.87 },
        { symbol: 'FXI', changePct: -0.31 },
      ],
    },
    publishedUtc: '2024-10-24 10:35:12 UTC',
  },
  {
    id: 'WSJ-20241024-5531',
    referenceId: 'WSJ-20241024-5531',
    time: '10:28:45',
    source: 'WSJ',
    title: 'OPEC+ 意外宣佈減產，國際油價飆升突破80美元大關',
    tags: [
      { label: '能源', tone: 'sector' },
      { label: '看多', tone: 'bullish' },
    ],
    summary: 'OPEC+ 會議宣布延長減產至年底。',
    body: [
      '華爾街日報報導，OPEC+ 於會議中宣布進一步延長自願減產措施至年底，消息發布後，布蘭特原油一度衝高至每桶80美元以上，創下半年以來新高。',
    ],
    impact: {
      sentiment: 'BULLISH',
      tickers: [
        { symbol: 'XLE', changePct: 1.82 },
        { symbol: 'USO', changePct: 2.11 },
      ],
    },
    publishedUtc: '2024-10-24 10:28:45 UTC',
  },
  {
    id: 'CNBC-20241024-4402',
    referenceId: 'CNBC-20241024-4402',
    time: '10:15:00',
    source: 'CNBC',
    title: '美國非農就業數據超預期，顯示勞動力市場依然強勁',
    tags: [
      { label: '宏觀經濟', tone: 'sector' },
      { label: '中性', tone: 'neutral' },
    ],
    summary: '新增非農就業人數超出預期 8 萬人。',
    body: [
      'CNBC 報導，最新公布的美國非農就業數據意外強勁，新增就業人數較市場預期高出約 8 萬人，失業率維持低檔。',
      '市場對此消息反應分歧：一方面顯示經濟韌性，另一方面也可能延後 Fed 降息時程。',
    ],
    impact: {
      sentiment: 'NEUTRAL',
      tickers: [
        { symbol: 'DXY', changePct: 0.22 },
        { symbol: 'TLT', changePct: -0.35 },
      ],
    },
    publishedUtc: '2024-10-24 10:15:00 UTC',
  },
];

export const aaplCandles: CandlePoint[] = Array.from({ length: 30 }, (_, i) => {
  const base = 170 + i * 0.45 + Math.sin(i / 2.2) * 3.2;
  const open = base + (Math.random() - 0.5) * 1.4;
  const close = base + (Math.random() - 0.3) * 2.1;
  const high = Math.max(open, close) + Math.random() * 1.8;
  const low = Math.min(open, close) - Math.random() * 1.8;
  return {
    t: i,
    open,
    high,
    low,
    close,
    volume: 30 + Math.random() * 25,
  };
});

export const aaplMacd = Array.from({ length: 30 }, (_, i) => {
  const hist = Math.sin(i / 3) * 0.8 + Math.cos(i / 4.2) * 0.3;
  return { t: i, hist };
});

export const aaplRecentNews = [
  {
    time: '10:45 AM',
    title: 'Apple 宣布擴大 AI 領域投資，預計整合至次世代作業系統...',
  },
  {
    time: '08:30 AM',
    title: '分析師上調 AAPL 目標價至 $210，看好服務營收增長動能。',
  },
  {
    time: 'Yesterday',
    title: '供應鏈報告指出 Q3 旗艦機種備貨量優於預期。',
  },
];
