import { useState, useEffect } from 'react';
import * as api from '../../services/api';

export function useResearchData(symbol: string, timeframe: string = '1d') {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    
    let isMounted = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('資料載入逾時，請重新整理')), 30000)
        );
        const res = await Promise.race([api.getInsights(symbol, timeframe), timeout]);
        if (isMounted) {
          setData(res);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [symbol, timeframe]);

  return { data, loading, error };
}
