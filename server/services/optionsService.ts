/**
 * server/services/optionsService.ts
 *
 * 選擇權工具服務 — 封裝對 Python Black-Scholes 微服務的呼叫。
 * 提供：
 *   fetchGreeks()  — 正向計算選擇權理論價格與 Greeks
 *   computeIV()    — Newton-Raphson 反推隱含波動率 (IV)
 *
 * 設計原則：
 *  - 所有呼叫失敗時回傳 null（不拋出），讓 agent loop 優雅降級。
 *  - 假設 Python 服務與 Node 同域 (localhost)，可透過 BASE_URL 環境變數覆寫。
 */

const PYTHON_BASE =
  process.env.PYTHON_SERVICE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5000');

export interface GreeksParams {
  S: number;       // 標的現價
  K: number;       // 履約價
  r: number;       // 無風險利率（年化，e.g. 0.05）
  sigma: number;   // 波動率（年化，e.g. 0.25）
  T: number;       // 到期時間（年，e.g. 30 天 → 30/365）
  optionType?: 'call' | 'put';
}

export interface GreeksResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;   // per day
  vega: number;    // per 1%
  rho: number;     // per 1%
}

export interface IVParams {
  marketPrice: number;  // 選擇權市場報價
  S: number;
  K: number;
  r: number;
  T: number;
  optionType?: 'call' | 'put';
}

export interface IVResult {
  iv: number;        // 隱含波動率（小數，e.g. 0.22 = 22%）
  ivPct: number;     // 百分比形式（22.0）
  iterations: number;
  finalPriceError: number;
}

async function pyGet(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${PYTHON_BASE}${path}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json.status === 'success' ? json.data : null;
  } catch {
    return null;
  }
}

/**
 * 正向計算 Black-Scholes 理論價格與所有 Greeks。
 * 失敗時回傳 null。
 */
export async function fetchGreeks(params: GreeksParams): Promise<GreeksResult | null> {
  const { S, K, r, sigma, T, optionType = 'call' } = params;
  const qs = new URLSearchParams({
    S: String(S), K: String(K), r: String(r),
    sigma: String(sigma), T: String(T), option_type: optionType,
  });
  const data = await pyGet(`/api/python/options_greeks?${qs}`);
  if (!data) return null;
  return {
    price: data.price,
    delta: data.delta,
    gamma: data.gamma,
    theta: data.theta,
    vega:  data.vega,
    rho:   data.rho,
  };
}

/**
 * Newton-Raphson 隱含波動率求解。
 * 需提供選擇權市場報價與合約參數，失敗時回傳 null。
 *
 * 典型用途：
 *   const iv = await computeIV({ marketPrice: 5.2, S: 100, K: 100, r: 0.02, T: 30/365 });
 *   if (iv && iv.ivPct > 30) { ...高波動率策略... }
 */
export async function computeIV(params: IVParams): Promise<IVResult | null> {
  const { marketPrice, S, K, r, T, optionType = 'call' } = params;
  const qs = new URLSearchParams({
    market_price: String(marketPrice),
    S: String(S), K: String(K), r: String(r),
    T: String(T), option_type: optionType,
  });
  const data = await pyGet(`/api/python/options_iv?${qs}`);
  if (!data) return null;
  return {
    iv:              data.iv,
    ivPct:           data.iv_pct,
    iterations:      data.iterations,
    finalPriceError: data.final_price_error,
  };
}
