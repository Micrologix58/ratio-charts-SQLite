export type PortfolioAccount = {
    id: number;
    name: string;
};

export type PortfolioHolding = {
    id: number;
    accountId: number;
    accountName: string;
    tickerSymbol: string;
    companyName: string;
    assetType: string;

    allocationPct: number | null;
    basisPrice: number | null;
    currentShares: number;
    sharesToHold: number | null;
    holdingsCount: number | null;
    distributionPerYear: number | null;
    status: string | null;
    taxForm: string | null;

    // Computed server-side, not stored
    currentPrice: number | null;
    investedBasis: number | null;
    value: number | null;
    pctOfHoldings: number | null;
    yieldPct: number | null;
    annualIncome: number | null;
};

export type PortfolioHoldingEdits = Partial<{
    allocationPct: number | null;
    basisPrice: number | null;
    currentShares: number;
    sharesToHold: number | null;
    holdingsCount: number | null;
    distributionPerYear: number | null;
    status: string;
    taxForm: string;
}>;

export type PortfolioTransaction = {
    id: number;
    accountId: number;
    accountName: string;
    tickerSymbol: string;
    transactionDate: string;
    transactionType: 'Bought' | 'Sold' | 'Dividend';
    shares: number | null;
    price: number | null;
    dividendAmount: number | null;
};

async function unwrap<T>(res: Response): Promise<T> {
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json.data;
}

export async function fetchPortfolioAccounts(): Promise<PortfolioAccount[]> {
    const res = await fetch('/api/portfolio/accounts');
    return unwrap(res);
}

export async function createPortfolioAccount(name: string): Promise<PortfolioAccount> {
    const res = await fetch('/api/portfolio/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    return unwrap(res);
}

export async function renamePortfolioAccount(id: number, name: string): Promise<PortfolioAccount> {
    const res = await fetch(`/api/portfolio/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    return unwrap(res);
}

export async function deletePortfolioAccount(id: number): Promise<void> {
    const res = await fetch(`/api/portfolio/accounts/${id}`, { method: 'DELETE' });
    await unwrap(res);
}

export async function fetchPortfolioHoldings(): Promise<PortfolioHolding[]> {
    const res = await fetch('/api/portfolio/holdings');
    return unwrap(res);
}

export async function addPortfolioHolding(accountId: number, tickerSymbol: string): Promise<PortfolioHolding> {
    const res = await fetch('/api/portfolio/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, tickerSymbol }),
    });
    return unwrap(res);
}

export async function updatePortfolioHolding(id: number, edits: PortfolioHoldingEdits): Promise<PortfolioHolding> {
    const res = await fetch(`/api/portfolio/holdings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
    });
    return unwrap(res);
}

export async function deletePortfolioHolding(id: number): Promise<void> {
    const res = await fetch(`/api/portfolio/holdings/${id}`, { method: 'DELETE' });
    await unwrap(res);
}

export async function fetchPortfolioTransactions(params?: { accountId?: number; tickerSymbol?: string; limit?: number }): Promise<PortfolioTransaction[]> {
    const qs = new URLSearchParams();
    if (params?.accountId) qs.set('accountId', String(params.accountId));
    if (params?.tickerSymbol) qs.set('tickerSymbol', params.tickerSymbol);
    if (params?.limit) qs.set('limit', String(params.limit));
    const res = await fetch(`/api/portfolio/transactions?${qs.toString()}`);
    return unwrap(res);
}

export async function addPortfolioTransaction(payload: {
    accountId: number;
    tickerSymbol: string;
    transactionDate: string;
    transactionType: 'Bought' | 'Sold' | 'Dividend';
    shares?: number;
    price?: number;
    dividendAmount?: number;
}): Promise<{ id: number }> {
    const res = await fetch('/api/portfolio/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return unwrap(res);
}

export type MonthlyDividendTotal = {
    year: number;
    month: number;
    monthLabel: string;
    total: number;
    annualTotal: number;
};

export async function fetchPortfolioPerformance(): Promise<MonthlyDividendTotal[]> {
    const res = await fetch('/api/portfolio/performance');
    return unwrap(res);
}
