// src/services/backtestEngine.ts
import { HistoricalData, BacktestResult, BacktestTrade } from '../types';

/**
 * 回測引擎配置介面
 */
export interface BacktestConfig {
  initialCapital: number;
  commissionRate: number;      // 手續費率 (例如: 0.001425)
  minimumCommission: number;   // 最低手續費 (例如: 台股常見的 20 元)
  slippageRate: number;        // 滑價率 (例如: 0.001 代表 0.1% 的滑價)
  taxRate: number;             // 交易稅率 (例如: 賣出時 0.003)
  positionSizing: 'all-in' | 'fixed'; // 部位策略：全倉或固定股數
}

/**
 * 處理數值精度的輔助函式 (避免浮點數誤差)
 * 實際專案強烈建議使用 decimal.js 或 bignumber.js
 */
const roundTo = (num: number, decimals: number = 2): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
};

/**
 * 增強版回測引擎
 * 包含更真實的交易摩擦成本（滑價、最低手續費、交易稅）
 */
export const runBacktest = (
  data: HistoricalData[],
  signals: ('BUY' | 'SELL' | 'HOLD')[],
  config: BacktestConfig
): BacktestResult => {
  let capital = config.initialCapital;
  let shares = 0;
  const trades: BacktestTrade[] = [];
  
  // 記錄每天的資產淨值，用於計算最大回撤 (Max Drawdown)
  const equityCurve: { date: string; equity: number }[] = [];
  let peakEquity = capital;
  let maxDrawdown = 0;

  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    const signal = signals[i];
    
    // 計算當前總權益 (現金 + 股票市值)
    const currentEquity = roundTo(capital + (shares * bar.close));
    equityCurve.push({ date: bar.date, equity: currentEquity });

    // 更新最大回撤
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const currentDrawdown = (peakEquity - currentEquity) / peakEquity;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }

    // 處理買入訊號
    if (signal === 'BUY' && capital > 0 && shares === 0) { // 假設 All-in 策略
      // 加入滑價：買入時價格變高
      const executionPrice = bar.close * (1 + config.slippageRate);
      
      // 試算可以買多少股
      const maxShares = Math.floor(capital / executionPrice);
      
      if (maxShares > 0) {
        const tradeValue = maxShares * executionPrice;
        // 計算手續費 (考慮最低手續費限制)
        const commission = Math.max(tradeValue * config.commissionRate, config.minimumCommission);
        const totalCost = tradeValue + commission;

        // 確保資金足夠支付手續費
        if (capital >= totalCost) {
          shares = maxShares;
          capital = roundTo(capital - totalCost);
          trades.push({
            type: 'BUY',
            date: bar.date,
            price: roundTo(executionPrice),
            shares,
            fee: roundTo(commission),
          });
        }
      }
    } 
    // 處理賣出訊號
    else if (signal === 'SELL' && shares > 0) {
      // 加入滑價：賣出時價格變低
      const executionPrice = bar.close * (1 - config.slippageRate);
      const tradeValue = shares * executionPrice;
      
      // 計算手續費與交易稅 (通常賣出才收稅)
      const commission = Math.max(tradeValue * config.commissionRate, config.minimumCommission);
      const tax = tradeValue * config.taxRate;
      const totalFees = commission + tax;

      capital = roundTo(capital + tradeValue - totalFees);
      
      trades.push({
        type: 'SELL',
        date: bar.date,
        price: roundTo(executionPrice),
        shares,
        fee: roundTo(totalFees),
      });
      
      shares = 0; // 清空部位
    }
  }

  // 結算最後一天的總資產
  const finalEquity = roundTo(capital + (shares * (data[data.length - 1]?.close || 0)));
  const totalReturn = ((finalEquity - config.initialCapital) / config.initialCapital) * 100;

  // 計算進階績效指標 (KPIs)
  let winningTrades = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  // 為了計算 Profit/Loss，我們需要成對的買賣紀錄，不過現有 trades 陣列包含 BUY 和 SELL 單筆紀錄
  // 我們可以簡單計算平倉 PnL，每次 SELL 就是平掉前面的 BUY。
  let currentEntryValue = 0;
  trades.forEach(t => {
    if (t.type === 'BUY') {
      currentEntryValue = (t.price * t.shares) + t.fee;
    } else if (t.type === 'SELL') {
      const exitValue = (t.price * t.shares) - t.fee;
      const pnl = exitValue - currentEntryValue;
      if (pnl > 0) {
        winningTrades++;
        grossProfit += pnl;
      } else {
        grossLoss += Math.abs(pnl);
      }
      currentEntryValue = 0; // 重置
    }
  });

  const completedTrades = trades.filter(t => t.type === 'SELL').length;
  const winRate = completedTrades > 0 ? (winningTrades / completedTrades) * 100 : 0;
  const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const avgLoss = (completedTrades - winningTrades) > 0 ? grossLoss / (completedTrades - winningTrades) : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);

  // 計算 Sharpe Ratio 與年化報酬率 CAGR
  let sharpe = 0;
  const tradingDays = equityCurve.length;
  if (tradingDays > 0) {
    // 簡單年化
    const years = tradingDays / 252;
    // const cagr = (Math.pow(finalEquity / config.initialCapital, 1 / years) - 1) * 100;

    // 計算日報酬率陣列
    const dailyReturns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
        const prev = equityCurve[i - 1].equity;
        const curr = equityCurve[i].equity;
        dailyReturns.push(prev > 0 ? (curr - prev) / prev : 0);
    }
    
    if (dailyReturns.length > 0) {
        const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / dailyReturns.length;
        const stdDev = Math.sqrt(variance);
        // 假設無風險利率 0%
        sharpe = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0;
    }
  }

  return {
    initialCapital: config.initialCapital,
    finalEquity,
    totalReturn: roundTo(totalReturn),
    maxDrawdown: roundTo(maxDrawdown * 100),
    trades,
    totalTrades: completedTrades, // 改用已平倉交易數
    equityCurve,
    metrics: {
      roi: roundTo(totalReturn),
      sharpe: roundTo(sharpe, 2),
      maxDrawdown: roundTo(maxDrawdown * 100),
      winRate: roundTo(winRate),
      totalTrades: completedTrades,
      avgWin: roundTo(avgWin),
      avgLoss: roundTo(avgLoss),
      profitFactor: roundTo(profitFactor, 2)
    }
  };
};
