from __future__ import annotations

import asyncio
import time
from typing import Any

import aiohttp
import arxiv
import polars as pl
from bs4 import BeautifulSoup
from fastapi import FastAPI, Query
from pydantic import BaseModel, Field

from quantum_signal import compute_quantum_signal
from timesfm_predictor import TimesFMPredictor

app = FastAPI(title="Science Skills Service")
_timesfm = TimesFMPredictor()


def ok(data: Any, *, meta: dict | None = None, message: str | None = None):
    payload = {"status": "success", "data": data, "meta": meta or {}, "errors": []}
    if message:
        payload["message"] = message
    return payload


def err(message: str, *, errors: list[str] | None = None, meta: dict | None = None):
    return {
        "status": "error",
        "data": None,
        "message": message,
        "errors": errors or [message],
        "meta": meta or {},
    }


@app.get("/health")
def health():
    return ok({"ok": True, "service": "science-skills"}, meta={"ts": int(time.time())})


class TimesFmPayload(BaseModel):
    symbol: str = Field(default="UNKNOWN")
    ticks: int = Field(default=10, ge=1, le=64)
    history: list[float] = Field(default_factory=list)


class QuantumPayload(BaseModel):
    symbol: str = Field(default="UNKNOWN")
    prices: list[float] = Field(default_factory=list)
    features: dict[str, float] = Field(default_factory=dict)
    shots: int = Field(default=256, ge=32, le=4096)


class FeatureAggregatePayload(BaseModel):
    data: list[dict[str, Any]] = Field(default_factory=list)
    window: int = Field(default=14, ge=3, le=120)


class PolarsBacktestPayload(BaseModel):
    symbol: str = Field(default="UNKNOWN")
    data: list[dict[str, Any]] = Field(default_factory=list)
    config: dict[str, Any] = Field(default_factory=dict)
    strategies: list[str] = Field(default_factory=list)


@app.get("/arxiv/search")
def search_arxiv(query: str, max_results: int = 5):
    """
    Search Arxiv for scholarly articles.
    """
    try:
        search = arxiv.Search(
            query=query,
            max_results=max_results,
            sort_by=arxiv.SortCriterion.SubmittedDate,
        )

        results = []
        for result in search.results():
            results.append(
                {
                    "title": result.title,
                    "authors": [a.name for a in result.authors],
                    "summary": result.summary,
                    "published_date": result.published.isoformat() if result.published else None,
                    "pdf_url": result.pdf_url,
                    "entry_id": result.entry_id,
                }
            )
        return ok(results, meta={"query": query, "max_results": max_results, "count": len(results)})
    except Exception as exc:  # noqa: BLE001
        return err("arxiv search failed", errors=[str(exc)], meta={"query": query})


async def fetch_page(session: aiohttp.ClientSession, url: str):
    try:
        async with session.get(url, timeout=10) as response:
            if response.status == 200:
                html = await response.text()
                soup = BeautifulSoup(html, "html.parser")
                paragraphs = soup.find_all("p")
                text = " ".join([p.get_text() for p in paragraphs])
                return url, text[:2000], None
            return url, None, f"http_{response.status}"
    except Exception as exc:  # noqa: BLE001
        return url, None, str(exc)


@app.get("/web/scrape")
async def scrape_urls(urls: str = Query(..., description="Comma-separated URLs")):
    url_list = [u.strip() for u in urls.split(",") if u.strip()]
    if not url_list:
        return err("No valid URLs provided")

    results: dict[str, str] = {}
    errors: list[str] = []
    try:
        async with aiohttp.ClientSession() as session:
            tasks = [fetch_page(session, url) for url in url_list]
            responses = await asyncio.gather(*tasks)

        for url, text, e in responses:
            if text:
                results[url] = text
            elif e:
                errors.append(f"{url}: {e}")

        return ok(
            results,
            meta={"requested": len(url_list), "succeeded": len(results), "failed": len(errors)},
            message=("partial_success" if errors else "ok"),
        ) if results else err("All URL scrapes failed", errors=errors, meta={"requested": len(url_list)})
    except Exception as exc:  # noqa: BLE001
        return err("web scrape failed", errors=[str(exc)], meta={"requested": len(url_list)})


