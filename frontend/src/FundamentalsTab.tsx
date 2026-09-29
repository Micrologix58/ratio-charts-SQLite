import React, { useEffect, useState } from "react";
import {
    fetchFundamentalsPage,
    saveCompanyResearch,
    saveHistoricalFinancials,
    type CompanyResearch,
    type FundamentalsPageData,
    type HistoricalYear,
} from "./services/fundamentalsPageApi";

type Props = {
    initialSymbol?: string;
    onOpenChart?: (ticker: string) => void;
};

const EMPTY_RESEARCH: CompanyResearch = {
    sector: "OilGas", recommendation: null, score: null, debt: null, netDebt: null, productionCost: null,
    oneP: null, twoP: null, boepd2025: null,
    prodLightPct: null, prodMedHeavyPct: null, prodNGLsPct: null, prodGasPct: null, mineLifeYears: null,
    growth60: null, growth70: null, growth80: null, growth90: null, growth100: null,
    entryPriceBase: null, entryPriceBull: null, entryPriceBagger: null,
    executiveSummary: null,
};

type SectorKey = NonNullable<CompanyResearch["sector"]>;

const SECTOR_LABELS: Record<SectorKey, string> = {
    OilGas: "Oil & Gas",
    Metals: "Metals & Mining",
    Other: "Other / General",
};

// The specialized fields below are stored generically (ProductionCost, OneP, TwoP,
// four ProdXPct slots, five GrowthX slots) and just relabeled per sector here, rather
// than duplicating a parallel set of columns per industry. MineLifeYears is the one
// field Metals needed that Oil & Gas has no equivalent for.
type SectorTemplate = {
    showSpecialized: boolean;
    productionCostLabel: string;
    oneLabel: string;
    twoLabel: string;
    rateLabel: string;
    prodMixLabels: [string, string, string, string];
    showMineLife: boolean;
    growthSectionTitle: string;
    growthLabels: [string, string, string, string, string];
};

const SECTOR_TEMPLATES: Record<SectorKey, SectorTemplate> = {
    OilGas: {
        showSpecialized: true,
        productionCostLabel: "Production Cost ($/BOE)",
        oneLabel: "1P (MMBoe)",
        twoLabel: "2P (MMBoe)",
        rateLabel: "2025 BOE/d",
        prodMixLabels: ["Light", "Med/Heavy", "NGLs", "Gas"],
        showMineLife: false,
        growthSectionTitle: "Estimated Share Price Growth at BOE Price",
        growthLabels: ["$60", "$70", "$80", "$90", "$100"],
    },
    Metals: {
        showSpecialized: true,
        productionCostLabel: "AISC ($/oz)",
        oneLabel: "M&I Resources (Moz)",
        twoLabel: "P&P Reserves (Moz)",
        rateLabel: "Annual Production (oz)",
        prodMixLabels: ["Gold", "Silver", "Copper", "Other"],
        showMineLife: true,
        growthSectionTitle: "Estimated Share Price Growth at Gold Price",
        growthLabels: ["$2000", "$2400", "$2800", "$3200", "$3600"],
    },
    Other: {
        showSpecialized: false,
        productionCostLabel: "", oneLabel: "", twoLabel: "", rateLabel: "",
        prodMixLabels: ["", "", "", ""],
        showMineLife: false,
        growthSectionTitle: "", growthLabels: ["", "", "", "", ""],
    },
};

function fmt(v: number | null, digits = 2): string {
    return v == null ? "—" : v.toFixed(digits);
}

function fmtMoney(v: number | null): string {
    if (v == null) return "—";
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    return `$${v.toFixed(2)}`;
}

function fmtShares(v: number | null): string {
    if (v == null) return "—";
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    return v.toFixed(0);
}

// 5-Year History's Shares Outstanding is entered in billions (e.g. 0.1198 for 119.8M shares).
function fmtSharesB(v: number): string {
    return `${v.toFixed(3)}B`;
}

