import { calculateRSI, calculateMACD, calculateKD, calculateVWAP } from '../lib/indicators';

self.onmessage = (e) => {
  const { historicalData, closes, highs, lows } = e.data;
  
  const rsiArr = calculateRSI(closes);
  const macdArr = calculateMACD(closes);
  const kdArr = calculateKD(closes, highs, lows);
  const vwapArr = calculateVWAP(historicalData);
  
  self.postMessage({
    rsi: rsiArr.at(-1),
    macd: macdArr.at(-1),
    kd: kdArr.at(-1),
    vwap: vwapArr.at(-1),
  });
};
