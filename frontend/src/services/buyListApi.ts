export type BuyListEntry = {
    tickerSymbol: string;
    companyName: string;
    assetType: string;
    entryPrice: number | null;
    notes: string | null;
    currentPrice: number | null;
    marketCapUSD: number | null;
    week52High: number | null;
};

export async function fetchBuyList(): Promise<BuyListEntry[]> {
    const res = await fetch('/api/buylist');
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to load Buy List');
    return json.data;
}

export async function addToBuyList(tickerSymbol: string): Promise<BuyListEntry[]> {
    const res = await fetch('/api/buylist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickerSymbol }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `Failed to add ${tickerSymbol} to Buy List`);
    return json.data;
}

export async function updateBuyListEntryPrice(tickerSymbol: string, entryPrice: number | null): Promise<BuyListEntry[]> {
    const res = await fetch(`/api/buylist/${encodeURIComponent(tickerSymbol)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryPrice }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `Failed to update ${tickerSymbol}`);
    return json.data;
}

export async function updateBuyListNotes(tickerSymbol: string, notes: string | null): Promise<BuyListEntry[]> {
    const res = await fetch(`/api/buylist/${encodeURIComponent(tickerSymbol)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `Failed to update ${tickerSymbol}`);
    return json.data;
}

export async function removeFromBuyList(tickerSymbol: string): Promise<BuyListEntry[]> {
    const res = await fetch(`/api/buylist/${encodeURIComponent(tickerSymbol)}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `Failed to remove ${tickerSymbol}`);
    return json.data;
}
