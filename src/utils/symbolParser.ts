/**
 * src/utils/symbolParser.ts — Cross-source symbol parser
 *
 * 本專案資料源：
 *   - Yahoo Finance    : 主要、現行預設（`2330.TW`, `AAPL`, `USDTWD=X`, `BTC-USD`）
 *   - TradingView      : 透過 tradingview-scraper（`TPE:2330`, `NASDAQ:AAPL`, `FX_IDC:USDTWD`）
 *   - TWSE / TPEX API  : 台股補強（`2330`）
 *
 * Yahoo 與 TradingView 的 symbol 格式不同，需要 parser 做雙向轉換，
 * 避免各層（UI / server / python service）直接散落字串處理邏輯。
 *
 * 使用原則：
 *   1. 內部流通一律使用 `CanonicalSymbol`（含 market / board / code）。
 *   2. 呼叫 Yahoo 前用 `toYahoo()`；呼叫 TradingView 前用 `toTradingView()`。
 *   3. 收到外部字串用 `parseSymbol()` 正規化。
 */

export type Market =
  | 'TW'      // 台股上市
  | 'TWO'     // 台股上櫃
  | 'US'      // 美股（NYSE / NASDAQ / AMEX 合併，查詢時交給下游解析）
  | 'HK'
  | 'JP'
  | 'CRYPTO'
  | 'FOREX'
  | 'INDEX'
  | 'UNKNOWN';

export interface CanonicalSymbol {
  /** 原始輸入，方便除錯 */
  raw: string;
  /** 純代號（去掉交易所 / 後綴） */
  code: string;
  /** 市場 */
  market: Market;
  /** TradingView 交易所 hint（若輸入已包含） */
  tvExchange?: string;
}

// ── Yahoo 後綴 → Market ─────────────────────────────────────────────────────
const YAHOO_SUFFIX_MAP: Record<string, Market> = {
  TW: 'TW',
  TWO: 'TWO',
  HK: 'HK',
  T: 'JP',   // Tokyo
};

// ── Market → TradingView 預設交易所 ─────────────────────────────────────────
const TV_EXCHANGE_BY_MARKET: Record<Market, string> = {
  TW: 'TPE',        // TradingView 台灣上市
  TWO: 'TPEX',      // TradingView 上櫃
  US: 'NASDAQ',     // fallback，SymbolMarkets 可再解析
  HK: 'HKEX',
  JP: 'TSE',
  CRYPTO: 'BINANCE',
  FOREX: 'FX_IDC',
  INDEX: 'TVC',
  UNKNOWN: '',
};

// 已知美股交易所，當 symbol 已帶前綴時保留
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS', 'OTC']);

// 指數別名（Yahoo `^TWII` ↔ TradingView `TVC:TAIEX`）
const INDEX_ALIASES: Record<string, { yahoo: string; tv: string }> = {
  TAIEX:   { yahoo: '^TWII',  tv: 'TVC:TAIEX' },
  TPEx:    { yahoo: '^TWOII', tv: 'TVC:TWOII' },
  SPX:     { yahoo: '^GSPC',  tv: 'SP:SPX' },
  NDX:     { yahoo: '^NDX',   tv: 'NASDAQ:NDX' },
  DJI:     { yahoo: '^DJI',   tv: 'DJ:DJI' },
  VIX:     { yahoo: '^VIX',   tv: 'CBOE:VIX' },
  N225:    { yahoo: '^N225',  tv: 'TVC:NI225' },
  HSI:     { yahoo: '^HSI',   tv: 'TVC:HSI' },
};

// Yahoo forex 格式為 `USDTWD=X`；TradingView 用 `FX_IDC:USDTWD`
const FOREX_RE = /^([A-Z]{3})([A-Z]{3})=X$/;

// Yahoo crypto 格式為 `BTC-USD`；TradingView 主用 `BINANCE:BTCUSDT`
const YAHOO_CRYPTO_RE = /^([A-Z0-9]+)-([A-Z]{3,5})$/;

// TradingView 風格 `EXCHANGE:CODE`
const TV_RE = /^([A-Z_]+):([A-Z0-9.]+)$/;

/**
 * 將任意輸入正規化為 CanonicalSymbol。
 * 接受：
 *   - Yahoo：`2330.TW`, `AAPL`, `USDTWD=X`, `BTC-USD`, `^TWII`
 *   - TradingView：`TPE:2330`, `NASDAQ:AAPL`, `BINANCE:BTCUSDT`
 *   - 裸代號（台股常見）：`2330` → 推定為 TW
 */
