# TradingView Scraper 整合指南

參考來源：[mnwato/tradingview-scraper](https://github.com/mnwato/tradingview-scraper)（MIT 授權，Python 套件）。

本文件整理此套件的功能、API、參數與在 **StockAnalyzeAI**（TypeScript / Node）專案中的整合方式，方便後端 `server/services` 層呼叫。

---

## 1. 套件概觀

`tradingview-scraper` 是一個 Python 套件，可即時抓取 TradingView.com 的公開資料，包含想法（Ideas）、新聞、技術指標、即時 OHLCV、篩選器、漲跌幅排行、基本面、財報行事曆、社群討論等。

- **語言**：Python（100%）
- **最新版本**：0.4.20（2025/12）
- **授權**：MIT
- **輸出**：Python dict / JSON / CSV

---

## 2. 安裝

```bash
pip install tradingview-scraper
pip install --upgrade --no-cache tradingview-scraper
```

（選用）在 `.env` 設定 `TRADINGVIEW_COOKIE` 以略過 captcha 驗證。

---

## 3. 主要類別總覽

| 類別 | 模組 | 用途 |
|------|------|------|
| `Ideas` | `tradingview_scraper.symbols.ideas` | 抓取特定標的交易想法 |
| `Indicators` | `tradingview_scraper.symbols.technicals` | 取得技術指標（RSI、MACD…） |
| `NewsScraper` | `tradingview_scraper.symbols.news` | 新聞標題與全文 |
| `RealTimeData` | `tradingview_scraper.symbols.stream` | 即時 OHLCV 串流、watchlist |
| `Streamer` | `tradingview_scraper.symbols.stream` | 同時串流價格與指標 |
| `Screener` | `tradingview_scraper.symbols.screener` | 市場篩選器（18 個市場） |
| `MarketMovers` | `tradingview_scraper.symbols.market_movers` | 漲幅/跌幅/銅板股排行 |
| `SymbolMarkets` | `tradingview_scraper.symbols.symbol_markets` | 某標的在各交易所的資訊 |
| `Markets` | `tradingview_scraper.symbols.markets` | 依市值/成交量取頂部股票 |
| `Overview` | `tradingview_scraper.symbols.overview` | 標的完整總覽 |
| `Minds` | `tradingview_scraper.symbols.minds` | 社群討論 |
| `FundamentalGraphs` | `tradingview_scraper.symbols.fundamental_graphs` | 財報 / 基本面比率 |
| `CalendarScraper` | `tradingview_scraper.symbols.cal` | 財報日、除息行事曆 |

---

## 4. 使用範例

### 4.1 Ideas — 交易想法

```python
from tradingview_scraper.symbols.ideas import Ideas

ideas_scraper = Ideas(export_result=True, export_type='json')
ideas = ideas_scraper.scrape(
    symbol="BTCUSD",
    startPage=1,
    endPage=2,
    sort="popular"   # popular | recent
)
```

### 4.2 Indicators — 技術指標

```python
from tradingview_scraper.symbols.technicals import Indicators

indicators_scraper = Indicators(export_result=True, export_type='json')

# 指定指標
indicators = indicators_scraper.scrape(
    exchange="BINANCE",
    symbol="BTCUSD",
    timeframe="1d",
    indicators=["RSI", "Stoch.K"]
)

# 全部指標
all_ind = indicators_scraper.scrape(
    symbol="BTCUSD",
    timeframe="4h",
    allIndicators=True
)
```

支援指標：RSI、Stoch.K、MACD、ADX、CCI 等 50+ 種。

### 4.3 NewsScraper — 新聞

```python
from tradingview_scraper.symbols.news import NewsScraper

news = NewsScraper(export_result=True, export_type='json')
headlines = news.scrape_headlines(
    symbol='BTCUSD',
    exchange='BINANCE',
    provider='newsbtc',
    area='world',
    section='all',
    sort='latest'
)

content = news.scrape_news_content(
    story_path=headlines['data'][0]['storyPath']
)
```

### 4.4 RealTimeData — 即時 OHLCV

```python
from tradingview_scraper.symbols.stream import RealTimeData

rt = RealTimeData()

for packet in rt.get_ohlcv(exchange_symbol="BINANCE:BTCUSDT"):
    print(packet)

# 多檔 watchlist
for packet in rt.get_latest_trade_info(
    exchange_symbol=["BINANCE:BTCUSDT", "FXOPEN:XAUUSD"]
):
    print(packet)
```

### 4.5 Streamer — 價格 + 指標同步串流

```python
from tradingview_scraper.symbols.stream import Streamer

streamer = Streamer(websocket_jwt_token="Your-JWT-Token")

for pkt in streamer.stream(
    exchange="BINANCE",
    symbol="BTCUSDT",
    timeframe="4h",
    numb_price_candles=100,
    indicator_id="STD;RSI",
    indicator_version="31.0"
):
    print(pkt)
```

### 4.6 Screener — 篩選器

```python
from tradingview_scraper.symbols.screener import Screener

screener = Screener()

filters = [
    {'left': 'close',  'operation': 'greater', 'right': 100},
    {'left': 'volume', 'operation': 'greater', 'right': 1_000_000},
]

results = screener.screen(
    market='america',
    filters=filters,
    sort_by='volume',
    sort_order='desc',
    limit=20
)
```

**支援市場**：`america, australia, canada, germany, india, israel, italy, luxembourg, mexico, spain, turkey, uk, crypto, forex, cfd, futures, bonds, global`

**過濾運算子**：`greater, less, egreater, eless, equal, nequal, in_range, not_in_range, above, below, crosses, crosses_above, crosses_below, has, has_none_of`

### 4.7 MarketMovers — 漲跌排行

```python
from tradingview_scraper.symbols.market_movers import MarketMovers

mm = MarketMovers(export_result=True, export_type='json')

gainers = mm.scrape(market='stocks-usa', category='gainers', limit=20)
penny   = mm.scrape(market='stocks-usa', category='penny-stocks', limit=50)
losers  = mm.scrape(
    market='stocks-usa',
    category='losers',
    fields=['name', 'close', 'change', 'volume', 'market_cap_basic'],
    limit=10
)
```

**市場**：`stocks-usa, stocks-uk, stocks-india, stocks-australia, stocks-canada, crypto, forex, bonds, futures`

**類別**：`gainers, losers, most-active, penny-stocks, pre-market-gainers, pre-market-losers, after-hours-gainers, after-hours-losers`

### 4.8 SymbolMarkets — 跨交易所查詢

```python
from tradingview_scraper.symbols.symbol_markets import SymbolMarkets

sm = SymbolMarkets()
sm.scrape(symbol='AAPL')
sm.scrape(symbol='AAPL', scanner='america')
sm.scrape(symbol='BTCUSD', scanner='crypto', limit=100)
```

**scanner**：`global, america, crypto, forex, cfd`

### 4.9 Markets — 頂部股票

```python
from tradingview_scraper.symbols.markets import Markets

markets = Markets()
markets.get_top_stocks(market='america', by='market_cap', limit=20)
markets.get_top_stocks(market='america', by='volume',     limit=30)
markets.get_top_stocks(market='america', by='change',     limit=25)
```

**排序依據**：`market_cap, volume, change, price, volatility`

### 4.10 Overview — 標的總覽

```python
from tradingview_scraper.symbols.overview import Overview

ov = Overview()
ov.get_symbol_overview(symbol='NASDAQ:AAPL')
ov.get_profile(symbol='NASDAQ:AAPL')
ov.get_statistics(symbol='NASDAQ:AAPL')
ov.get_financials(symbol='NASDAQ:AAPL')
ov.get_performance(symbol='NASDAQ:AAPL')
ov.get_technicals(symbol='NASDAQ:AAPL')
```

**Symbol 格式**：`NASDAQ:AAPL`、`NYSE:TSLA`、`LSE:VOD`、`BITSTAMP:BTCUSD`、`BINANCE:BTCUSDT`、`FX:EURUSD`

### 4.11 Minds — 社群討論

```python
from tradingview_scraper.symbols.minds import Minds

m = Minds()
m.get_minds(symbol='NASDAQ:AAPL', sort='recent',   limit=20)
m.get_minds(symbol='NASDAQ:TSLA', sort='popular',  limit=15)
m.get_minds(symbol='BITSTAMP:BTCUSD', sort='trending', limit=25)
m.get_all_minds(symbol='NASDAQ:AAPL', sort='popular', max_results=100)
```

### 4.12 FundamentalGraphs — 基本面

```python
from tradingview_scraper.symbols.fundamental_graphs import FundamentalGraphs

fg = FundamentalGraphs()
fg.get_fundamentals(symbol='NASDAQ:AAPL')
fg.get_income_statement(symbol='NASDAQ:AAPL')
fg.get_balance_sheet(symbol='NASDAQ:MSFT')
fg.get_cash_flow(symbol='NASDAQ:GOOGL')
fg.get_profitability(symbol='NASDAQ:AAPL')
fg.get_margins(symbol='NASDAQ:AAPL')
fg.get_liquidity(symbol='NASDAQ:AAPL')
fg.get_leverage(symbol='NASDAQ:AAPL')
fg.get_valuation(symbol='NASDAQ:AAPL')
fg.get_dividends(symbol='NASDAQ:AAPL')

fg.compare_fundamentals(
    symbols=['NASDAQ:AAPL', 'NASDAQ:MSFT', 'NASDAQ:GOOGL'],
    fields=['total_revenue', 'net_income', 'EBITDA', 'market_cap_basic']
)
```

### 4.13 CalendarScraper — 財報 / 除息行事曆

```python
from datetime import datetime, timedelta
from tradingview_scraper.symbols.cal import CalendarScraper

cal = CalendarScraper()

now  = datetime.now().timestamp()
week = (datetime.now() + timedelta(days=7)).timestamp()

cal.scrape_earnings(
    now, week, ["america"],
    values=["logoid", "name", "earnings_per_share_fq"]
)

cal.scrape_dividends(
    now, week, ["america"],
    values=["logoid", "name", "dividends_yield"]
)
```

---

## 5. 在 StockAnalyzeAI 的整合建議

本專案為 TypeScript / Vite / Node 架構，`tradingview-scraper` 為 Python 套件，建議以**獨立 Python 微服務**方式橋接。

### 5.1 架構選項

| 方式 | 優點 | 缺點 |
|------|------|------|
| **A. FastAPI 微服務** | 解耦、可水平擴充、支援 WebSocket 串流 | 多跑一個 process |
| **B. `child_process` 呼叫 Python CLI** | 不需多起服務 | 冷啟動慢、難做串流 |
| **C. 以 Node 重寫需要的端點** | 單一語言 | 維護成本高，失去上游更新 |

建議採 **A**：建立 `server/python/tradingview_service.py`，用 FastAPI 暴露需要的端點，再由 `server/services/TradingViewService.ts` 透過 `fetch` 呼叫。

### 5.2 範例：Python 服務端

```python
# server/python/tradingview_service.py
from fastapi import FastAPI, Query
from tradingview_scraper.symbols.overview import Overview
from tradingview_scraper.symbols.technicals import Indicators
from tradingview_scraper.symbols.news import NewsScraper

app = FastAPI()
ov  = Overview()
ind = Indicators()
news = NewsScraper()

@app.get("/overview")
def overview(symbol: str = Query(...)):
    return ov.get_symbol_overview(symbol=symbol)

@app.get("/indicators")
def indicators(exchange: str, symbol: str, timeframe: str = "1d"):
    return ind.scrape(
        exchange=exchange, symbol=symbol,
        timeframe=timeframe, allIndicators=True,
    )

@app.get("/news")
def news_headlines(symbol: str, exchange: str):
    return news.scrape_headlines(symbol=symbol, exchange=exchange)
```

啟動：

```bash
uvicorn server.python.tradingview_service:app --port 8787
```

### 5.3 範例：TypeScript 呼叫端

```ts
// server/services/TradingViewService.ts
const BASE = process.env.TV_SCRAPER_URL ?? 'http://127.0.0.1:8787';

export interface TVOverview {
  status: 'success' | 'error';
  data: Record<string, unknown>;
}

export async function getOverview(symbol: string): Promise<TVOverview> {
  const res = await fetch(`${BASE}/overview?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`TV overview failed: ${res.status}`);
  return res.json();
}

