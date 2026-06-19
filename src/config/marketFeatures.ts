import { parseSymbol } from '../utils/symbolParser';

/**
 * Licensed/connected market capabilities. They default to off so unavailable
 * US realtime and brokerage surfaces are omitted instead of showing mock data.
 */
export const marketFeatures = Object.freeze({
  usRealtimeTape: import.meta.env.VITE_ENABLE_US_REALTIME_TAPE === 'true',
  usLevel2: import.meta.env.VITE_ENABLE_US_LEVEL2 === 'true',
  usBrokerage: import.meta.env.VITE_ENABLE_US_BROKERAGE === 'true',
});

export function isUsEquitySymbol(symbol: string): boolean {
  return parseSymbol(symbol).market === 'US';
}

export function canShowUsRealtimeSymbol(symbol: string): boolean {
  return !isUsEquitySymbol(symbol) || marketFeatures.usRealtimeTape;
}

export function canShowUsLevel2Symbol(symbol: string): boolean {
  return !isUsEquitySymbol(symbol) || marketFeatures.usLevel2;
}

export function canShowUsBrokerageSymbol(symbol: string): boolean {
  return !isUsEquitySymbol(symbol) || marketFeatures.usBrokerage;
}
