// src/store/marketDataStore.ts
import { create } from 'zustand';
import type { StockData } from '../types';

interface MarketDataState {
  // 儲存所有股票的即時報價，使用 Record 加速查詢 (Key 為股票代號)
  quotes: Record<string, StockData>;
  // 連線狀態 (例如 WebSocket 是否連線中)
  isConnected: boolean;
  
  // 更新單一股票報價 (高頻呼叫)
  updateQuote: (symbol: string, data: Partial<StockData>) => void;
  // 批次更新報價 (適用於初始載入或 Restful API 輪詢)
  updateQuotesBatch: (data: Record<string, StockData>) => void;
  // 設定連線狀態
  setConnectionStatus: (status: boolean) => void;
}

/**
 * 使用 Zustand 建立 Market Data Store
 * * 優勢：
 * 1. 避免 React Context 造成的「依賴地獄」與全域 Re-render。
 * 2. 元件可以使用 `useMarketDataStore(state => state.quotes['AAPL'])`
 * 這樣只有在 AAPL 價格變動時，該元件才會重新渲染，大幅提升效能。
 */
export const useMarketDataStore = create<MarketDataState>()((set) => ({
  quotes: {},
  isConnected: false,

  // 更新單筆報價
  updateQuote: (symbol, data) => 
    set((state) => ({
      quotes: {
        ...state.quotes,
        [symbol]: {
          ...(state.quotes[symbol] || {}), // 保留舊資料 (如果有的話)
          ...data,
          symbol, // 確保 symbol 存在
          lastUpdated: Date.now(),
        } as StockData
      }
    })),

  // 批次更新報價
  updateQuotesBatch: (newQuotes) =>
    set((state) => ({
      quotes: {
        ...state.quotes,
        ...newQuotes
      }
    })),

  // 更新 WebSocket/API 連線狀態
  setConnectionStatus: (status) => set({ isConnected: status })
}));