export async function getIndicators(
  exchange: string,
  symbol: string,
  timeframe = '1d',
) {
  const url = `${BASE}/indicators?exchange=${exchange}&symbol=${symbol}&timeframe=${timeframe}`;
  const res = await fetch(url);
  return res.json();
}
```

### 5.4 即時串流

`RealTimeData.get_ohlcv` 回傳 generator。若需透過 WebSocket 轉給前端，可在 FastAPI 端包成 `WebSocket` endpoint：

```python
from fastapi import WebSocket
from tradingview_scraper.symbols.stream import RealTimeData

@app.websocket("/ws/ohlcv")
async def ws_ohlcv(ws: WebSocket, exchange_symbol: str):
    await ws.accept()
    rt = RealTimeData()
    for packet in rt.get_ohlcv(exchange_symbol=exchange_symbol):
        await ws.send_json(packet)
```

前端可直接 `new WebSocket('ws://.../ws/ohlcv?exchange_symbol=BINANCE:BTCUSDT')`。

---

## 5.5 Symbol 格式轉換（重要）

本專案原本以 Yahoo Finance 為主，symbol 格式為 `2330.TW`、`AAPL`、`USDTWD=X`、`BTC-USD`、`^TWII` 等；
而 TradingView 用 `EXCHANGE:CODE`（`TPE:2330`、`NASDAQ:AAPL`、`FX_IDC:USDTWD`、`BINANCE:BTCUSDT`、`TVC:TAIEX`）。

兩邊直接互傳**必定失敗**，因此所有跨源呼叫統一過 `src/utils/symbolParser.ts`：

```ts
import { parseSymbol, toYahoo, toTradingView, toTVExchangeSymbol } from '@/utils/symbolParser';

