import React, { useEffect, useState } from "react";
import { TradingViewPriceChart } from "./TradingViewPriceChart";
import { fetchAnnotations, saveAnnotation, deleteAnnotation } from "./services/annotationApi";
import { WatchlistPanel } from "./WatchlistPanel";
import { AssetWatchlistTab } from "./AssetWatchlistTab";
import { PortfolioTab } from "./PortfolioTab";
import type { WatchlistEntry } from "./services/watchlistApi";
import { TabBar, type AppTab } from "./TabBar";
import type { Annotation, ChartKey } from "./types/annotations";
import { fetchFundamentals, type Fundamentals } from "./services/fundamentalsApi";
import { HomeMarketPanel } from "./HomeMarketPanel";
import { AssetAllocationPanel } from "./AssetAllocationPanel";

type Mode = "S" | "R";
type TF = "D" | "W" | "M";
type Tool = "select" | "trendline" | "rectangle" | "horizontalline" | "measure" | "fibonacci" | "fibextension";

type CandlePoint = {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
};

type RatioPoint = {
    time: string;
    value: number;
};

class ChartErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: any }
> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }

    componentDidCatch(error: any, info: any) {
        console.error("ChartErrorBoundary caught", { error, info });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ color: "#ff6b6b", padding: 8 }}>
                    Chart error: {String(this.state.error?.message || this.state.error)}
                </div>
            );
        }
        return this.props.children;
    }
}

async function fetchOhlc(symbol: string, tf: TF): Promise<CandlePoint[]> {
    const params = new URLSearchParams({ symbol, tf });
    const res = await fetch(`/api/marketdata?${params.toString()}`);

    if (!res.ok) {
        throw new Error(`marketdata ${res.status} ${res.statusText}`);
    }

    const raw = (await res.json()) as {
        t: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume?: number;
    }[];

    return raw.map((r) => ({
        time: r.t.slice(0, 10),
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
    }));
}

function formatMarketCap(v: number | null): string {
    if (v == null) return "—";
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    return v.toFixed(0);
}

function formatDecimal(v: number | null, digits: number): string {
    return v == null ? "—" : v.toFixed(digits);
}

function formatRange(low: number | null, high: number | null): string {
    if (low == null || high == null) return "—";
    return `${low.toFixed(2)} - ${high.toFixed(2)}`;
}

async function fetchRatioOhlc(
    numerator: string,
    denominator: string,
    tf: TF
): Promise<RatioPoint[]> {
    const [num, den] = await Promise.all([
        fetchOhlc(numerator, tf),
        fetchOhlc(denominator, tf),
    ]);

    const denByTime = new Map(den.map((d) => [d.time, d.close]));
    const out: RatioPoint[] = [];

    for (const bar of num) {
        const denClose = denByTime.get(bar.time);
        if (!denClose || denClose === 0) continue;

        out.push({
            time: bar.time,
            value: bar.close / denClose,
        });
    }

    return out;
}

