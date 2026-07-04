import React, { useEffect, useState } from "react";
import { TradingViewPriceChart } from "./TradingViewPriceChart";
import { fetchAnnotations, saveAnnotation, deleteAnnotation } from "./services/annotationApi";
import { WatchlistPanel } from "./WatchlistPanel";
import { AssetWatchlistTab } from "./AssetWatchlistTab";
import { PortfolioTab } from "./PortfolioTab";
import type { WatchlistEntry } from "./services/watchlistApi";
import { TabBar, type AppTab } from "./TabBar";
import type { Annotation, ChartKey } from "./types/annotations";

type Mode = "S" | "R";
type TF = "D" | "W" | "M";
type Tool = "select" | "trendline" | "rectangle";

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

    const LINE_ONLY_SYMBOLS = new Set(["US2YR", "US10YR", "US30YR"]);
    const isLineOnly = mode === "S" && LINE_ONLY_SYMBOLS.has(symbol);

    // Fetch company name(s) whenever the active symbol/expression changes
    useEffect(() => {
        let cancelled = false;

        async function loadCompany() {
            try {
                if (mode === "S") {
                    const res = await fetch(`/api/company/${encodeURIComponent(symbol)}`);
                    if (!res.ok) { setCompanyDisplay(symbol); return; }
                    const data = await res.json();
                    if (!cancelled) setCompanyDisplay(data.companyName ?? symbol);
                } else {
                    // Ratio mode — fetch both sides in parallel
                    const [num, den] = expression.split("/").map(s => s.trim());
                    if (!num || !den) { setCompanyDisplay(expression); return; }
                    const [rNum, rDen] = await Promise.all([
                        fetch(`/api/company/${encodeURIComponent(num)}`),
                        fetch(`/api/company/${encodeURIComponent(den)}`),
                    ]);
                    const [dNum, dDen] = await Promise.all([rNum.json(), rDen.json()]);
                    if (!cancelled) {
                        const numName = dNum.companyName ?? num;
                        const denName = dDen.companyName ?? den;
                        setCompanyDisplay(`${numName} / ${denName}`);
                    }
                }
            } catch {
                if (!cancelled) setCompanyDisplay(mode === "S" ? symbol : expression);
            }
        }

        loadCompany();
        return () => { cancelled = true; };
    }, [mode, symbol, expression]);

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
                                />
                            </ChartErrorBoundary>
                        </div>

                    </div>
                )}


            {/* Home tab placeholder */}
            {activeTab === "home" && (
                <div style={{ flex: 1, padding: 24, color: "#94a3b8" }}>
                    <h3 style={{ color: "#e2e8f0", marginTop: 0 }}>Home</h3>
                    <p>Coming soon.</p>
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