parseSymbol('2330.TW');
// → { code: '2330', market: 'TW', raw: '2330.TW' }

toYahoo('TPE:2330');            // '2330.TW'
toTradingView('2330.TW');       // 'TPE:2330'
toTradingView('AAPL');          // 'NASDAQ:AAPL'（預設，可用 { exchange } 覆寫）
toTradingView('BTC-USD');       // 'BINANCE:BTCUSDT'
toTradingView('USDTWD=X');      // 'FX_IDC:USDTWD'
toTradingView('^TWII');         // 'TVC:TAIEX'

// 給 Indicators.scrape(exchange=, symbol=) 用
toTVExchangeSymbol('2330.TW');  // { exchange: 'TPE', symbol: '2330' }
```

### 市場 → TradingView 交易所對照

| 市場 | Yahoo | TradingView | 備註 |
|------|-------|-------------|------|
| 台股上市 | `2330.TW` | `TPE:2330` | |
| 台股上櫃 | `6488.TWO` | `TPEX:6488` | |
| 美股 | `AAPL` | `NASDAQ:AAPL` | 預設 NASDAQ，其他需指定 `{ exchange: 'NYSE' }` |
| 港股 | `0700.HK` | `HKEX:700` | |
| 日股 | `7203.T` | `TSE:7203` | |
| 匯率 | `USDTWD=X` | `FX_IDC:USDTWD` | |
| 加密 | `BTC-USD` | `BINANCE:BTCUSDT` | USD → USDT |
| 指數 | `^TWII`, `^GSPC` | `TVC:TAIEX`, `SP:SPX` | 走別名表 |

### 呼叫時序建議

```
UI (Yahoo 格式)
  ↓ getInsights('2330.TW')
