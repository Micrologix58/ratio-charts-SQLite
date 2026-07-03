export type AssetWatchlistEntry = {
    tickerSymbol: string;
    companyName: string;
    assetType: string;
};

export type AssetWatchlist = {
    id: number;
    name: string;
    entries: AssetWatchlistEntry[];
};

export type AssetInfo = {
    TickerSymbol: string;
    CompanyName: string;
    AssetType: string;
};

export type EtfRankingRow = {
    TickerSymbol: string;
    CompanyName: string;
    Price1yrApprPct: number;
    FullDripReturnPct: number;
    ZeroDripReturnPct: number;
    AverageYieldPct: number;
    DripScore: number;
    DripOpportunityPct: number;
    OpportunityRank: number;
};

export type StockRankingRow = {
    TickerSymbol: string;
    CompanyName: string;
    Sector: string | null;
    Price1yrApprPct: number;
    LastDividendAmount: number | null;
    TrailingAnnualDividend: number;
    DividendYieldPct: number;
    StockRank: number;
};

export type OnboardPayload = {
    tickerSymbol: string;
    companyName: string;
    assetType: 'Stock' | 'ETF';
    databaseCategory?: string;
    exchangeListed?: string;
    websiteURL?: string;
};

export async function fetchAssetWatchlists(): Promise<AssetWatchlist[]> {
    const res = await fetch('/api/asset-watchlists');
    return (await res.json()).data ?? [];
}

export async function createAssetWatchlist(name: string): Promise<AssetWatchlist> {
    const res = await fetch('/api/asset-watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    return (await res.json()).data;
}

export async function renameAssetWatchlist(id: number, name: string): Promise<AssetWatchlist> {
    const res = await fetch(`/api/asset-watchlists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    return (await res.json()).data;
}

export async function deleteAssetWatchlist(id: number): Promise<void> {
    await fetch(`/api/asset-watchlists/${id}`, { method: 'DELETE' });
}

export async function addAssetEntry(id: number, tickerSymbol: string): Promise<AssetWatchlist> {
    const res = await fetch(`/api/asset-watchlists/${id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickerSymbol }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to add entry');
    return json.data;
}

export async function removeAssetEntry(id: number, tickerSymbol: string): Promise<AssetWatchlist> {
    const res = await fetch(`/api/asset-watchlists/${id}/entries/${encodeURIComponent(tickerSymbol)}`, {
        method: 'DELETE',
    });
    return (await res.json()).data;
}

export async function fetchAssetUniverse(assetType: 'stock' | 'ETF'): Promise<AssetInfo[]> {
    const res = await fetch(`/api/asset-universe?assetType=${assetType}`);
    return (await res.json()).data ?? [];
}

export async function fetchEtfRankings(limit = 100): Promise<EtfRankingRow[]> {
    const res = await fetch(`/api/asset-rankings?assetType=ETF&limit=${limit}`);
    return (await res.json()).data ?? [];
}

export async function fetchStockRankings(limit = 200): Promise<StockRankingRow[]> {
    const res = await fetch(`/api/asset-rankings?assetType=stock&limit=${limit}`);
    return (await res.json()).data ?? [];
}

export async function onboardAsset(payload: OnboardPayload): Promise<{ tickerSymbol: string; priceBackfillTriggered: boolean }> {
    const res = await fetch('/api/companies/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to onboard asset');
    return json.data;
}

export async function fetchPriceStatus(symbol: string): Promise<{ tickerSymbol: string; rowCount: number; lastPriceDate: string | null }> {
    const res = await fetch(`/api/companies/${encodeURIComponent(symbol)}/price-status`);
    return (await res.json()).data;
}
