const PYTHON_SERVICE_URL = process.env.SCIENCE_SERVICE_URL || 'http://127.0.0.1:8788';

export async function searchArxiv(query: string, maxResults: number = 3) {
  try {
    const res = await fetch(`${PYTHON_SERVICE_URL}/arxiv/search?query=${encodeURIComponent(query)}&max_results=${maxResults}`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.error('Error calling Arxiv service:', e);
    return null;
  }
}

export async function scrapeUrls(urls: string[]) {
  try {
    const res = await fetch(`${PYTHON_SERVICE_URL}/web/scrape?urls=${encodeURIComponent(urls.join(','))}`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.error('Error calling web scrape service:', e);
    return null;
  }
}

export async function polarsBacktest(payload: any) {
  try {
    const res = await fetch(`${PYTHON_SERVICE_URL}/polars/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data;
  } catch (e) {
    console.error('Error calling polars service:', e);
    return null;
  }
}

export async function timesFmPredict(symbol: string, ticks: number = 10) {
  try {
    const res = await fetch(`${PYTHON_SERVICE_URL}/timesfm/predict?symbol=${encodeURIComponent(symbol)}&ticks=${ticks}`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.error('Error calling timesfm service:', e);
    return null;
  }
}