export default function App() {
    const [mode, setMode] = useState<Mode>("S");
    const [tf, setTf] = useState<TF>("D");
    const [activeTool, setActiveTool] = useState<Tool>("select");

    const [symbol, setSymbol] = useState("CNQ");
    const [expression, setExpression] = useState("CNQ/SPY");
    const [inputValue, setInputValue] = useState("CNQ");

    // Second chart pane (optional comparison symbol), independent of mode/expression
    const [secondSymbolInput, setSecondSymbolInput] = useState("");
    const [secondSymbol, setSecondSymbol] = useState<string | null>(null);
    const [secondSeries, setSecondSeries] = useState<{ time: string; value: number }[]>([]);

    // Indicator toggles — SMA overlays on the main pane, RSI in its own pane
    const [showSma50, setShowSma50] = useState(false);
    const [showSma200, setShowSma200] = useState(false);
    const [showRsi, setShowRsi] = useState(false);

    const [series, setSeries] = useState<CandlePoint[] | RatioPoint[]>([]);
    const [isRatio, setIsRatio] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [, setAnnotationsLoading] = useState(false);
    const [annotationsError, setAnnotationsError] = useState<string | null>(null);
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<AppTab>("home");

    // Company name(s) fetched from the DB for display below the toolbar
    const [companyDisplay, setCompanyDisplay] = useState<string>("");

    // Sector / Industry / Website — single-ticker mode only (not meaningful for ratios)
    const [companyMeta, setCompanyMeta] = useState<{ sector: string | null; industry: string | null; websiteURL: string | null } | null>(null);

    // Fundamentals strip below the chart — single-ticker mode only (not meaningful for ratios)
    const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);

    const LINE_ONLY_SYMBOLS = new Set(["US2YR", "US10YR", "US30YR"]);
    const isLineOnly = mode === "S" && LINE_ONLY_SYMBOLS.has(symbol);

    // Fetch company name(s) whenever the active symbol/expression changes
    useEffect(() => {
        let cancelled = false;

        async function loadCompany() {
            try {
                if (mode === "S") {
                    const res = await fetch(`/api/company/${encodeURIComponent(symbol)}`);
                    if (!res.ok) { setCompanyDisplay(symbol); setCompanyMeta(null); return; }
                    const data = await res.json();
                    if (!cancelled) {
                        setCompanyDisplay(data.companyName ?? symbol);
                        setCompanyMeta({ sector: data.sector ?? null, industry: data.industry ?? null, websiteURL: data.websiteURL ?? null });
                    }
                } else {
                    // Ratio mode — fetch both sides in parallel
                    const [num, den] = expression.split("/").map(s => s.trim());
                    if (!num || !den) { setCompanyDisplay(expression); setCompanyMeta(null); return; }
                    const [rNum, rDen] = await Promise.all([
                        fetch(`/api/company/${encodeURIComponent(num)}`),
                        fetch(`/api/company/${encodeURIComponent(den)}`),
                    ]);
                    const [dNum, dDen] = await Promise.all([rNum.json(), rDen.json()]);
                    if (!cancelled) {
                        const numName = dNum.companyName ?? num;
                        const denName = dDen.companyName ?? den;
                        setCompanyDisplay(`${numName} / ${denName}`);
                        setCompanyMeta(null);
                    }
                }
            } catch {
                if (!cancelled) { setCompanyDisplay(mode === "S" ? symbol : expression); setCompanyMeta(null); }
            }
        }

        loadCompany();
        return () => { cancelled = true; };
    }, [mode, symbol, expression]);

    // Fetch fundamentals strip (Market Cap / EPS / P/E / 52-Week Range) — single-ticker mode only
    useEffect(() => {
        if (mode !== "S") { setFundamentals(null); return; }
        let cancelled = false;
        fetchFundamentals(symbol)
            .then(data => { if (!cancelled) setFundamentals(data); })
            .catch(() => { if (!cancelled) setFundamentals(null); });
        return () => { cancelled = true; };
    }, [mode, symbol]);

    // Second chart pane data — fetches whenever the comparison symbol or timeframe changes
    useEffect(() => {
        if (!secondSymbol) { setSecondSeries([]); return; }
        let cancelled = false;
        fetchOhlc(secondSymbol, tf)
            .then(bars => {
                if (cancelled) return;
                setSecondSeries(bars.map(b => ({ time: b.time, value: b.close })));
            })
            .catch(() => { if (!cancelled) setSecondSeries([]); });
        return () => { cancelled = true; };
    }, [secondSymbol, tf]);

    function handleAddSecondSymbol() {
        const value = secondSymbolInput.trim().toUpperCase();
        setSecondSymbol(value || null);
    }

    function handleClearSecondSymbol() {
        setSecondSymbolInput("");
        setSecondSymbol(null);
    }

    // Escape key deselects the current annotation
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setSelectedAnnotationId(null);
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);

    const handleCreateAnnotation = async (annotation: Annotation) => {
        // Optimistically add to local state so the line appears immediately
        setAnnotations((prev) => [...prev, annotation]);
        setSelectedAnnotationId(annotation.id);
        try {
            await saveAnnotation(annotation);
        } catch (err) {
            console.error("Failed to save annotation:", err);
            // Roll back on failure
            setAnnotations((prev) => prev.filter((a) => a.id !== annotation.id));
            setSelectedAnnotationId(null);
        }
    };

    const handleUpdateAnnotation = async (
        id: string,
        points: [{ time: string; price: number }, { time: string; price: number }]
    ) => {
        const now = new Date().toISOString();
        let updatedAnnotation: Annotation | undefined;
        setAnnotations((prev) => {
            const next = prev.map((a) => {
                if (a.id !== id) return a;
                updatedAnnotation = { ...a, points, updatedAt: now };
                return updatedAnnotation;
            });
            return next;
        });
        // Give React one tick to flush state before reading updatedAnnotation
        setTimeout(async () => {
            if (!updatedAnnotation) return;
            try {
                await saveAnnotation(updatedAnnotation);
            } catch (err) {
                console.error("Failed to update annotation:", err);
            }
        }, 0);
    };

    const handleStyleAnnotation = async (
        id: string,
        style: { color?: string; lineWidth?: number; lineStyle?: 'solid' | 'dashed' | 'dotted'; extendLeft?: boolean; extendRight?: boolean }
    ) => {
        const now = new Date().toISOString();
        let updatedAnnotation: Annotation | undefined;
        setAnnotations((prev) => {
            const next = prev.map((a) => {
                if (a.id !== id) return a;
                updatedAnnotation = { ...a, style: { ...a.style, ...style }, updatedAt: now };
                return updatedAnnotation!;
            });
            return next;
        });
        setTimeout(async () => {
            if (!updatedAnnotation) return;
            try {
                await saveAnnotation(updatedAnnotation);
            } catch (err) {
                console.error("Failed to style annotation:", err);
            }
        }, 0);
    };

    const handleDeleteSelected = async () => {
        if (!selectedAnnotationId) return;
        const idToDelete = selectedAnnotationId;
        // Optimistically remove from local state
        setAnnotations((prev) => prev.filter((a) => a.id !== idToDelete));
        setSelectedAnnotationId(null);
        try {
            await deleteAnnotation(idToDelete);
        } catch (err) {
            console.error("Failed to delete annotation:", err);
            // No rollback on delete failure — just log it
        }
    };

    const chartKey: ChartKey =
        mode === "R"
            ? { mode, timeframe: tf, expression }
            : { mode, timeframe: tf, symbol };

    const onLoad = () => {
        const value = inputValue.trim().toUpperCase();

        if (mode === "R") {
            setExpression(value || "CNQ/SPY");
        } else {
            setSymbol(value || "CNQ");
        }
    };

    useEffect(() => {
        let cancelled = false;

        async function loadSeries() {
            try {
                setLoading(true);
                setError(null);

                if (mode === "R") {
                    const [num, den] = expression.split("/");
                    if (!num || !den) {
                        throw new Error("Invalid ratio expression");
                    }

                    const ratioData = await fetchRatioOhlc(num.trim(), den.trim(), tf);
                    if (!cancelled) {
                        setSeries(ratioData);
                        setIsRatio(true);
                    }
                } else {
                    const data = await fetchOhlc(symbol, tf);
                    if (!cancelled) {
                        setSeries(data);
                        setIsRatio(false);
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    const message =
                        err instanceof Error ? err.message : "Unknown data load error";
                    setError(message);
                    setSeries([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadSeries();

        return () => {
            cancelled = true;
        };
    }, [mode, tf, symbol, expression]);

    useEffect(() => {
        let cancelled = false;

        async function loadAnnotations() {
            try {
                setAnnotationsLoading(true);
                setAnnotationsError(null);

                const data = await fetchAnnotations(chartKey);

                const filtered = data.filter((ann) => {
                    const key = ann.chartKey;

                    if (key.mode !== chartKey.mode) return false;
                    if (key.timeframe !== chartKey.timeframe) return false;

                    if (chartKey.mode === "R") {
                        return key.expression?.toUpperCase() === chartKey.expression?.toUpperCase();
                    }

                    return key.symbol?.toUpperCase() === chartKey.symbol?.toUpperCase();
                });

                if (!cancelled) {
                    setAnnotations(filtered);
                }
            } catch (err) {
                if (!cancelled) {
                    const message =
                        err instanceof Error ? err.message : "Unknown annotation load error";
                    setAnnotationsError(message);
                    setAnnotations([]);
                }
            } finally {
                if (!cancelled) {
                    setAnnotationsLoading(false);
                }
            }
        }

        loadAnnotations();

        return () => {
            cancelled = true;
        };
    }, [chartKey.mode, chartKey.timeframe, chartKey.expression, chartKey.symbol]);

    const label =
        mode === "R"
            ? `${expression} • ${tf} • ${mode}`
            : `${symbol} • ${tf} • ${mode}`;

    function handleWatchlistSelect(entry: WatchlistEntry) {
        if (entry.type === "S") {
            setMode("S");
            setSymbol(entry.symbol);
            setInputValue(entry.symbol);
        } else {
            setMode("R");
            setExpression(entry.expression);
            setInputValue(entry.expression);
        }
    }

    function handleOpenChartSymbol(ticker: string) {
        setMode("S");
        setSymbol(ticker);
        setInputValue(ticker);
        setActiveTab("chart");
    }

    return (
        <div style={{
            minHeight: "100vh",
            width: "100vw",
            background: "#0b0b0b",
            color: "#fff",
            margin: 0,
            fontFamily: "Arial, sans-serif",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
        }}>
            {/* App title */}
            <div style={{ textAlign: "center", padding: "8px 0 0", color: "#e2e8f0", fontSize: 18, fontWeight: 600, flexShrink: 0 }}>
                Investment Hiker
            </div>

            {/* Tab bar */}
            <TabBar activeTab={activeTab} onChange={setActiveTab} />

            {/* Main content + sidebar */}
            <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

            {/* Chart tab content */}
            {activeTab === "chart" && (
            <div style={{ flex: 1, padding: "8px 10px", overflowY: "auto", boxSizing: "border-box" }}>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 12,
                }}
            >
                <span>Mode:</span>

                <button
                    onClick={() => {
                        setMode("S");
                        setInputValue(symbol);
                    }}
                    style={{
                        padding: "4px 10px",
                        background: mode === "S" ? "#444" : "#222",
                        color: "#fff",
                        border: "1px solid #666",
                        cursor: "pointer",
                    }}
                >
                    S
                </button>

                <button
                    onClick={() => {
                        setMode("R");
                        setInputValue(expression);
                    }}
                    style={{
                        padding: "4px 10px",
                        background: mode === "R" ? "#444" : "#222",
                        color: "#fff",
                        border: "1px solid #666",
                        cursor: "pointer",
                    }}
                >
                    R
                </button>

                <span style={{ marginLeft: 8 }}>TF:</span>

                {(["D", "W", "M"] as TF[]).map((item) => (
                    <button
                        key={item}
                        onClick={() => setTf(item)}
                        style={{
                            padding: "4px 10px",
                            background: tf === item ? "#444" : "#222",
                            color: "#fff",
                            border: "1px solid #666",
                            cursor: "pointer",
                        }}
                    >
                        {item}
                    </button>
                ))}

                <input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={mode === "R" ? "CNQ/SPY" : "CNQ"}
                    style={{
                        width: 180,
                        background: "#222",
                        color: "#fff",
                        border: "1px solid #666",
                        padding: "6px 8px",
                    }}
                />

                <button
                    onClick={onLoad}
                    style={{
                        padding: "6px 12px",
                        background: "#2d5bff",
                        color: "#fff",
                        border: "1px solid #2d5bff",
                        cursor: "pointer",
                    }}
                >
                    Load
                </button>

                <span style={{ marginLeft: 8, color: "#aaa" }}>Compare:</span>
                <input
                    value={secondSymbolInput}
                    onChange={(e) => setSecondSymbolInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddSecondSymbol(); }}
                    placeholder="e.g. VIX"
                    title="Add a second symbol as a line chart in a separate pane below, with its own price scale"
                    style={{
                        width: 100,
                        background: "#222",
                        color: "#fff",
                        border: "1px solid #666",
                        padding: "6px 8px",
                    }}
                />
                <button
                    onClick={handleAddSecondSymbol}
                    style={{
                        padding: "6px 10px",
                        background: "#222",
                        color: "#fff",
                        border: "1px solid #666",
                        cursor: "pointer",
                    }}
                >
                    Add
                </button>
                {secondSymbol && (
                    <button
                        onClick={handleClearSecondSymbol}
                        title={`Remove ${secondSymbol} pane`}
                        style={{
                            padding: "6px 10px",
                            background: "#222",
                            color: "#fff",
                            border: "1px solid #666",
                            cursor: "pointer",
                        }}
                    >
                        {secondSymbol} ✕
                    </button>
                )}

                <label style={{ marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 4, color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={showSma50} onChange={(e) => setShowSma50(e.target.checked)} />
                    SMA 50
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={showSma200} onChange={(e) => setShowSma200(e.target.checked)} />
                    SMA 200
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={showRsi} onChange={(e) => setShowRsi(e.target.checked)} />
                    RSI
                </label>

                {loading && <span style={{ color: "#aaa" }}>Loading…</span>}
                {error && <span style={{ color: "#ff6b6b" }}>{error}</span>}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
                {/* Tool buttons */}
                <div style={{ display: "inline-flex", gap: 4 }}>
                    <button
                        onClick={() => setActiveTool("select")}
                        style={{
                            padding: "4px 10px",
                            background: activeTool === "select" ? "#555" : "#222",
                            color: "#fff",
                            border: "1px solid #666",
                            cursor: "pointer",
                        }}
                    >
                        Select
                    </button>
                    <button
                        onClick={() => setActiveTool("trendline")}
                        style={{
                            padding: "4px 10px",
                            background: activeTool === "trendline" ? "#555" : "#222",
                            color: "#fff",
                            border: "1px solid #666",
                            cursor: "pointer",
                        }}
                    >
                        Trendline
                    </button>
                    <button
                        onClick={() => setActiveTool("rectangle")}
                        title="Draw a rectangle to mark a consolidation area"
                        style={{
                            padding: "4px 10px",
                            background: activeTool === "rectangle" ? "#555" : "#222",
                            color: "#fff",
                            border: "1px solid #666",
                            cursor: "pointer",
                        }}
                    >
                        Rectangle
                    </button>
                    <button
                        onClick={() => setActiveTool("horizontalline")}
                        title="Click the chart to place a horizontal line at that price"
                        style={{
                            padding: "4px 10px",
                            background: activeTool === "horizontalline" ? "#555" : "#222",
                            color: "#fff",
                            border: "1px solid #666",
                            cursor: "pointer",
                        }}
                    >
                        H-Line
                    </button>
                    <button
                        onClick={() => setActiveTool("measure")}
                        title="Drag between two candles to measure the price/% change between their closes"
                        style={{
                            padding: "4px 10px",
                            background: activeTool === "measure" ? "#555" : "#222",
                            color: "#fff",
                            border: "1px solid #666",
                            cursor: "pointer",
                        }}
                    >
                        Measure
                    </button>
                    <button
                        onClick={() => setActiveTool("fibonacci")}
                        title="Drag from swing high to swing low (or vice versa) to draw Fibonacci retracement levels"
                        style={{
                            padding: "4px 10px",
                            background: activeTool === "fibonacci" ? "#555" : "#222",
                            color: "#fff",
                            border: "1px solid #666",
                            cursor: "pointer",
                        }}
                    >
                        Fib
                    </button>
                    <button
                        onClick={() => setActiveTool("fibextension")}
                        title="Drag from swing start to swing end to project Fibonacci extension levels beyond the move"
                        style={{
                            padding: "4px 10px",
                            background: activeTool === "fibextension" ? "#555" : "#222",
                            color: "#fff",
                            border: "1px solid #666",
                            cursor: "pointer",
                        }}
                    >
                        Fib Ext
                    </button>
                    <button
                        onClick={handleDeleteSelected}
                        disabled={!selectedAnnotationId}
                        style={{ padding: "4px 10px", opacity: selectedAnnotationId ? 1 : 0.4, cursor: selectedAnnotationId ? "pointer" : "default" }}
                    >
                        Delete
                    </button>
                </div>

                {/* Style toolbar — only visible when an annotation is selected */}
                {selectedAnnotationId && (() => {
                    const ann = annotations.find((a) => a.id === selectedAnnotationId);
                    if (!ann) return null;
                    const currentColor = ann.style?.color ?? "#4aa3ff";
                    const currentWidth = ann.style?.lineWidth ?? 2;
                    const currentStyle = ann.style?.lineStyle ?? "solid";
                    const currentExtendLeft  = ann.style?.extendLeft  ?? false;
                    const currentExtendRight = ann.style?.extendRight ?? false;

                    const COLORS = [
                        "#4aa3ff", // blue (default)
                        "#22c55e", // green
                        "#ef5350", // red
                        "#f59e0b", // amber
                        "#a78bfa", // purple
                        "#ffffff", // white
                        "#94a3b8", // slate
                    ];

                    const WIDTHS = [1, 2, 3, 4];
                    const STYLES: Array<{ key: 'solid' | 'dashed' | 'dotted'; label: string }> = [
                        { key: "solid",  label: "—" },
                        { key: "dashed", label: "- -" },
                        { key: "dotted", label: "···" },
                    ];

                    return (
                        <div style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            marginLeft: 12,
                            paddingLeft: 12,
                            borderLeft: "1px solid #444",
                        }}>
                            {/* Color swatches */}
                            <span style={{ color: "#aaa", fontSize: 12 }}>Color:</span>
                            {COLORS.map((c) => (
                                <div
                                    key={c}
                                    onClick={() => handleStyleAnnotation(selectedAnnotationId, { color: c })}
                                    style={{
                                        width: 18,
                                        height: 18,
                                        borderRadius: "50%",
                                        background: c,
                                        cursor: "pointer",
                                        border: currentColor === c ? "2px solid #fff" : "2px solid transparent",
                                        boxSizing: "border-box",
                                        flexShrink: 0,
                                    }}
                                />
                            ))}

                            {/* Width buttons */}
                            <span style={{ color: "#aaa", fontSize: 12, marginLeft: 4 }}>Width:</span>
                            {WIDTHS.map((w) => (
                                <button
                                    key={w}
                                    onClick={() => handleStyleAnnotation(selectedAnnotationId, { lineWidth: w })}
                                    style={{
                                        padding: "2px 7px",
                                        background: currentWidth === w ? "#555" : "#222",
                                        color: "#fff",
                                        border: "1px solid #666",
                                        cursor: "pointer",
                                        fontSize: 12,
                                        fontWeight: currentWidth === w ? "bold" : "normal",
                                    }}
                                >
                                    {w}
                                </button>
                            ))}

                            {/* Line style buttons */}
                            <span style={{ color: "#aaa", fontSize: 12, marginLeft: 4 }}>Style:</span>
                            {STYLES.map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => handleStyleAnnotation(selectedAnnotationId, { lineStyle: key })}
                                    style={{
                                        padding: "2px 8px",
                                        background: currentStyle === key ? "#555" : "#222",
                                        color: "#fff",
                                        border: "1px solid #666",
                                        cursor: "pointer",
                                        fontSize: 12,
                                        letterSpacing: 1,
                                    }}
                                >
                                    {label}
                                </button>
                            ))}

                            {/* Extend left / right toggles — trendlines only; a rectangle has no direction to extend */}
                            {ann.type === "trendline" && (
                                <>
                                    <span style={{ color: "#aaa", fontSize: 12, marginLeft: 4 }}>Extend:</span>
                                    <button
                                        title="Extend line to left edge"
                                        onClick={() => handleStyleAnnotation(selectedAnnotationId, { extendLeft: !currentExtendLeft })}
                                        style={{
                                            padding: "2px 8px",
                                            background: currentExtendLeft ? "#555" : "#222",
                                            color: "#fff",
                                            border: "1px solid #666",
                                            cursor: "pointer",
                                            fontSize: 13,
                                            fontWeight: currentExtendLeft ? "bold" : "normal",
                                        }}
                                    >
                                        &#8592;
                                    </button>
                                    <button
                                        title="Extend line to right edge"
                                        onClick={() => handleStyleAnnotation(selectedAnnotationId, { extendRight: !currentExtendRight })}
                                        style={{
                                            padding: "2px 8px",
                                            background: currentExtendRight ? "#555" : "#222",
                                            color: "#fff",
                                            border: "1px solid #666",
                                            cursor: "pointer",
                                            fontSize: 13,
                                            fontWeight: currentExtendRight ? "bold" : "normal",
                                        }}
                                    >
                                        &#8594;
                                    </button>
                                </>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* Company name display */}
            <div style={{ marginBottom: 8, color: "#e2e8f0", fontSize: 22, fontWeight: 600, letterSpacing: 0.3, textAlign: "center" }}>
                {companyDisplay || (mode === "S" ? symbol : expression)}
                {annotationsError && (
                    <span style={{ color: "#ff6b6b", fontSize: 12, marginLeft: 12 }}>
                        annotation error: {annotationsError}
                    </span>
                )}
            </div>

                        <div style={{ width: "100%" }}>
                            <ChartErrorBoundary>
                                <TradingViewPriceChart
                                    data={series}
                                    isRatio={isRatio}
                                    isLineOnly={isLineOnly}
                                    label={label}
                                    watermark={mode === "S" ? symbol : expression}
                                    annotations={annotations}
                                    activeTool={activeTool}
                                    selectedAnnotationId={selectedAnnotationId}
                                    onSelectAnnotation={setSelectedAnnotationId}
                                    onCreateAnnotation={handleCreateAnnotation}
                                    onUpdateAnnotation={handleUpdateAnnotation}
                                    chartKey={chartKey}
                                    secondaryData={secondSeries}
                                    secondaryLabel={secondSymbol ?? undefined}
                                    showSma50={showSma50}
                                    showSma200={showSma200}
                                    showRsi={showRsi}
                                />
                            </ChartErrorBoundary>
                        </div>

                        {fundamentals && (
                            <div style={{
                                display: "flex", justifyContent: "center", gap: 28,
                                marginTop: 10, padding: "8px 0", color: "#e2e8f0",
                                fontSize: 13, borderTop: "1px solid #2a2a2a",
                            }}>
                                <span><span style={{ color: "#94a3b8" }}>Market Cap:</span> {formatMarketCap(fundamentals.marketCapUSD)}</span>
                                <span><span style={{ color: "#94a3b8" }}>EPS:</span> {formatDecimal(fundamentals.epsTTM, 2)}</span>
                                <span><span style={{ color: "#94a3b8" }}>P/E Ratio:</span> {formatDecimal(fundamentals.peRatio, 1)}</span>
                                <span><span style={{ color: "#94a3b8" }}>52 Week Range:</span> {formatRange(fundamentals.week52Low, fundamentals.week52High)}</span>
                            </div>
                        )}

                        {companyMeta && (companyMeta.sector || companyMeta.industry || companyMeta.websiteURL) && (
                            <div style={{
                                display: "flex", justifyContent: "center", gap: 28,
                                padding: "4px 0 8px", color: "#e2e8f0", fontSize: 13,
                            }}>
                                {companyMeta.sector && (
                                    <span><span style={{ color: "#94a3b8" }}>Sector:</span> {companyMeta.sector}</span>
                                )}
                                {companyMeta.industry && (
                                    <span><span style={{ color: "#94a3b8" }}>Industry:</span> {companyMeta.industry}</span>
                                )}
                                {companyMeta.websiteURL && (
                                    <span>
                                        <span style={{ color: "#94a3b8" }}>Website:</span>{" "}
                                        <a href={companyMeta.websiteURL} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd" }}>
                                            {companyMeta.websiteURL.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                                        </a>
                                    </span>
                                )}
                            </div>
                        )}

                    </div>
                )}


            {/* Home tab */}
            {activeTab === "home" && (
                <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
                    <HomeMarketPanel />
                    <div style={{ flex: 1, overflow: "auto" }}>
                        <AssetAllocationPanel />
                    </div>
                </div>
            )}

            {/* Watchlist tab */}
            {activeTab === "watchlist" && <AssetWatchlistTab onOpenChart={handleOpenChartSymbol} />}

            {/* Portfolio tab */}
            {activeTab === "portfolio" && <PortfolioTab onOpenChart={handleOpenChartSymbol} />}

            {/* Watchlist sidebar — always visible */}
            <WatchlistPanel
                activeSymbol={symbol}
                activeExpression={expression}
                activeMode={mode}
                onSelectEntry={handleWatchlistSelect}
            />

            </div>
        </div>
    );
}
