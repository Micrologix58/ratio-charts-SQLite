import React, { useEffect, useState } from "react";
import {
    fetchBuyList,
    updateBuyListEntryPrice,
    updateBuyListNotes,
    removeFromBuyList,
    type BuyListEntry,
} from "./services/buyListApi";

type Props = {
    onOpenChart?: (ticker: string) => void;
};

function fmtMoney(v: number | null): string {
    if (v == null) return "—";
    return `$${v.toFixed(2)}`;
}

function fmtMarketCap(v: number | null): string {
    if (v == null) return "—";
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    return `$${v.toFixed(0)}`;
}

const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "6px 12px", color: "#94a3b8", fontSize: 12,
    borderBottom: "1px solid #2a2a2a", fontWeight: 600,
};
const tdStyle: React.CSSProperties = {
    padding: "6px 12px", color: "#e2e8f0", fontSize: 13, borderBottom: "1px solid #1c1c1c",
};

export function BuyListTab({ onOpenChart }: Props) {
    const [entries, setEntries] = useState<BuyListEntry[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingPrice, setEditingPrice] = useState<Record<string, string>>({});
    const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

    function load() {
        setLoading(true);
        setError(null);
        fetchBuyList()
            .then(data => setEntries(data))
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load Buy List"))
            .finally(() => setLoading(false));
    }

    useEffect(() => { load(); }, []);

    async function handleEntryPriceCommit(ticker: string) {
        const raw = editingPrice[ticker];
        if (raw === undefined) return;
        const value = raw.trim() === "" ? null : Number(raw);
        try {
            const updated = await updateBuyListEntryPrice(ticker, value);
            setEntries(updated);
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to update ${ticker}`);
        } finally {
            setEditingPrice(prev => {
                const next = { ...prev };
                delete next[ticker];
                return next;
            });
        }
    }

    async function handleNotesCommit(ticker: string) {
        const raw = editingNotes[ticker];
        if (raw === undefined) return;
        try {
            const updated = await updateBuyListNotes(ticker, raw.trim() === "" ? null : raw);
            setEntries(updated);
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to update ${ticker}`);
        } finally {
            setEditingNotes(prev => {
                const next = { ...prev };
                delete next[ticker];
                return next;
            });
        }
    }

    async function handleRemove(ticker: string) {
        try {
            const updated = await removeFromBuyList(ticker);
            setEntries(updated);
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to remove ${ticker}`);
        }
    }

    return (
        <div style={{ flex: 1, padding: 24, color: "#94a3b8", overflow: "auto" }}>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 4px" }}>Buy List</h3>
            <div style={{ fontSize: 12, marginBottom: 12 }}>
                Candidates you're tracking to buy — add tickers from the Watchlist tab.
            </div>

            {error && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>{error}</div>}
            {loading && <div style={{ fontSize: 13 }}>Loading…</div>}

            {!loading && entries && entries.length === 0 && (
                <div style={{ fontSize: 13, color: "#555" }}>
                    No tickers yet — go to the Watchlist tab and press "+ Buy" next to a ticker.
                </div>
            )}

            {!loading && entries && entries.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Stock</th>
                                <th style={thStyle}>Ticker</th>
                                <th style={thStyle}>Mkt Cap</th>
                                <th style={thStyle}>Current Price</th>
                                <th style={thStyle}>52 Wk Hi</th>
                                <th style={thStyle}>Entry Price</th>
                                <th style={thStyle}>Notes</th>
                                <th style={thStyle}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(entry => (
                                <tr key={entry.tickerSymbol}>
                                    <td style={tdStyle}>{entry.companyName}</td>
                                    <td style={tdStyle}>
                                        <span
                                            onClick={() => onOpenChart?.(entry.tickerSymbol)}
                                            style={{
                                                color: "#93c5fd", fontWeight: 600,
                                                cursor: onOpenChart ? "pointer" : "default",
                                                textDecoration: onOpenChart ? "underline" : "none",
                                            }}
                                        >
                                            {entry.tickerSymbol}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{fmtMarketCap(entry.marketCapUSD)}</td>
                                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(entry.currentPrice)}</td>
                                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(entry.week52High)}</td>
                                    <td style={tdStyle}>
                                        <input
                                            type="number"
                                            value={editingPrice[entry.tickerSymbol] ?? (entry.entryPrice ?? "")}
                                            onChange={e => setEditingPrice(prev => ({ ...prev, [entry.tickerSymbol]: e.target.value }))}
                                            onBlur={() => handleEntryPriceCommit(entry.tickerSymbol)}
                                            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                            style={{
                                                width: 90, background: "#1e1e1e", color: "#e2e8f0", border: "1px solid #3a3a3a",
                                                borderRadius: 4, padding: "4px 6px", fontSize: 13, boxSizing: "border-box",
                                            }}
                                        />
                                    </td>
                                    <td style={tdStyle}>
                                        <input
                                            type="text"
                                            value={editingNotes[entry.tickerSymbol] ?? (entry.notes ?? "")}
                                            onChange={e => setEditingNotes(prev => ({ ...prev, [entry.tickerSymbol]: e.target.value }))}
                                            onBlur={() => handleNotesCommit(entry.tickerSymbol)}
                                            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                            placeholder="Notes…"
                                            style={{
                                                width: 200, background: "#1e1e1e", color: "#e2e8f0", border: "1px solid #3a3a3a",
                                                borderRadius: 4, padding: "4px 6px", fontSize: 13, boxSizing: "border-box",
                                            }}
                                        />
                                    </td>
                                    <td style={tdStyle}>
                                        <button
                                            onClick={() => handleRemove(entry.tickerSymbol)}
                                            title="Remove from Buy List"
                                            style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 13 }}
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
