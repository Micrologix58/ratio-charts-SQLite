export type FundamentalsSummary = {
    price: number | null;
    epsTTM: number | null;
    dividendYieldPct: number | null;
    peRatio: number | null;
    pbRatio: number | null;
    marketCapUSD: number | null;
    sharesOutstanding: number | null;
    week52High: number | null;
    week52Low: number | null;
};

export type CompanyResearch = {
    recommendation: 'Buy' | 'Hold' | 'Sell' | null;
    score: number | null;
    debt: number | null;
    netDebt: number | null;
    productionCost: number | null;
    oneP: number | null;
    twoP: number | null;
    boepd2025: number | null;
    prodLightPct: number | null;
    prodMedHeavyPct: number | null;
    prodNGLsPct: number | null;
    prodGasPct: number | null;
    growth60: string | null;
    growth70: string | null;
    growth80: string | null;
    growth90: string | null;
    growth100: string | null;
    entryPriceBase: number | null;
    entryPriceBull: number | null;
    entryPriceBagger: number | null;
    executiveSummary: string | null;
};

export type HistoricalYear = {
    fiscalYear: number;
    sharesOutstanding: number | null;
    peRatio: number | null;
    pbRatio: number | null;
    eps: number | null;
};

export type FundamentalsPageData = {
    tickerSymbol: string;
    companyName: string;
    summary: FundamentalsSummary;
    research: CompanyResearch | null;
    historical: HistoricalYear[];
};

export async function fetchFundamentalsPage(symbol: string): Promise<FundamentalsPageData> {
    const res = await fetch(`/api/fundamentals-page/${encodeURIComponent(symbol)}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `Failed to load fundamentals for ${symbol}`);
    return json.data;
}

export async function saveCompanyResearch(symbol: string, research: CompanyResearch): Promise<void> {
    const res = await fetch(`/api/fundamentals-page/${encodeURIComponent(symbol)}/research`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(research),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to save research');
}

export async function saveHistoricalFinancials(symbol: string, years: HistoricalYear[]): Promise<HistoricalYear[]> {
    const res = await fetch(`/api/fundamentals-page/${encodeURIComponent(symbol)}/historical`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ years }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to save historical financials');
    return json.data;
}
