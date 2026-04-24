from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from fastapi import FastAPI

# Vercel infrastructure handle
app = FastAPI()


ScraperBundle = Tuple[Any, Any, Any, Any, Any]
_scrapers: Optional[ScraperBundle] = None
_scraper_init_error: Optional[str] = None


def _load_scrapers() -> ScraperBundle:
    """
    Lazy-load tradingview-scraper at request time so import failures
    do not crash the whole Vercel function during cold start.
    """
    global _scrapers, _scraper_init_error

    if _scrapers is not None:
        return _scrapers

    try:
        from tradingview_scraper.symbols.overview import Overview
        from tradingview_scraper.symbols.technicals import Indicators
        from tradingview_scraper.symbols.news import NewsScraper
        from tradingview_scraper.symbols.ideas import Ideas
        from tradingview_scraper.symbols.cal import CalendarScraper

        _scrapers = (
            Overview(),
            Indicators(),
            NewsScraper(),
            Ideas(),
            CalendarScraper(),
        )
        _scraper_init_error = None
        return _scrapers
    except Exception as exc:  # noqa: BLE001
        _scraper_init_error = f"{type(exc).__name__}: {exc}"
        raise RuntimeError(_scraper_init_error) from exc


def flatten_response(data: Any) -> Any:
    if isinstance(data, dict) and "status" in data and "data" in data:
        return data["data"]
    return data


def get_recommendation_text(score: float) -> str:
    if score > 0.5:
        return "STRONG_BUY"
    if score > 0.1:
        return "BUY"
    if score < -0.5:
        return "STRONG_SELL"
    if score < -0.1:
        return "SELL"
    return "NEUTRAL"


@app.get("/api/python/health")
def health() -> Dict[str, Any]:
    try:
        _load_scrapers()
        return {"status": "success", "data": {"ok": True}}
    except Exception:  # noqa: BLE001
        return {
            "status": "error",
            "message": _scraper_init_error or "scraper init failed",
            "data": {"ok": False},
        }


@app.get("/api/python/overview")
def get_overview(symbol: str) -> Dict[str, Any]:
    try:
        ov, ind, _, _, _ = _load_scrapers()

        raw_ov = ov.get_symbol_overview(symbol=symbol)
        data_ov = flatten_response(raw_ov)

        exchange = "NASDAQ"
        sym_only = symbol
        if ":" in symbol:
            parts = symbol.split(":")
            exchange = parts[0]
            sym_only = parts[1]

        try:
            raw_ind = ind.scrape(exchange=exchange, symbol=sym_only, timeframe="1d", allIndicators=True)
            data_ind = flatten_response(raw_ind)
        except Exception as e:
            print(f"[python] indicators fallback failed for {exchange}:{sym_only}: {e}", file=sys.stderr)
            data_ind = {}

        mapped = data_ov.copy() if isinstance(data_ov, dict) else {}
        if isinstance(data_ov, dict):
            mapped["market_cap_calc"] = data_ov.get("market_cap_calc") or data_ov.get("market_cap_basic")
            mapped["pe_ratio"] = data_ov.get("price_earnings_ttm")
            mapped["eps_ttm"] = data_ov.get("earnings_per_share_basic_ttm") or data_ov.get("earnings_per_share_diluted_ttm")

            inst_pct = (
                data_ov.get("institutional_holders_pct")
                or data_ov.get("institutional_holdings_pct")
                or data_ov.get("institutional_percent")
            )
            if inst_pct is not None:
                mapped["institutional_holders_pct"] = inst_pct

            close = data_ov.get("close")
            change_abs = data_ov.get("change_abs")
            if close is not None and change_abs is not None:
                mapped["prev_close"] = close - change_abs

            score = data_ov.get("Recommend.All")
            if score is None and isinstance(data_ind, dict):
                score = data_ind.get("Recommend.All")

            if score is not None:
                mapped['recommendation_any_score'] = score
                mapped['recommendation_any'] = get_recommendation_text(score)
            # else: leave both keys absent so the frontend can detect missing data

        return {"status": "success", "data": mapped}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "message": str(exc)}


@app.get("/api/python/indicators")
def get_indicators(exchange: str, symbol: str, timeframe: str = "1d") -> Dict[str, Any]:
    try:
        _, ind, _, _, _ = _load_scrapers()
        raw = ind.scrape(exchange=exchange, symbol=symbol, timeframe=timeframe, allIndicators=True)
        data = flatten_response(raw)
        return {"status": "success", "data": data}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "message": str(exc)}


@app.get("/api/python/news")
def get_news(exchange: str, symbol: str) -> Dict[str, Any]:
    try:
        _, _, news_scraper, _, _ = _load_scrapers()
        raw = news_scraper.scrape_headlines(symbol=symbol, exchange=exchange)
        data = flatten_response(raw)
        return {"status": "success", "data": data or []}
    except Exception as e:
        # Return empty list with a message so the frontend degrades gracefully
        # instead of surfacing an error (common when TV's news endpoint 403s).
        print(f"[python] news fetch failed for {exchange}:{symbol}: {e}", file=sys.stderr)
        return {"status": "success", "data": [], "message": str(e)}
