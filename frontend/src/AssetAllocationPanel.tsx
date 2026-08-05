import React, { useEffect, useState } from "react";
import { AllocationDonutChart, ALLOCATION_COLORS } from "./AllocationDonutChart";

type AllocationCategory = {
    categoryName: string;
    amountUSD: number;
    pct: number;
    asOfMonth: string;
};

function formatUSD(v: number): string {
    return `$${Math.round(v).toLocaleString()}`;
}

function formatPct(v: number): string {
    return `${Math.round(v)}%`;
}

function formatMonthLabel(asOfMonth: string | null): string {
    if (!asOfMonth) return "";
    const [year, month] = asOfMonth.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function AssetAllocationPanel() {
    const [categories, setCategories] = useState<AllocationCategory[] | null>(null);
    const [netWorth, setNetWorth] = useState<number>(0);
    const [asOfMonth, setAsOfMonth] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    function refresh() {
        fetch("/api/asset-allocation")
            .then(res => res.json())
            .then(json => {
                if (!json.success) throw new Error(json.error || "Failed to load asset allocation");
                setCategories(json.data.categories);
                setNetWorth(json.data.netWorth);
                setAsOfMonth(json.data.asOfMonth ?? null);
            })
            .catch(err => setError(err instanceof Error ? err.message : "Failed to load"));
    }

    useEffect(refresh, []);

    async function commitEdit(categoryName: string) {
        const amountUSD = Number(editValue.replace(/[,$]/g, ""));
        setEditing(null);
        if (!Number.isFinite(amountUSD)) return;
        await fetch(`/api/asset-allocation/${encodeURIComponent(categoryName)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amountUSD }),
        });
        refresh();
    }

    const tdLabelStyle: React.CSSProperties = { padding: "6px 10px", color: "#e2e8f0" };
    const tdNumStyle: React.CSSProperties = {
        padding: "6px 10px", color: "#e2e8f0", textAlign: "right",
        fontVariantNumeric: "tabular-nums", cursor: "pointer",
    };
    const thStyle: React.CSSProperties = {
        textAlign: "right", padding: "6px 10px", color: "#94a3b8", fontWeight: 600, fontSize: 12, borderBottom: "1px solid #2a2a2a",
    };

    return (
        <div style={{ padding: 24, color: "#94a3b8", maxWidth: 480 }}>
            <h3 style={{ color: "#e2e8f0", marginTop: 0 }}>
                Asset Allocation
                {asOfMonth && (
                    <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 400 }}> (As of {formatMonthLabel(asOfMonth)})</span>
                )}
            </h3>

            {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
            {!error && categories == null && <div style={{ fontSize: 12 }}>Loading…</div>}

            {categories != null && netWorth > 0 && (
                <AllocationDonutChart slices={categories} colors={ALLOCATION_COLORS} netWorth={netWorth} />
            )}

            {categories != null && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                        <tr>
                            <th style={{ ...thStyle, textAlign: "left" }}>Asset Allocation:</th>
                            <th style={thStyle}>Amount (In USD)</th>
                            <th style={thStyle}>%</th>
                        </tr>
                    </thead>
                    <tbody>
                        {categories.map((c, i) => (
                            <tr key={c.categoryName} style={{ borderBottom: "1px solid #1f1f1f" }}>
                                <td style={tdLabelStyle}>
                                    <span style={{
                                        display: "inline-block", width: 9, height: 9, borderRadius: "50%",
                                        background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                                        marginRight: 8,
                                    }} />
                                    {c.categoryName}
                                </td>
                                <td
                                    style={tdNumStyle}
                                    title="Click to edit"
                                    onClick={() => { setEditing(c.categoryName); setEditValue(String(c.amountUSD)); }}
                                >
                                    {editing === c.categoryName ? (
                                        <input
                                            autoFocus
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onBlur={() => commitEdit(c.categoryName)}
                                            onKeyDown={e => {
                                                if (e.key === "Enter") commitEdit(c.categoryName);
                                                if (e.key === "Escape") setEditing(null);
                                            }}
                                            style={{
                                                width: 110, textAlign: "right", background: "#111", color: "#e2e8f0",
                                                border: "1px solid #3a3a3a", borderRadius: 4, padding: "2px 6px", fontSize: 14,
                                            }}
                                        />
                                    ) : formatUSD(c.amountUSD)}
                                </td>
                                <td style={{ ...tdNumStyle, cursor: "default" }}>{formatPct(c.pct)}</td>
                            </tr>
                        ))}
                        <tr>
                            <td style={{ ...tdLabelStyle, fontWeight: 700, color: "#e2e8f0", paddingTop: 10 }}>Net Worth</td>
                            <td style={{ ...tdNumStyle, fontWeight: 700, cursor: "default", paddingTop: 10 }}>{formatUSD(netWorth)}</td>
                            <td style={{ ...tdNumStyle, cursor: "default", paddingTop: 10 }}></td>
                        </tr>
                    </tbody>
                </table>
            )}
        </div>
    );
}
