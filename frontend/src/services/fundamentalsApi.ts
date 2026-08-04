export type Fundamentals = {
    symbol: string;
    marketCapUSD: number | null;
    epsTTM: number | null;
    peRatio: number | null;
    week52High: number | null;
    week52Low: number | null;
};

export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
    const res = await fetch(`/api/company/${encodeURIComponent(symbol)}/fundamentals`);
    if (!res.ok) throw new Error(`Failed to fetch fundamentals for ${symbol}`);
    return res.json();
}
