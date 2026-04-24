import { useState, useEffect } from 'react';
import * as api from '../../services/api';

export function useResearchData(symbol: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    
    let isMounted = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await api.getInsights(symbol);
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
  }, [symbol]);

  return { data, loading, error };
}
