import { useEffect, useState } from "react";
import {
    fetchAssetWatchlists,
    fetchStockRankings,
    fetchEtfRankings,
    type AssetWatchlist,
} from "./services/assetWatchlistApi";
import { fetchPortfolioHoldings } from "./services/portfolioApi";

type DipRow = {
    tickerSymbol: string;
    companyName: string;
    lastPrice: number;
    week52High: number;
    dipPct: number; // % below 52-week high
};

type Props = {
    onOpenChart?: (ticker: string) => void;
};

const PORTFOLIO_SOURCE = "portfolio" as const;
type Source = number | typeof PORTFOLIO_SOURCE;

export function DipFinderPanel({ onOpenChart }: Props) {
    const [watchlists, setWatchlists] = useState<AssetWatchlist[]>([]);
    const [source, setSource] = useState<Source>(PORTFOLIO_SOURCE);
    const [rows, setRows] = useState<DipRow[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load the list of watchlists once; Portfolio stays the default selection
    useEffect(() => {
        fetchAssetWatchlists()
            .then(lists => setWatchlists(lists))
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load watchlists"));
    }, []);

    // Compute dip-from-52wk-high for the active watchlist's (or portfolio's) entries
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            source === PORTFOLIO_SOURCE ? fetchPortfolioHoldings() : fetchAssetWatchlists(),
            fetchStockRankings(100000),
            fetchEtfRankings(100000),
        ]).then(([sourceData, stockRanks, etfRanks]) => {
            if (cancelled) return;

            let entries: { tickerSymbol: string; companyName: string; assetType: string }[];
            if (source === PORTFOLIO_SOURCE) {
                const seen = new Set<string>();
                entries = [];
                for (const h of sourceData as Awaited<ReturnType<typeof fetchPortfolioHoldings>>) {
                    if (seen.has(h.tickerSymbol)) continue;
                    seen.add(h.tickerSymbol);
                    entries.push({ tickerSymbol: h.tickerSymbol, companyName: h.companyName, assetType: h.assetType });
                }
            } else {
                const active = (sourceData as AssetWatchlist[]).find(w => w.id === source);
                if (!active) { setRows([]); setLoading(false); return; }
                entries = active.entries;
            }

            const stockMap = new Map(stockRanks.map(r => [r.TickerSymbol, r]));
            const etfMap = new Map(etfRanks.map(r => [r.TickerSymbol, r]));

            const computed: DipRow[] = [];
            for (const entry of entries) {
                const r = entry.assetType.toUpperCase() === "ETF"
                    ? etfMap.get(entry.tickerSymbol)
                    : stockMap.get(entry.tickerSymbol);
                const lastPrice = r?.LastPrice ?? null;
                const week52High = r?.Week52High ?? null;
                if (lastPrice == null || week52High == null || week52High <= 0) continue;

                computed.push({
                    tickerSymbol: entry.tickerSymbol,
                    companyName: entry.companyName,
                    lastPrice,
                    week52High,
                    dipPct: ((week52High - lastPrice) / week52High) * 100,
                });
            }
            computed.sort((a, b) => b.dipPct - a.dipPct);

            setRows(computed);
            setLoading(false);
        }).catch(err => {
            if (!cancelled) {
                setError(err instanceof Error ? err.message : "Failed to load dip data");
                setLoading(false);
            }
        });

        return () => { cancelled = true; };
    }, [source]);

    const maxDip = rows && rows.length > 0 ? Math.max(...rows.map(r => r.dipPct), 0.01) : 1;

    return (
        <div style={{ padding: 24, color: "#94a3b8", maxWidth: 420 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <h3 style={{ color: "#e2e8f0", margin: 0 }}>Dip Finder</h3>
                <select
                    value={source}
                    onChange={e => setSource(e.target.value === PORTFOLIO_SOURCE ? PORTFOLIO_SOURCE : Number(e.target.value))}
                    style={{
                        background: "#1e1e1e", color: "#e2e8f0", border: "1px solid #3a3a3a",
                        borderRadius: 4, padding: "4px 8px", fontSize: 12,
                    }}
                >
                    <option value={PORTFOLIO_SOURCE}>Portfolio</option>
                    {watchlists.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                </select>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 12 }}>% below 52-week high</div>

            {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
            {!error && loading && <div style={{ fontSize: 12 }}>Loading…</div>}

            {!loading && rows && rows.length === 0 && (
                <div style={{ fontSize: 12, color: "#555" }}>
                    No priced entries in this {source === PORTFOLIO_SOURCE ? "portfolio" : "watchlist"}.
                </div>
            )}

            {!loading && rows && rows.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {rows.map(row => {
                        const barWidthPct = Math.max((row.dipPct / maxDip) * 100, 2);
                        const barColor = row.dipPct >= 20 ? "#ef4444" : row.dipPct >= 10 ? "#f59e0b" : "#4ade80";
                        return (
                            <div key={row.tickerSymbol} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div
                                    title={row.companyName}
                                    onClick={() => onOpenChart?.(row.tickerSymbol)}
                                    style={{
                                        width: 56, flexShrink: 0, color: "#93c5fd", fontWeight: 600, fontSize: 13,
                                        cursor: onOpenChart ? "pointer" : "default",
                                        textDecoration: onOpenChart ? "underline" : "none",
                                    }}
                                >
                                    {row.tickerSymbol}
                                </div>
                                <div style={{ flex: 1, background: "#1a1a1a", borderRadius: 3, overflow: "hidden", height: 18 }}>
                                    <div style={{ width: `${barWidthPct}%`, height: "100%", background: barColor }} />
                                </div>
                                <div style={{ width: 52, flexShrink: 0, textAlign: "right", color: "#e2e8f0", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                                    -{row.dipPct.toFixed(1)}%
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
