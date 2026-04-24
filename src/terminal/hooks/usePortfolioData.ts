import { useState, useEffect } from 'react';
import * as api from '../../services/api';

export function usePortfolioData() {
  const [positions, setPositions] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [balance, setBalance] = useState(100000);
  const [usdtwd, setUsdtwd] = useState(32.5);
  const [loading, setLoading] = useState(true);

  const fetchPortfolio = async () => {
    try {
      setLoading(true);
      const [posRes, tradeRes, histRes, userRes, fxRes] = await Promise.all([
        api.getPositions(),
        api.getTrades(),
        api.getPortfolioHistory(),
        fetch('/api/auth/me').then(r => r.json()),
        api.getForexRate('USDTWD=X').catch(() => 32.5)
      ]);
      setPositions(posRes?.positions || []);
      setTrades(tradeRes || []);
      setHistory(histRes || []);
      setBalance(Number(userRes?.balance || 100000));
      setUsdtwd(Number(fxRes) || 32.5);
    } catch (err) {
      console.error('Portfolio fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => fetchPortfolio();

  const updatePositions = async (updated: any[]) => {
    await api.setPositions(updated.map(p => ({
      symbol: p.symbol,
      name: p.name || p.symbol,
      shares: Number(p.shares) || 0,
      avgCost: Number(p.avgCost) || 0,
      currency: p.currency || (p.symbol.endsWith('.TW') ? 'TWD' : 'USD')
    })));
    await fetchPortfolio();
  };

  const deletePosition = async (symbol: string) => {
    // We can use setPositions by filtering or call a dedicated DELETE if implemented
    const updated = positions.filter(p => p.symbol !== symbol);
    await updatePositions(updated);
  };

  useEffect(() => {
    fetchPortfolio();
  }, []);

  return { 
    positions, 
    trades, 
    history, 
    balance, 
    loading, 
    refresh, 
    updatePositions, 
    deletePosition,
    usdtwd
  };
}