Express: /api/insights/:symbol
  ├─ parseSymbol → CanonicalSymbol
  ├─ toYahoo() → Yahoo API（quote / chart）
  └─ TradingViewService（內部 toTradingView）
       ↓ fetch
     Python FastAPI
       ↓
     tradingview-scraper
```

**踩雷提醒：**
1. **不要**在 Service 層之外手動拼 symbol 字串，一律過 parser。
2. 美股無法從單一 symbol 可靠推斷交易所（AAPL 可能是 NASDAQ、也可能有 OTC 版本），需要時用 `SymbolMarkets.scrape(symbol='AAPL')` 向上游解析。
3. 加密幣 Yahoo 用 `USD` 計價，但 TV/Binance 用 `USDT`，parser 會自動轉換，但若要查 Coinbase/Bitstamp 需傳 `{ quote: 'USD', exchange: 'COINBASE' }`。
4. Yahoo 指數 `^` 前綴在 parser 會查別名表；沒命中時會 fallback 成 `TVC:<code>`，可能查不到，視需要補進 `INDEX_ALIASES`。

---

## 6. 注意事項

- 此套件抓取 TradingView 公開端點，**非官方 API**，隨時可能變動；建議對回傳做結構驗證（Zod / Pydantic）。
- 大量請求請自行限流並快取（可用專案現有 `src/services/cache.ts`）。
- 使用者登入後的私有資料需提供 `TRADINGVIEW_COOKIE` / JWT。
- 請遵守 TradingView 服務條款與資料授權。

---

## 7. 回傳格式（典型）

```json
{
  "status": "success",
  "data": [ /* ... */ ],
  "total": 1
}
```

失敗時 `status: "error"`，並帶 `message` 欄位。