def _num(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except Exception:  # noqa: BLE001
        return default


def _calc_mdd(curve: list[dict[str, Any]]) -> float:
    peak = 1.0
    max_dd = 0.0
    for row in curve:
        portfolio_pct = _num(row.get("portfolio", 0.0)) / 100.0
        equity = 1.0 + portfolio_pct
        if equity > peak:
            peak = equity
        dd = 0.0 if peak <= 0 else (peak - equity) / peak
        if dd > max_dd:
            max_dd = dd
    return round(max_dd * 100.0, 2)


def _calc_sharpe(returns: list[float]) -> float:
    if len(returns) < 2:
        return 0.0
    mean = sum(returns) / len(returns)
    variance = sum((r - mean) ** 2 for r in returns) / max(1, len(returns) - 1)
    std = variance ** 0.5
    if std <= 1e-12:
        return 0.0
    # daily-like scaling
    return round((mean / std) * (252 ** 0.5), 3)


@app.post("/polars/backtest")
async def polars_backtest(payload: PolarsBacktestPayload):
    """High-throughput backtest path for large datasets using Polars preprocessing."""
    try:
        if not payload.data:
            return err("No data provided for backtest")

        df = pl.DataFrame(payload.data)
        if "close" not in df.columns:
            return err("Missing required column: close")

        if "date" in df.columns:
            df = df.sort("date")
        else:
            df = df.with_row_count(name="idx").with_columns(pl.col("idx").cast(pl.Utf8).alias("date")).drop("idx")

        # Normalize and precompute indicators in Polars.
        df = (
            df.with_columns(pl.col("close").cast(pl.Float64))
            .with_columns(
                [
                    pl.col("close").rolling_mean(window_size=10).alias("sma_10"),
                    pl.col("close").rolling_mean(window_size=50).alias("sma_50"),
                    pl.col("close").ewm_mean(span=12).alias("ema_12"),
                    pl.col("close").ewm_mean(span=26).alias("ema_26"),
                    pl.col("close").diff().alias("delta"),
                ]
            )
            .with_columns(
                [
                    pl.when(pl.col("delta") > 0).then(pl.col("delta")).otherwise(0.0).alias("gain"),
                    pl.when(pl.col("delta") < 0).then(-pl.col("delta")).otherwise(0.0).alias("loss"),
                ]
            )
            .with_columns(
                [
                    pl.col("gain").rolling_mean(window_size=14).alias("avg_gain"),
                    pl.col("loss").rolling_mean(window_size=14).alias("avg_loss"),
                ]
            )
            .with_columns(
                [
                    (pl.col("ema_12") - pl.col("ema_26")).alias("macd_diff"),
                    pl.when(pl.col("avg_loss") <= 1e-12)
                    .then(100.0)
                    .otherwise(100.0 - (100.0 / (1.0 + (pl.col("avg_gain") / pl.col("avg_loss")))))
                    .alias("rsi"),
                ]
            )
            .fill_null(strategy="forward")
            .fill_null(0)
        )

        rows = df.select(["date", "close", "rsi", "macd_diff"]).to_dicts()
        if len(rows) < 55:
            return err("Not enough history for backtest (need at least 55 rows)")

        cfg = payload.config or {}
        params = cfg.get("params", {}) if isinstance(cfg, dict) else {}
        stop_loss_pct = _num(params.get("stopLossPct", 5), 5.0)
        take_profit_pct = _num(params.get("takeProfitPct", 10), 10.0)
        trailing_stop_pct = _num(params.get("trailingStopPct", 3), 3.0)

        initial_capital = 1_000_000.0
        balance = initial_capital
        shares = 0
        entry_price = 0.0
        high_water = 0.0
        entry_date = ""
        trades: list[dict[str, Any]] = []
        equity_curve: list[dict[str, Any]] = []
        rets: list[float] = []

        bench_start = _num(rows[0].get("close"), 1.0) or 1.0
        prev_equity = initial_capital

        for row in rows[50:]:
            current_price = _num(row.get("close"))
            current_date = str(row.get("date", ""))
            rsi = _num(row.get("rsi"), 50.0)
            macd_diff = _num(row.get("macd_diff"), 0.0)

            if shares > 0:
                pnl_pct = ((current_price - entry_price) / max(entry_price, 1e-9)) * 100.0
                high_water = max(high_water, current_price)
                drop_from_high = ((high_water - current_price) / max(high_water, 1e-9)) * 100.0

                should_exit = False
                reason = ""
                if pnl_pct <= -stop_loss_pct:
                    should_exit = True
                    reason = "Stop Loss"
                elif pnl_pct >= take_profit_pct:
                    should_exit = True
                    reason = "Take Profit"
                elif trailing_stop_pct > 0 and pnl_pct > 2 and drop_from_high >= trailing_stop_pct:
                    should_exit = True
                    reason = "Trailing Stop"

                if should_exit:
                    trade_value = shares * current_price
                    commission = max(20.0, trade_value * 0.001425)
                    tax = trade_value * 0.003
                    balance += trade_value - commission - tax
                    pnl = (current_price - entry_price) * shares - commission - tax
                    trades.append(
                        {
                            "symbol": payload.symbol,
                            "entryPrice": round(entry_price, 4),
                            "exitPrice": round(current_price, 4),
                            "entryDate": entry_date,
                            "exitDate": current_date,
                            "pnl": round(pnl, 2),
                            "pnlPct": round(pnl_pct, 2),
                            "reason": reason,
                            "type": "WIN" if pnl > 0 else "LOSS",
                        }
                    )
                    shares = 0
                    entry_price = 0.0
                    high_water = 0.0

            if shares == 0:
                signal = "HOLD"
                if rsi <= 30 or macd_diff > current_price * 0.002:
                    signal = "BUY"
                elif rsi >= 70 or macd_diff < -current_price * 0.002:
                    signal = "SELL"

                if signal == "BUY":
                    target_invest = balance * 0.9
                    est_shares = int(target_invest // max(current_price, 1e-9))
                    if est_shares > 0:
                        trade_value = est_shares * current_price
                        commission = max(20.0, trade_value * 0.001425)
                        total_cost = trade_value + commission
                        if total_cost <= balance:
                            balance -= total_cost
                            shares = est_shares
                            entry_price = total_cost / shares
                            entry_date = current_date
                            high_water = current_price

            total_assets = balance + shares * current_price
            portfolio_pct = ((total_assets / initial_capital) - 1.0) * 100.0
            benchmark_pct = ((current_price / bench_start) - 1.0) * 100.0
            equity_curve.append(
                {
                    "date": current_date,
                    "portfolio": round(portfolio_pct, 2),
                    "benchmark": round(benchmark_pct, 2),
                }
            )

            ret = (total_assets - prev_equity) / max(prev_equity, 1e-9)
            rets.append(ret)
            prev_equity = total_assets

        roi = equity_curve[-1]["portfolio"] if equity_curve else 0.0
        wins = [t for t in trades if _num(t.get("pnl")) > 0]
        losses = [t for t in trades if _num(t.get("pnl")) <= 0]
        gross_win = sum(_num(t.get("pnl")) for t in wins)
        gross_loss = abs(sum(_num(t.get("pnl")) for t in losses))
        win_rate = (len(wins) / len(trades) * 100.0) if trades else 0.0
        profit_factor = round(gross_win / gross_loss, 3) if gross_loss > 1e-9 else 0.0

        result = {
            "metrics": {
                "roi": round(roi, 2),
                "sharpe": _calc_sharpe(rets),
                "maxDrawdown": _calc_mdd(equity_curve),
                "winRate": round(win_rate, 2),
                "totalTrades": len(trades),
                "profitFactor": profit_factor,
            },
            "equityCurve": equity_curve,
            "trades": trades,
        }

        return ok(
            result,
            meta={
                "engine": "polars",
                "rows": len(df),
                "symbol": payload.symbol,
            },
        )
    except Exception as exc:  # noqa: BLE001
        return err("polars backtest failed", errors=[str(exc)])


@app.post("/features/aggregate")
async def aggregate_features(payload: FeatureAggregatePayload):
    try:
        if not payload.data:
            return err("No data provided")
        df = pl.DataFrame(payload.data)
        if "close" not in df.columns:
            return err("Missing required column: close")
        if "date" in df.columns:
            df = df.sort("date")

        window = payload.window
        out = (
            df.with_columns(
                [
                    pl.col("close").cast(pl.Float64),
                    pl.col("close").pct_change().alias("ret_1"),
                    pl.col("close").rolling_mean(window_size=window).alias(f"sma_{window}"),
                    pl.col("close").ewm_mean(span=window).alias(f"ema_{window}"),
                ]
            )
            .with_columns(
                [
                    (pl.col("close") / pl.col(f"sma_{window}") - 1.0).alias("dist_to_sma"),
                    pl.col("ret_1").rolling_std(window_size=window).alias("volatility"),
                ]
            )
            .fill_null(strategy="forward")
            .fill_null(0)
        )

        latest = out.tail(1).to_dicts()[0]
        return ok(
            {
                "latest": latest,
                "sample": out.tail(5).to_dicts(),
                "total_rows": len(out),
            },
            meta={"window": window, "engine": "polars"},
        )
    except Exception as exc:  # noqa: BLE001
        return err("feature aggregation failed", errors=[str(exc)])


@app.post("/timesfm/predict")
def timesfm_predict(payload: TimesFmPayload):
    """
    TimesFM inference endpoint with deterministic fallback.
    """
    try:
        result = _timesfm.predict(payload.history, payload.ticks)
        last = payload.history[-1] if payload.history else (result.predictions[0] if result.predictions else 0.0)
        end_pred = result.predictions[-1] if result.predictions else last
        action = "BUY" if end_pred > last else "SELL" if end_pred < last else "HOLD"
        confidence = max(30, min(90, 50 + int(abs(end_pred - last) * 10)))

        response = ok(
            {
                "symbol": payload.symbol,
                "prediction": result.predictions,
                "action": action,
                "confidence": confidence,
                "model": result.model,
                "used_fallback": result.used_fallback,
            },
            meta={"ticks": payload.ticks, "history_len": len(payload.history), "model": result.model},
            message=("fallback" if result.used_fallback else "ok"),
        )
        if result.error:
            response["errors"] = [result.error]
        return response
    except Exception as exc:  # noqa: BLE001
        return err("timesfm prediction failed", errors=[str(exc)])


@app.get("/timesfm/predict")
def timesfm_predict_get(
    symbol: str = "UNKNOWN",
    ticks: int = 10,
    history: str = "",
):
    values = []
    if history:
        for item in history.split(","):
            try:
                values.append(float(item.strip()))
            except Exception:  # noqa: BLE001
                continue
    return timesfm_predict(TimesFmPayload(symbol=symbol, ticks=ticks, history=values))


@app.post("/quantum/signal")
def quantum_signal(payload: QuantumPayload):
    """
    Quantum meta-signal endpoint.
    """
    try:
        q = compute_quantum_signal(payload.prices, payload.features, payload.shots)
        return ok(
            q,
            meta={
                "symbol": payload.symbol,
                "prices_len": len(payload.prices),
                "features": sorted(payload.features.keys()),
            },
        )
    except Exception as exc:  # noqa: BLE001
        return err("quantum signal failed", errors=[str(exc)])


if __name__ == "__main__":
    import uvicorn

    # Make sure this runs on a port different from tradingview_service.py (8787)
    uvicorn.run(app, host="127.0.0.1", port=8788)
