export type NewsItem = {
    symbol: string;
    headline: string;
    url: string | null;
    publicationDate: string | null; // ISO string
};

export async function fetchNews(symbols: string[], limit = 20): Promise<NewsItem[]> {
    if (symbols.length === 0) return [];
    const params = new URLSearchParams({ symbols: symbols.join(','), limit: String(limit) });
    const res = await fetch(`/api/news?${params.toString()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to load news');
    return json.data ?? [];
}