const labelStyle: React.CSSProperties = { color: "#94a3b8", fontSize: 12 };
const inputStyle: React.CSSProperties = {
    width: "100%", background: "#1e1e1e", color: "#e2e8f0", border: "1px solid #3a3a3a",
    borderRadius: 4, padding: "5px 8px", fontSize: 13, boxSizing: "border-box",
};
const fieldWrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 3 };

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #222" }}>
            <span style={labelStyle}>{label}</span>
            <span style={{ color: "#e2e8f0", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        </div>
    );
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
    return (
        <div style={fieldWrapStyle}>
            <span style={labelStyle}>{label}</span>
            <input
                type="number"
                value={value ?? ""}
                onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
                style={inputStyle}
            />
        </div>
    );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
    return (
        <div style={fieldWrapStyle}>
            <span style={labelStyle}>{label}</span>
            <input
                type="text"
                value={value ?? ""}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value === "" ? null : e.target.value)}
                style={inputStyle}
            />
        </div>
    );
}

function VerticalBarChart({ title, bars, format, color }: { title: string; bars: { label: string; value: number | null }[]; format: (v: number) => string; color: string }) {
    const values = bars.map(b => b.value).filter((v): v is number => v != null);
    const maxVal = values.length > 0 ? Math.max(...values, 0.01) : 1;
    const CHART_HEIGHT = 140;

    return (
        <div style={{ marginTop: 20 }}>
            <h4 style={{ color: "#e2e8f0", margin: "0 0 10px" }}>{title}</h4>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: CHART_HEIGHT }}>
                {bars.map(bar => {
                    const heightPct = bar.value != null ? Math.max((bar.value / maxVal) * 100, 2) : 0;
                    return (
                        <div key={bar.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                            <div style={{ color: "#e2e8f0", fontSize: 12, fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>
                                {bar.value != null ? format(bar.value) : "—"}
                            </div>
                            <div style={{ width: "100%", flex: 1, display: "flex", alignItems: "flex-end", background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ width: "100%", height: `${heightPct}%`, background: color }} />
                            </div>
                            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{bar.label}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function currentYears(): number[] {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2, y - 3, y - 4];
}

export function FundamentalsTab({ initialSymbol, onOpenChart }: Props) {
    const [inputValue, setInputValue] = useState(initialSymbol ?? "");
    const [symbol, setSymbol] = useState(initialSymbol ?? "");
    const [data, setData] = useState<FundamentalsPageData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [research, setResearch] = useState<CompanyResearch>(EMPTY_RESEARCH);
    const [historical, setHistorical] = useState<HistoricalYear[]>(currentYears().map(y => ({ fiscalYear: y, sharesOutstanding: null, peRatio: null, pbRatio: null, eps: null })));

    const [savingResearch, setSavingResearch] = useState(false);
    const [savingHistorical, setSavingHistorical] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!symbol) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchFundamentalsPage(symbol)
            .then(d => {
                if (cancelled) return;
                setData(d);
                setResearch(d.research ?? EMPTY_RESEARCH);
                const years = currentYears();
                setHistorical(years.map(y => {
                    const existing = d.historical.find(h => h.fiscalYear === y);
                    return existing ?? { fiscalYear: y, sharesOutstanding: null, peRatio: null, pbRatio: null, eps: null };
                }));
            })
            .catch(err => { if (!cancelled) { setError(err instanceof Error ? err.message : "Failed to load"); setData(null); } })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [symbol]);

    function handleLoad() {
        const v = inputValue.trim().toUpperCase();
        if (v) setSymbol(v);
    }

    async function handleSaveResearch() {
        setSavingResearch(true);
        setSaveMessage(null);
        try {
            await saveCompanyResearch(symbol, research);
            setSaveMessage("Saved");
        } catch (err) {
            setSaveMessage(err instanceof Error ? err.message : "Save failed");
        } finally {
            setSavingResearch(false);
            setTimeout(() => setSaveMessage(null), 2500);
        }
    }

    async function handleSaveHistorical() {
        setSavingHistorical(true);
        setSaveMessage(null);
        try {
            const [saved] = await Promise.all([
                saveHistoricalFinancials(symbol, historical),
                saveCompanyResearch(symbol, research),
            ]);
            const years = currentYears();
            setHistorical(years.map(y => saved.find(h => h.fiscalYear === y) ?? { fiscalYear: y, sharesOutstanding: null, peRatio: null, pbRatio: null, eps: null }));
            setSaveMessage("Saved");
        } catch (err) {
            setSaveMessage(err instanceof Error ? err.message : "Save failed");
        } finally {
            setSavingHistorical(false);
            setTimeout(() => setSaveMessage(null), 2500);
        }
    }

    function updateHistorical(year: number, field: keyof HistoricalYear, value: number | null) {
        setHistorical(prev => prev.map(h => h.fiscalYear === year ? { ...h, [field]: value } : h));
    }

    const s = data?.summary;
    const tmpl = SECTOR_TEMPLATES[research.sector ?? "OilGas"];

    return (
        <div style={{ flex: 1, padding: 24, color: "#94a3b8", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <h3 style={{ color: "#e2e8f0", margin: 0 }}>Fundamentals</h3>
                <input
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleLoad(); }}
                    placeholder="Ticker, e.g. IPOOF"
                    style={{ ...inputStyle, width: 160, marginLeft: 16 }}
                />
                <button
                    onClick={handleLoad}
                    style={{ padding: "6px 14px", background: "#2d5bff", color: "#fff", border: "1px solid #2d5bff", borderRadius: 4, cursor: "pointer", fontSize: 13 }}
                >
                    Load
                </button>
                {data && (
                    <span
                        onClick={() => onOpenChart?.(data.tickerSymbol)}
                        style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 600, marginLeft: 12, cursor: onOpenChart ? "pointer" : "default", textDecoration: onOpenChart ? "underline" : "none" }}
                    >
                        {data.companyName} ({data.tickerSymbol})
                    </span>
                )}
                {saveMessage && <span style={{ color: saveMessage === "Saved" ? "#4ade80" : "#ef4444", fontSize: 12, marginLeft: 12 }}>{saveMessage}</span>}
            </div>

            {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}
            {loading && <div style={{ fontSize: 13 }}>Loading…</div>}

            {!loading && !symbol && (
                <div style={{ fontSize: 13, color: "#555" }}>Enter a ticker above and click Load.</div>
            )}

            {!loading && data && (
                <>
                    <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
                        {/* Left column: auto-fetched summary */}
                        <div style={{ width: 260, flexShrink: 0 }}>
                            <h4 style={{ color: "#e2e8f0", margin: "0 0 8px" }}>Summary</h4>
                            <SummaryRow label="Price" value={fmtMoney(s?.price ?? null)} />
                            <SummaryRow label="EPS (TTM)" value={fmt(s?.epsTTM ?? null)} />
                            <SummaryRow label="Dividend Yield" value={s?.dividendYieldPct != null ? `${s.dividendYieldPct.toFixed(2)}%` : "—"} />
                            <SummaryRow label="P/E" value={fmt(s?.peRatio ?? null, 1)} />
                            <SummaryRow label="P/B" value={fmt(s?.pbRatio ?? null, 2)} />
                            <SummaryRow label="Market Cap" value={fmtMoney(s?.marketCapUSD ?? null)} />
                            <SummaryRow label="Shares Outstanding" value={fmtShares(s?.sharesOutstanding ?? null)} />
                            <SummaryRow label="52 Week High" value={fmtMoney(s?.week52High ?? null)} />
                            <SummaryRow label="52 Week Low" value={fmtMoney(s?.week52Low ?? null)} />
                        </div>

                        {/* Right column: manual research entry */}
                        <div style={{ flex: 1, minWidth: 360 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <h4 style={{ color: "#e2e8f0", margin: "0 0 8px" }}>Research Notes</h4>
                                <button
                                    onClick={handleSaveResearch}
                                    disabled={savingResearch}
                                    style={{ padding: "5px 12px", background: "#1e1e1e", color: "#93c5fd", border: "1px solid #3a3a3a", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
                                >
                                    {savingResearch ? "Saving…" : "Save"}
                                </button>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
                                <div style={fieldWrapStyle}>
                                    <span style={labelStyle}>Sector</span>
                                    <select
                                        value={research.sector ?? "OilGas"}
                                        onChange={e => setResearch({ ...research, sector: e.target.value as CompanyResearch["sector"] })}
                                        style={inputStyle}
                                    >
                                        {(Object.keys(SECTOR_LABELS) as SectorKey[]).map(key => (
                                            <option key={key} value={key}>{SECTOR_LABELS[key]}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={fieldWrapStyle}>
                                    <span style={labelStyle}>Recommendation</span>
                                    <select
                                        value={research.recommendation ?? ""}
                                        onChange={e => setResearch({ ...research, recommendation: (e.target.value || null) as CompanyResearch["recommendation"] })}
                                        style={inputStyle}
                                    >
                                        <option value="">—</option>
                                        <option value="Buy">Buy</option>
                                        <option value="Hold">Hold</option>
                                        <option value="Sell">Sell</option>
                                    </select>
                                </div>
                                <NumberField label="Score (0-10)" value={research.score} onChange={v => setResearch({ ...research, score: v })} />
                                <NumberField label="Debt" value={research.debt} onChange={v => setResearch({ ...research, debt: v })} />
                                <NumberField label="Net Debt" value={research.netDebt} onChange={v => setResearch({ ...research, netDebt: v })} />
                                {tmpl.showSpecialized && (
                                    <>
                                        <NumberField label={tmpl.productionCostLabel} value={research.productionCost} onChange={v => setResearch({ ...research, productionCost: v })} />
                                        <NumberField label={tmpl.oneLabel} value={research.oneP} onChange={v => setResearch({ ...research, oneP: v })} />
                                        <NumberField label={tmpl.twoLabel} value={research.twoP} onChange={v => setResearch({ ...research, twoP: v })} />
                                        <NumberField label={tmpl.rateLabel} value={research.boepd2025} onChange={v => setResearch({ ...research, boepd2025: v })} />
                                        {tmpl.showMineLife && (
                                            <NumberField label="Mine Life (years)" value={research.mineLifeYears} onChange={v => setResearch({ ...research, mineLifeYears: v })} />
                                        )}
                                    </>
                                )}
                            </div>

                            {tmpl.showSpecialized && (
                                <>
                                    <div style={{ marginBottom: 4, ...labelStyle }}>Production Mix (%)</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                                        <NumberField label={tmpl.prodMixLabels[0]} value={research.prodLightPct} onChange={v => setResearch({ ...research, prodLightPct: v })} />
                                        <NumberField label={tmpl.prodMixLabels[1]} value={research.prodMedHeavyPct} onChange={v => setResearch({ ...research, prodMedHeavyPct: v })} />
                                        <NumberField label={tmpl.prodMixLabels[2]} value={research.prodNGLsPct} onChange={v => setResearch({ ...research, prodNGLsPct: v })} />
                                        <NumberField label={tmpl.prodMixLabels[3]} value={research.prodGasPct} onChange={v => setResearch({ ...research, prodGasPct: v })} />
                                    </div>

                                    <div style={{ marginBottom: 4, ...labelStyle }}>{tmpl.growthSectionTitle}</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
                                        <TextField label={tmpl.growthLabels[0]} value={research.growth60} onChange={v => setResearch({ ...research, growth60: v })} placeholder="+10%" />
                                        <TextField label={tmpl.growthLabels[1]} value={research.growth70} onChange={v => setResearch({ ...research, growth70: v })} placeholder="+10%" />
                                        <TextField label={tmpl.growthLabels[2]} value={research.growth80} onChange={v => setResearch({ ...research, growth80: v })} placeholder="+10%" />
                                        <TextField label={tmpl.growthLabels[3]} value={research.growth90} onChange={v => setResearch({ ...research, growth90: v })} placeholder="+10%" />
                                        <TextField label={tmpl.growthLabels[4]} value={research.growth100} onChange={v => setResearch({ ...research, growth100: v })} placeholder="+10%" />
                                    </div>
                                </>
                            )}

                            <div style={{ marginBottom: 4, ...labelStyle }}>Entry Prices</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                                <NumberField label="2-3 Yr Base" value={research.entryPriceBase} onChange={v => setResearch({ ...research, entryPriceBase: v })} />
                                <NumberField label="2-3 Yr Bull" value={research.entryPriceBull} onChange={v => setResearch({ ...research, entryPriceBull: v })} />
                                <NumberField label="Bagger" value={research.entryPriceBagger} onChange={v => setResearch({ ...research, entryPriceBagger: v })} />
                            </div>
                        </div>
                    </div>

                    {/* Historical financials: entry + charts */}
                    <div style={{ marginTop: 28, borderTop: "1px solid #2a2a2a", paddingTop: 20 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h4 style={{ color: "#e2e8f0", margin: "0 0 8px" }}>5-Year History</h4>
                            <button
                                onClick={handleSaveHistorical}
                                disabled={savingHistorical}
                                style={{ padding: "5px 12px", background: "#1e1e1e", color: "#93c5fd", border: "1px solid #3a3a3a", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
                            >
                                {savingHistorical ? "Saving…" : "Save"}
                            </button>
                        </div>

                        <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
                            <table style={{ borderCollapse: "collapse", fontSize: 12, flexShrink: 0 }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: "left", padding: "4px 12px 4px 0", color: "#94a3b8" }}>Year</th>
                                        <th style={{ textAlign: "left", padding: "4px 12px", color: "#94a3b8" }}>Shares Outstanding (B)</th>
                                        <th style={{ textAlign: "left", padding: "4px 12px", color: "#94a3b8" }}>P/E</th>
                                        <th style={{ textAlign: "left", padding: "4px 12px", color: "#94a3b8" }}>P/B</th>
                                        <th style={{ textAlign: "left", padding: "4px 12px", color: "#94a3b8" }}>EPS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historical.map(h => (
                                        <tr key={h.fiscalYear}>
                                            <td style={{ padding: "3px 12px 3px 0", color: "#e2e8f0" }}>{h.fiscalYear}</td>
                                            <td style={{ padding: "3px 12px" }}>
                                                <input type="number" value={h.sharesOutstanding ?? ""} onChange={e => updateHistorical(h.fiscalYear, "sharesOutstanding", e.target.value === "" ? null : Number(e.target.value))} style={{ ...inputStyle, width: 140 }} />
                                            </td>
                                            <td style={{ padding: "3px 12px" }}>
                                                <input type="number" value={h.peRatio ?? ""} onChange={e => updateHistorical(h.fiscalYear, "peRatio", e.target.value === "" ? null : Number(e.target.value))} style={{ ...inputStyle, width: 100 }} />
                                            </td>
                                            <td style={{ padding: "3px 12px" }}>
                                                <input type="number" value={h.pbRatio ?? ""} onChange={e => updateHistorical(h.fiscalYear, "pbRatio", e.target.value === "" ? null : Number(e.target.value))} style={{ ...inputStyle, width: 100 }} />
                                            </td>
                                            <td style={{ padding: "3px 12px" }}>
                                                <input type="number" value={h.eps ?? ""} onChange={e => updateHistorical(h.fiscalYear, "eps", e.target.value === "" ? null : Number(e.target.value))} style={{ ...inputStyle, width: 100 }} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={labelStyle}>Executive Summary</span>
                                <textarea
                                    value={research.executiveSummary ?? ""}
                                    onChange={e => setResearch({ ...research, executiveSummary: e.target.value === "" ? null : e.target.value })}
                                    placeholder="Notes, thesis, catalysts…"
                                    style={{ ...inputStyle, height: 150, resize: "vertical", overflowY: "auto", fontFamily: "inherit", lineHeight: 1.4 }}
                                />
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
                            <div style={{ width: 300 }}>
                                <VerticalBarChart
                                    title="Common Shares Outstanding (B)"
                                    bars={historical.map(h => ({ label: String(h.fiscalYear), value: h.sharesOutstanding })).reverse()}
                                    format={fmtSharesB}
                                    color="#3b82f6"
                                />
                            </div>
                            <div style={{ width: 300 }}>
                                <VerticalBarChart
                                    title="P/E Ratio"
                                    bars={historical.map(h => ({ label: String(h.fiscalYear), value: h.peRatio })).reverse()}
                                    format={(v) => v.toFixed(1)}
                                    color="#f59e0b"
                                />
                            </div>
                            <div style={{ width: 300 }}>
                                <VerticalBarChart
                                    title="P/B Ratio"
                                    bars={historical.map(h => ({ label: String(h.fiscalYear), value: h.pbRatio })).reverse()}
                                    format={(v) => v.toFixed(2)}
                                    color="#4ade80"
                                />
                            </div>
                            <div style={{ width: 300 }}>
                                <VerticalBarChart
                                    title="EPS"
                                    bars={historical.map(h => ({ label: String(h.fiscalYear), value: h.eps })).reverse()}
                                    format={(v) => v.toFixed(2)}
                                    color="#a78bfa"
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
