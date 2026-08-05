import React, { useEffect, useState } from "react";

type MarketSnapshotRow = {
    section: "Indexes" | "Rates" | "Commodities";
    symbol: string;
    label: string;
    current: number | null;
    previous: number | null;
    pctChange: number | null;
    asOfDate: string | null;
};

const SECTION_ORDER: MarketSnapshotRow["section"][] = ["Indexes", "Rates", "Commodities"];

function formatValue(v: number | null): string {
    if (v == null) return "—";
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatChange(v: number | null): { text: string; color: string } {
    if (v == null) return { text: "—", color: "#94a3b8" };
    if (v === 0) return { text: "UNCH", color: "#94a3b8" };
    const color = v > 0 ? "#4ade80" : "#ef4444";
    const sign = v > 0 ? "+" : "";
    return { text: `${sign}${v.toFixed(2)}%`, color };
}

export function HomeMarketPanel() {
    const [rows, setRows] = useState<MarketSnapshotRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/market-snapshot")
            .then(res => res.json())
            .then(json => {
                if (cancelled) return;
                if (!json.success) throw new Error(json.error || "Failed to load market snapshot");
                setRows(json.data);
            })
            .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load"); });
        return () => { cancelled = true; };
    }, []);

    const tdLabelStyle: React.CSSProperties = {
        padding: "4px 8px", color: "#e2e8f0", whiteSpace: "nowrap",
    };
    const tdNumStyle: React.CSSProperties = {
        padding: "4px 8px", color: "#e2e8f0", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
    };

    return (
        <div style={{ width: 300, flexShrink: 0, padding: "20px 16px", borderRight: "1px solid #2a2a2a", overflow: "auto" }}>
            <h3 style={{ color: "#e2e8f0", margin: "0 0 12px" }}>Current Markets</h3>

            {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
            {!error && rows == null && <div style={{ color: "#94a3b8", fontSize: 12 }}>Loading…</div>}

            {rows != null && SECTION_ORDER.map(section => {
                const sectionRows = rows.filter(r => r.section === section);
                if (sectionRows.length === 0) return null;
                return (
                    <div key={section} style={{ marginBottom: 18 }}>
                        <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{section}:</div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <tbody>
                                {sectionRows.map(row => {
                                    const change = formatChange(row.pctChange);
                                    return (
                                        <tr key={row.symbol} style={{ borderBottom: "1px solid #1f1f1f" }}>
                                            <td style={tdLabelStyle}>{row.label}</td>
                                            <td style={tdNumStyle}>{formatValue(row.current)}</td>
                                            <td style={tdNumStyle}>{formatValue(row.previous)}</td>
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
