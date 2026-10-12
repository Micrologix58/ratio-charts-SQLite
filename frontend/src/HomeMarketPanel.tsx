import React, { useEffect, useState } from "react";

type MarketSnapshotRow = {
    section: "Indexes" | "Rates" | "Currencies" | "Commodities";
    symbol: string;
    label: string;
    current: number | null;
    previous: number | null;
    pctChange: number | null;
    asOfDate: string | null;
};

type Timeframe = "day" | "week" | "month";

const SECTION_ORDER: MarketSnapshotRow["section"][] = ["Indexes", "Rates", "Currencies", "Commodities"];

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
];

function formatValue(v: number | null, section: MarketSnapshotRow["section"]): string {
    if (v == null) return "—";
    // FX pairs move in fractions of a cent -- 2 decimals rounds EUR/USD-style
    // pairs to noise; USD/JPY-style pairs (v > 10) still read fine at 2.
    const digits = section === "Currencies" && v < 10 ? 4 : 2;
    return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatChange(v: number | null): { text: string; color: string } {
    if (v == null) return { text: "—", color: "#94a3b8" };
    if (v === 0) return { text: "UNCH", color: "#94a3b8" };
    const color = v > 0 ? "#4ade80" : "#ef4444";
    const sign = v > 0 ? "+" : "";
    return { text: `${sign}${v.toFixed(2)}%`, color };
}

export function HomeMarketPanel() {
    const [timeframe, setTimeframe] = useState<Timeframe>("day");
    const [rows, setRows] = useState<MarketSnapshotRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setError(null);
        fetch(`/api/market-snapshot?timeframe=${timeframe}`)
            .then(res => res.json())
            .then(json => {
                if (cancelled) return;
                if (!json.success) throw new Error(json.error || "Failed to load market snapshot");
                setRows(json.data);
            })
            .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load"); });
        return () => { cancelled = true; };
    }, [timeframe]);

    const tdLabelStyle: React.CSSProperties = {
        padding: "4px 8px", color: "#e2e8f0", whiteSpace: "nowrap",
    };
    const tdNumStyle: React.CSSProperties = {
        padding: "4px 8px", color: "#e2e8f0", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
    };
    const thStyle: React.CSSProperties = {
        padding: "0 8px 4px", color: "#64748b", textAlign: "right", whiteSpace: "nowrap", fontSize: 11, fontWeight: 500,
    };

    const priorColumnLabel = timeframe === "day" ? "Prior" : timeframe === "week" ? "Wk Ago" : "Mo Ago";

    return (
        <div style={{ width: 300, flexShrink: 0, padding: "20px 16px", borderRight: "1px solid #2a2a2a", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ color: "#e2e8f0", margin: 0 }}>Current Markets</h3>
                <div style={{ display: "flex", border: "1px solid #2a2a2a", borderRadius: 6, overflow: "hidden" }}>
                    {TIMEFRAMES.map(tf => {
                        const active = tf.value === timeframe;
                        return (
                            <button
                                key={tf.value}
                                onClick={() => setTimeframe(tf.value)}
                                style={{
                                    padding: "3px 8px",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    border: "none",
                                    cursor: "pointer",
                                    background: active ? "#3b82f6" : "transparent",
                                    color: active ? "#ffffff" : "#94a3b8",
                                }}
                            >
                                {tf.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
            {!error && rows == null && <div style={{ color: "#94a3b8", fontSize: 12 }}>Loading…</div>}

            {rows != null && SECTION_ORDER.map(section => {
                const sectionRows = rows.filter(r => r.section === section);
                if (sectionRows.length === 0) return null;
                return (
                    <div key={section} style={{ marginBottom: 18 }}>
                        <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{section}:</div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                                <tr>
                                    <th style={{ ...thStyle, textAlign: "left" }} />
                                    <th style={thStyle}>Last</th>
                                    <th style={thStyle}>{priorColumnLabel}</th>
                                    <th style={thStyle}>Chg</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sectionRows.map(row => {
                                    const change = formatChange(row.pctChange);
                                    return (
                                        <tr key={row.symbol} style={{ borderBottom: "1px solid #1f1f1f" }}>
                                            <td style={tdLabelStyle}>{row.label}</td>
                                            <td style={tdNumStyle}>{formatValue(row.current, row.section)}</td>
                                            <td style={tdNumStyle}>{formatValue(row.previous, row.section)}</td>
                                            <td style={{ ...tdNumStyle, color: change.color, fontWeight: 600 }}>{change.text}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                );
            })}
        </div>
    );
}
