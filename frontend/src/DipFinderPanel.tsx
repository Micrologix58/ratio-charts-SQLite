import { useEffect, useState } from "react";
import {
    fetchAssetWatchlists,
    fetchStockRankings,
    fetchEtfRankings,
    type AssetWatchlist,
} from "./services/assetWatchlistApi";

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

export function DipFinderPanel({ onOpenChart }: Props) {
    const [watchlists, setWatchlists] = useState<AssetWatchlist[]>([]);
    const [activeId, setActiveId] = useState<number | null>(null);
    const [rows, setRows] = useState<DipRow[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load the list of watchlists once, defaulting to the first one
    useEffect(() => {
        fetchAssetWatchlists()
            .then(lists => {
                setWatchlists(lists);
                setActiveId(prev => prev ?? lists[0]?.id ?? null);
            })
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load watchlists"));
    }, []);

    // Compute dip-from-52wk-high for the active watchlist's entries
    useEffect(() => {
        if (activeId == null) { setRows(null); return; }
        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            fetchAssetWatchlists(),
            fetchStockRankings(100000),
            fetchEtfRankings(100000),
        ]).then(([lists, stockRanks, etfRanks]) => {
            if (cancelled) return;
            const active = lists.find(w => w.id === activeId);
            if (!active) { setRows([]); setLoading(false); return; }

            const stockMap = new Map(stockRanks.map(r => [r.TickerSymbol, r]));
            const etfMap = new Map(etfRanks.map(r => [r.TickerSymbol, r]));

            const computed: DipRow[] = [];
            for (const entry of active.entries) {
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
    }, [activeId]);

    const maxDip = rows && rows.length > 0 ? Math.max(...rows.map(r => r.dipPct), 0.01) : 1;

    return (
        <div style={{ padding: 24, color: "#94a3b8", maxWidth: 420 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <h3 style={{ color: "#e2e8f0", margin: 0 }}>Dip Finder</h3>
                <select
                    value={activeId ?? ""}
                    onChange={e => setActiveId(Number(e.target.value))}
                    style={{
                        background: "#1e1e1e", color: "#e2e8f0", border: "1px solid #3a3a3a",
                        borderRadius: 4, padding: "4px 8px", fontSize: 12,
                    }}
                >
                    {watchlists.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                </select>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 12 }}>% below 52-week high</div>

            {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
            {!error && watchlists.length === 0 && <div style={{ fontSize: 12 }}>No watchlists yet.</div>}
            {!error && loading && <div style={{ fontSize: 12 }}>Loading…</div>}

            {!loading && rows && rows.length === 0 && (
                <div style={{ fontSize: 12, color: "#555" }}>No priced entries in this watchlist.</div>
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
