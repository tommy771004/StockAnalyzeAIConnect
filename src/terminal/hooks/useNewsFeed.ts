import { useState, useEffect } from 'react';
import * as api from '../../services/api';

export function useNewsFeed(symbol?: string) {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        setLoading(true);
        // 若無代號，則獲取全域市場新聞 (Market Feed)
        const feed = symbol 
          ? (await api.getInsights(symbol)).tvNews 
          : await api.getNewsFeed();
        setNews(feed || []);
      } catch (err) {
        console.error('News fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
  }, [symbol]);

  return { news, loading };
}
