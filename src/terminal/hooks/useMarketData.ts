import { useState, useEffect } from 'react';
import { getQuotes } from '../../services/api';

const SECTORS = ['XLK', 'XLF', 'XLV', 'XLY', 'XLI', 'XLP', 'XLE', 'XLB'];
const INDICES = ['^DJI', '^GSPC', '^IXIC', '^SOX', '^VIX'];

export function useMarketData() {
  const [sectors, setSectors] = useState<any[]>([]);
  const [indices, setIndices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMarket = async () => {
      try {
        setLoading(true);
        const [secRes, idxRes] = await Promise.all([
          getQuotes(SECTORS),
          getQuotes(INDICES)
        ]);
        setSectors(secRes || []);
        setIndices(idxRes || []);
      } catch (err) {
        console.error('Market fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMarket();
    const timer = setInterval(fetchMarket, 30000);
    return () => clearInterval(timer);
  }, []);

  return { sectors, indices, loading };
}
