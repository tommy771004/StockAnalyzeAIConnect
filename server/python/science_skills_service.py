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


@app.post("/polars/backtest")
async def polars_backtest(payload: dict):
    """
    Use Polars to perform high-performance backtest processing.
    Expects payload: {"data": [... historical records ...], "strategy": "..."}
    """
    try:
        data = payload.get("data", [])
        if not data:
            return err("No data provided for backtest")

        df = pl.DataFrame(data)
        if "close" in df.columns:
            if "date" in df.columns:
                df = df.sort("date")

            df = df.with_columns(
                [
                    pl.col("close").rolling_mean(window_size=10).alias("sma_10"),
                    pl.col("close").rolling_mean(window_size=50).alias("sma_50"),
                ]
            ).with_columns(
                pl.when(pl.col("sma_10") > pl.col("sma_50"))
                .then(1)
                .otherwise(-1)
                .alias("signal")
            )

            signal_counts = df["signal"].value_counts().to_dicts()
            return ok(
                {
                    "total_rows": len(df),
                    "signal_counts": signal_counts,
                    "sample": df.tail(5).to_dicts(),
                },
                meta={"columns": df.columns, "engine": "polars"},
            )

        return ok(
            {
                "total_rows": len(df),
                "columns": df.columns,
                "message": "DataFrame constructed but 'close' column missing",
            },
            meta={"engine": "polars"},
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
