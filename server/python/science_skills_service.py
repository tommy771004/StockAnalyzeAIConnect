import os
from fastapi import FastAPI, Query, HTTPException
from typing import List, Optional, Any
import polars as pl
import arxiv
import aiohttp
from bs4 import BeautifulSoup
import asyncio

app = FastAPI(title="Science Skills Service")

@app.get("/health")
def health():
    return {"status": "success", "data": {"ok": True}}

# 1. Arxiv Search Endpoint
@app.get("/arxiv/search")
def search_arxiv(query: str, max_results: int = 5):
    """
    Search Arxiv for scholarly articles.
    """
    try:
        search = arxiv.Search(
            query=query,
            max_results=max_results,
            sort_by=arxiv.SortCriterion.SubmittedDate
        )
        
        results = []
        for result in search.results():
            results.append({
                "title": result.title,
                "authors": [a.name for a in result.authors],
                "summary": result.summary,
                "published_date": result.published.isoformat() if result.published else None,
                "pdf_url": result.pdf_url,
                "entry_id": result.entry_id
            })
            
        return {"status": "success", "data": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# 2. Parallel-Web (Web Scrape/Sentiment) Endpoint
async def fetch_page(session, url):
    try:
        async with session.get(url, timeout=10) as response:
            if response.status == 200:
                html = await response.text()
                soup = BeautifulSoup(html, 'html.parser')
                # Extract main text
                paragraphs = soup.find_all('p')
                text = ' '.join([p.get_text() for p in paragraphs])
                # Truncate to avoid massive payloads
                return url, text[:2000]
            return url, None
    except Exception as e:
        return url, None

@app.get("/web/scrape")
async def scrape_urls(urls: str = Query(..., description="Comma-separated URLs")):
    """
    Parallel web scraping of multiple URLs for research/sentiment analysis.
    """
    url_list = [u.strip() for u in urls.split(",") if u.strip()]
    if not url_list:
        return {"status": "error", "message": "No valid URLs provided"}
        
    try:
        results = {}
        async with aiohttp.ClientSession() as session:
            tasks = [fetch_page(session, url) for url in url_list]
            responses = await asyncio.gather(*tasks)
            
            for url, text in responses:
                if text:
                    results[url] = text
                    
        return {"status": "success", "data": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# 3. Polars Data Processing / Backtest Placeholder Endpoint
@app.post("/polars/backtest")
async def polars_backtest(payload: dict):
    """
    Use Polars to perform high-performance backtest processing.
    Expects payload: {"data": [... historical records ...], "strategy": "..."}
    """
    try:
        data = payload.get("data", [])
        if not data:
            return {"status": "error", "message": "No data provided for backtest"}
            
        # Convert to Polars DataFrame for high-speed manipulation
        df = pl.DataFrame(data)
        
        # Example processing: Calculate daily returns if 'close' column exists
        if "close" in df.columns:
            # Sort by date if exists
            if "date" in df.columns:
                df = df.sort("date")
            
            # Simple moving average calculation using polars
            df = df.with_columns([
                df["close"].rolling_mean(window_size=10).alias("sma_10"),
                df["close"].rolling_mean(window_size=50).alias("sma_50")
            ])
            
            # Generate a simple mock signal
            df = df.with_columns(
                pl.when(pl.col("sma_10") > pl.col("sma_50"))
                .then(1)
                .otherwise(-1)
                .alias("signal")
            )
            
            # Count signals
            signal_counts = df["signal"].value_counts().to_dicts()
            
            return {
                "status": "success", 
                "data": {
                    "total_rows": len(df),
                    "signal_counts": signal_counts,
                    # Return latest rows as sample
                    "sample": df.tail(5).to_dicts()
                }
            }
        else:
            return {
                "status": "success", 
                "data": {
                    "total_rows": len(df),
                    "columns": df.columns,
                    "message": "Polars DataFrame constructed successfully, but 'close' column missing for default backtest."
                }
            }
            
    except Exception as e:
        import traceback
        return {"status": "error", "message": str(e), "trace": traceback.format_exc()}

# 4. TimesFM Placeholder
@app.get("/timesfm/predict")
def timesfm_predict(symbol: str, ticks: int = 10):
    """
    Placeholder for TimesFM integration.
    """
    return {
        "status": "success",
        "data": {
            "symbol": symbol,
            "prediction": [0.0] * ticks,
            "message": "TimesFM model not loaded. This is a stub."
        }
    }

if __name__ == "__main__":
    import uvicorn
    # Make sure this runs on a port different from tradingview_service.py (8787)
    uvicorn.run(app, host="127.0.0.1", port=8788)
