import sys
import os

try:
    import pkg_resources
except ImportError:
    import types
    m = types.ModuleType("pkg_resources")
    sys.modules["pkg_resources"] = m
    m.get_distribution = lambda x: types.SimpleNamespace(version="0.0.0")
    base_path = r"C:\Users\Tommy\AppData\Roaming\Python\Python312\site-packages\tradingview_scraper"
    m.resource_filename = lambda p, f: os.path.join(base_path, f)

from fastapi import FastAPI, Query
from typing import List, Optional, Any
from tradingview_scraper.symbols.overview import Overview
from tradingview_scraper.symbols.technicals import Indicators
from tradingview_scraper.symbols.news import NewsScraper
from tradingview_scraper.symbols.ideas import Ideas
from tradingview_scraper.symbols.cal import CalendarScraper
from datetime import datetime, timedelta

app = FastAPI()
ov = Overview()
ind = Indicators()
news_scraper = NewsScraper()
ideas_scraper = Ideas()
cal_scraper = CalendarScraper()

def flatten_response(data: Any) -> Any:
    if isinstance(data, dict) and "status" in data and "data" in data:
        return data["data"]
    return data

def get_recommendation_text(score: float) -> str:
    if score > 0.5: return "STRONG_BUY"
    if score > 0.1: return "BUY"
    if score < -0.5: return "STRONG_SELL"
    if score < -0.1: return "SELL"
    return "NEUTRAL"

@app.get("/health")
def health():
    return {"status": "success", "data": {"ok": True}}

@app.get("/overview")
def get_overview(symbol: str):
    try:
        # Get basic overview
        raw_ov = ov.get_symbol_overview(symbol=symbol)
        data_ov = flatten_response(raw_ov)
        
        # Get indicators for technical recommendation
        # We need exchange for indicators, usually it's in the symbol like "NASDAQ:NVDA"
        # but the scraper might need it separately.
        exchange = "NASDAQ"
        sym_only = symbol
        if ":" in symbol:
            parts = symbol.split(":")
            exchange = parts[0]
            sym_only = parts[1]

        try:
            raw_ind = ind.scrape(exchange=exchange, symbol=sym_only, timeframe="1d")
            data_ind = flatten_response(raw_ind)
        except:
            data_ind = {}

        mapped = data_ov.copy() if isinstance(data_ov, dict) else {}
        if isinstance(data_ov, dict):
            mapped['market_cap_calc'] = data_ov.get('market_cap_calc') or data_ov.get('market_cap_basic')
            mapped['pe_ratio'] = data_ov.get('price_earnings_ttm')
            mapped['eps_ttm'] = data_ov.get('earnings_per_share_basic_ttm') or data_ov.get('earnings_per_share_diluted_ttm')
            
            close = data_ov.get('close')
            change_abs = data_ov.get('change_abs')
            if close is not None and change_abs is not None:
                mapped['prev_close'] = close - change_abs
            
            # Technical Recommendations Mapping
            score = data_ov.get('Recommend.All')
            if score is None and isinstance(data_ind, dict):
                score = data_ind.get('Recommend.All')
            
            if score is not None:
                mapped['recommendation_any_score'] = score
                mapped['recommendation_any'] = get_recommendation_text(score)
            else:
                mapped['recommendation_any_score'] = 0
                mapped['recommendation_any'] = "NEUTRAL"

        return {"status": "success", "data": mapped}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/indicators")
def get_indicators(exchange: str, symbol: str, timeframe: str = "1d"):
    try:
        raw = ind.scrape(exchange=exchange, symbol=symbol, timeframe=timeframe, allIndicators=True)
        data = flatten_response(raw)
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/news")
def get_news(exchange: str, symbol: str):
    try:
        raw = news_scraper.scrape_headlines(symbol=symbol, exchange=exchange)
        data = flatten_response(raw)
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/news/feed")
def get_news_feed(category: str = "all"):
    try:
        # Map categories to TV parameters
        area = "world"
        section = "all"
        
        if category == "美股":
            area = "americas"
        elif category == "國際":
            area = "world"
        elif category == "crypto":
            area = "crypto"
            
        raw = news_scraper.scrape_headlines(area=area, section=section, sort="latest")
        data = flatten_response(raw)
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/ideas")
def get_ideas(symbol: str, sort: str = "popular"):
    try:
        raw = ideas_scraper.scrape(symbol=symbol, sort=sort)
        data = flatten_response(raw)
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/calendar/earnings")
def get_earnings(countries: str = "america", days: int = 7):
    try:
        now = datetime.now().timestamp()
        future = (datetime.now() + timedelta(days=days)).timestamp()
        country_list = countries.split(",")
        raw = cal_scraper.scrape_earnings(now, future, country_list)
        data = flatten_response(raw)
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8787)
