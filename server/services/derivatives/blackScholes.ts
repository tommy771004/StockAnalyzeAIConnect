/**
 * server/services/derivatives/blackScholes.ts
 * Black-Scholes option pricing & Greeks calculation (純 TS 實作，無外部依賴)
 */

// 標準正態分布 CDF (Φ) - 用 Abramowitz & Stegun 近似
function normalCDF(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (x > 6) return 1;
  if (x < -6) return 0;

  const t = 1 / (1 + p * Math.abs(x));
  const d = c * Math.exp(-x * x / 2);
  const prob =
    d *
    t *
    (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));

  return x >= 0 ? 1 - prob : prob;
}

// 標準正態分布 PDF
function normalPDF(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

export interface OptionGreeks {
  price: number;
  delta: number;
  gamma: number;
  vega: number;  // per 1% IV change
  theta: number; // per 1 day
  rho: number;   // per 1% rate change
}

interface BlackScholesParams {
  spot: number;
  strike: number;
  timeToExpiry: number; // 年為單位，如 0.5 = 6 個月
  riskFreeRate: number; // 0.05 = 5%
  volatility: number;   // 0.2 = 20%
}

/**
 * 計算 Call 選擇權的 Greeks
 */
export function callOptionGreeks(params: BlackScholesParams): OptionGreeks {
  const { spot, strike, timeToExpiry, riskFreeRate, volatility } = params;

  if (timeToExpiry <= 0) {
    // 到期時的內在價值
    const intrinsic = Math.max(spot - strike, 0);
    return {
      price: intrinsic,
      delta: spot > strike ? 1 : 0,
      gamma: 0,
      vega: 0,
      theta: 0,
      rho: 0,
    };
  }

  const sqrtT = Math.sqrt(timeToExpiry);
  const d1 =
    (Math.log(spot / strike) + (riskFreeRate + volatility * volatility * 0.5) * timeToExpiry) /
    (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;

  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const npd1 = normalPDF(d1);

  const price = spot * Nd1 - strike * Math.exp(-riskFreeRate * timeToExpiry) * Nd2;
  const delta = Nd1;
  const gamma = npd1 / (spot * volatility * sqrtT);
  const vega = spot * npd1 * sqrtT / 100; // per 1% IV
  const theta = (-spot * npd1 * volatility) / (2 * sqrtT) / 365; // per day
  const rho = strike * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * Nd2 / 100; // per 1%

  return { price, delta, gamma, vega, theta, rho };
}

/**
 * 計算 Put 選擇權的 Greeks
 */
export function putOptionGreeks(params: BlackScholesParams): OptionGreeks {
  const { spot, strike, timeToExpiry, riskFreeRate } = params;
  const call = callOptionGreeks(params);

  if (timeToExpiry <= 0) {
    // 到期時的內在價值
    const intrinsic = Math.max(strike - spot, 0);
    return {
      price: intrinsic,
      delta: spot < strike ? -1 : 0,
      gamma: 0,
      vega: 0,
      theta: 0,
      rho: 0,
    };
  }

  // Put-Call Parity: P = C - S + K*exp(-r*T)
  const df = Math.exp(-riskFreeRate * timeToExpiry);
  const price = call.price - spot + strike * df;
  const delta = call.delta - 1;
  const gamma = call.gamma;
  const vega = call.vega;
  const theta = call.theta + (riskFreeRate * strike * df) / 365;
  const rho = -strike * timeToExpiry * df / 100;

  return { price, delta, gamma, vega, theta, rho };
}

/**
 * 用 Newton-Raphson 法反推隱含波動率 (Implied Volatility)
 * 給定市場價格，求 IV
 */
export function impliedVolatility(
  params: Omit<BlackScholesParams, 'volatility'> & { optionPrice: number; isCall: boolean },
  initialGuess = 0.2,
  tolerance = 0.0001,
  maxIterations = 100,
): number {
  let iv = initialGuess;

  for (let i = 0; i < maxIterations; i++) {
    const testParams = { ...params, volatility: iv };
    const greeks = params.isCall
      ? callOptionGreeks(testParams)
      : putOptionGreeks(testParams);

    const diff = greeks.price - params.optionPrice;

    if (Math.abs(diff) < tolerance) return iv;

    // vega 用來迭代
    if (Math.abs(greeks.vega) < 0.0001) break;

    iv = iv - diff / (greeks.vega * 100);
    iv = Math.max(0.001, Math.min(5, iv)); // 限制在 0.1% ~ 500%
  }

  return iv;
}
