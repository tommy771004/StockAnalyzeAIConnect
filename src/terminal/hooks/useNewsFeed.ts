import { useState, useEffect } from 'react';
import * as api from '../../services/api';

export function useNewsFeed(symbol?: string, category: string = '焦點') {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        setLoading(true);
        // 若有代號，獲取標的新聞；若無，則按分類獲取市場新聞
        const feed = symbol 
          ? (await api.getInsights(symbol)).tvNews 
          : await api.getNewsFeed(category);
        setNews(feed || []);
      } catch (err) {
        console.error('News fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
  }, [symbol, category]);

  return { news, loading };
}
