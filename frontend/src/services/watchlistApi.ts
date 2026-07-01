export type WatchlistEntry =
    | { type: 'S'; symbol: string }
    | { type: 'R'; expression: string };

export type Watchlist = {
    id: string;
    name: string;
    entries: WatchlistEntry[];
};

export type TickerInfo = {
    TickerSymbol: string;
    CompanyName: string;
};

// Derive a display key for an entry (used as React key + delete key)
export function entryKey(e: WatchlistEntry): string {
    return e.type === 'S' ? e.symbol : e.expression;
}

export async function fetchWatchlists(): Promise<Watchlist[]> {
    const res = await fetch('/api/watchlists');
    const json = await res.json();
    return json.data ?? [];
}

export async function createWatchlist(name: string): Promise<Watchlist> {
    const res = await fetch('/api/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    return (await res.json()).data;
}

export async function renameWatchlist(id: string, name: string): Promise<Watchlist> {
    const res = await fetch(`/api/watchlists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    return (await res.json()).data;
}

export async function deleteWatchlist(id: string): Promise<void> {
    await fetch(`/api/watchlists/${id}`, { method: 'DELETE' });
}

export async function addEntry(id: string, entry: WatchlistEntry): Promise<Watchlist> {
    const res = await fetch(`/api/watchlists/${id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
    });
    return (await res.json()).data;
}

export async function removeEntry(id: string, key: string): Promise<Watchlist> {
    const res = await fetch(
        `/api/watchlists/${id}/entries/${encodeURIComponent(key)}`,
        { method: 'DELETE' }
    );
    return (await res.json()).data;
}

export async function fetchAllTickers(): Promise<TickerInfo[]> {
    const res = await fetch('/api/tickers');
    return (await res.json()).data ?? [];
}
