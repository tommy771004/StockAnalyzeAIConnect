import fetch from 'node-fetch';

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  published: number; // Unix timestamp
  link: string;
  summary?: string;
  category?: string;
}

export async function getWantGooNews(category: string = '焦點'): Promise<NewsItem[]> {
  const categoryMap: Record<string, string> = {
    '焦點': '焦點',
    '頭條': '頭條',
    '台股': '台股新聞',
    '國際': '國際政經',
    '美股': '美股',
    '理財': '理財'
  };

  const target = categoryMap[category] || '焦點';
  const url = `https://www.wantgoo.com/news/category/${encodeURIComponent(target)}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Referer': 'https://www.wantgoo.com/news',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    const html = await res.text();
    
    // Attempt to extract news items from WantGoo HTML
    // We try multiple patterns to ensure resilience
    const news: NewsItem[] = [];
    
    // Pattern 1: <h3 class="title"><a href="/news/1253418">Title</a></h3>
    const matches = html.matchAll(/<h3 class="title">\s*<a href="\/news\/(\d+)"[^>]*>([^<]+)<\/a>/g);
    for (const match of matches) {
      news.push({
        id: match[1],
        title: match[2].trim(),
        source: 'WantGoo',
        published: Math.floor(Date.now() / 1000),
        link: `https://www.wantgoo.com/news/${match[1]}`
      });
    }

    // Pattern 2: Search for list items in common containers if Pattern 1 yields nothing
    if (news.length === 0) {
      const listMatches = html.matchAll(/<li[^>]*>.*?<a href="\/news\/(\d+)"[^>]*title="([^"]+)"/g);
      for (const match of listMatches) {
        news.push({
          id: match[1],
          title: match[2].trim(),
          source: 'WantGoo',
          published: Math.floor(Date.now() / 1000),
          link: `https://www.wantgoo.com/news/${match[1]}`
        });
      }
    }

    if (news.length === 0) {
      console.warn(`[NewsService] No news found in HTML for category ${category}. HTML length: ${html.length}`);
    }
    
    return news;
  } catch (e) {
    console.error(`[NewsService] Failed to fetch WantGoo news for ${category}:`, e);
    return [];
  }
}

export async function getNewsContent(articleId: string): Promise<string> {
  const url = `https://www.wantgoo.com/news/${articleId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    
    // Extract content from article-content div
    const contentMatch = html.match(/<div class="article-content">([\s\S]*?)<\/div>/);
    if (!contentMatch) return '';
    
    // Strip HTML tags
    return contentMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch (e) {
    console.error(`[NewsService] Failed to fetch content for article ${articleId}:`, e);
    return '';
  }
}