export function parseSymbol(input: string): CanonicalSymbol {
  const raw = input.trim().toUpperCase();

  // 1) TradingView 格式
  const tv = raw.match(TV_RE);
  if (tv) {
    const [, exchange, code] = tv;
    let market: Market = 'UNKNOWN';
    if (exchange === 'TPE') market = 'TW';
    else if (exchange === 'TPEX') market = 'TWO';
    else if (US_EXCHANGES.has(exchange)) market = 'US';
    else if (exchange === 'HKEX') market = 'HK';
    else if (exchange === 'TSE') market = 'JP';
    else if (exchange === 'BINANCE' || exchange === 'COINBASE' || exchange === 'BITSTAMP') market = 'CRYPTO';
    else if (exchange === 'FX_IDC' || exchange === 'FX' || exchange === 'OANDA') market = 'FOREX';
    else if (exchange === 'TVC' || exchange === 'SP' || exchange === 'DJ' || exchange === 'CBOE') market = 'INDEX';
    return { raw: input, code, market, tvExchange: exchange };
  }

  // 2) Yahoo 指數別名（^ 開頭）
  if (raw.startsWith('^')) {
    const alias = Object.values(INDEX_ALIASES).find(a => a.yahoo === raw);
    const code = alias ? alias.tv.split(':')[1] : raw.slice(1);
    return { raw: input, code, market: 'INDEX' };
  }

  // 3) Forex
  const fx = raw.match(FOREX_RE);
  if (fx) return { raw: input, code: `${fx[1]}${fx[2]}`, market: 'FOREX' };

  // 4) Yahoo Crypto
  const cr = raw.match(YAHOO_CRYPTO_RE);
  if (cr) {
    const quote = cr[2] === 'USD' ? 'USDT' : cr[2];
    return { raw: input, code: `${cr[1]}${quote}`, market: 'CRYPTO' };
  }

  // 5) Yahoo 後綴（`.TW`, `.TWO`, `.HK`, `.T`）
  const dot = raw.lastIndexOf('.');
  if (dot > 0) {
    const code = raw.slice(0, dot);
    const suffix = raw.slice(dot + 1);
    const market = YAHOO_SUFFIX_MAP[suffix] ?? 'UNKNOWN';
    return { raw: input, code, market };
  }

  // 6) 純數字 → 推定台股
  if (/^\d{4,6}$/.test(raw)) {
    return { raw: input, code: raw, market: 'TW' };
  }

  // 7) 其他純字母 → 視為美股
  if (/^[A-Z.]{1,6}$/.test(raw)) {
    return { raw: input, code: raw, market: 'US' };
  }

  return { raw: input, code: raw, market: 'UNKNOWN' };
}

/** 轉回 Yahoo Finance 格式 */
export function toYahoo(s: CanonicalSymbol | string): string {
  const sym = typeof s === 'string' ? parseSymbol(s) : s;
  switch (sym.market) {
    case 'TW':  return `${sym.code}.TW`;
    case 'TWO': return `${sym.code}.TWO`;
    case 'HK':  return `${sym.code}.HK`;
    case 'JP':  return `${sym.code}.T`;
    case 'FOREX': return `${sym.code}=X`;
    case 'CRYPTO': {
      // BTCUSDT → BTC-USD（Yahoo 多以 USD 計價）
      const m = sym.code.match(/^([A-Z0-9]+?)(USDT|USDC|BUSD|USD)$/);
      return m ? `${m[1]}-USD` : sym.code;
    }
    case 'INDEX': {
      const alias = INDEX_ALIASES[sym.code];
      return alias?.yahoo ?? `^${sym.code}`;
    }
    case 'US':
    default:
      return sym.code;
  }
}

/** 轉為 TradingView `EXCHANGE:CODE` */
export function toTradingView(
  s: CanonicalSymbol | string,
  opts?: { exchange?: string; quote?: 'USDT' | 'USD' },
): string {
  const sym = typeof s === 'string' ? parseSymbol(s) : s;
  const exchange = opts?.exchange ?? sym.tvExchange ?? TV_EXCHANGE_BY_MARKET[sym.market];

  if (sym.market === 'INDEX') {
    const alias = INDEX_ALIASES[sym.code];
    if (alias) return alias.tv;
  }

  if (sym.market === 'CRYPTO') {
    // Yahoo 的 `BTC-USD` 已在 parseSymbol() 轉為 `BTCUSDT`
    const base = sym.code.replace(/USDT?$/, '');
    const quote = opts?.quote ?? 'USDT';
    return `${exchange || 'BINANCE'}:${base}${quote}`;
  }

  if (!exchange) return sym.code;
  return `${exchange}:${sym.code}`;
}

/**
 * 給 TradingView `Overview.get_symbol_overview` 用的完整 symbol。
 * 等同 toTradingView()，保留別名方便閱讀。
 */
export const toTVOverviewSymbol = toTradingView;

/** 給 `Indicators.scrape(exchange=, symbol=)` 用的拆分結果 */
export function toTVExchangeSymbol(
  s: CanonicalSymbol | string,
  opts?: { exchange?: string },
): { exchange: string; symbol: string } {
  const sym = typeof s === 'string' ? parseSymbol(s) : s;
  const exchange = opts?.exchange ?? sym.tvExchange ?? TV_EXCHANGE_BY_MARKET[sym.market] ?? '';

  if (sym.market === 'CRYPTO') {
    const base = sym.code.replace(/USDT?$/, '');
    return { exchange: exchange || 'BINANCE', symbol: `${base}USDT` };
  }
  return { exchange, symbol: sym.code };
}
