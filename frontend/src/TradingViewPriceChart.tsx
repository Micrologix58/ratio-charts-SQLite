import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    createChart,
    ColorType,
    CandlestickSeries,
    HistogramSeries,
    LineSeries,
    type IChartApi,
    type ISeriesApi,
    type Time,
} from "lightweight-charts";
import type { Annotation, ChartKey } from "./types/annotations";

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

type VolumePoint = {
    time: string;
    value: number;
    color: string;
};

type Tool = "select" | "trendline" | "rectangle" | "horizontalline";

type Props = {
    data: CandlePoint[] | RatioPoint[];
    isRatio?: boolean;
    isLineOnly?: boolean;

    height?: number;
    label?: string;
    annotations?: Annotation[];
    activeTool?: Tool;
    selectedAnnotationId?: string | null;
    onSelectAnnotation?: (id: string | null) => void;
    onCreateAnnotation?: (annotation: Annotation) => void;
    onUpdateAnnotation?: (id: string, points: [{ time: string; price: number }, { time: string; price: number }]) => void;
    watermark?: string;
    chartKey: ChartKey;
};

type OverlayLine = {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    width: number;
    dashArray?: string;
    extendLeft: boolean;
    extendRight: boolean;
};

type OverlayRect = {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    width: number;
    dashArray?: string;
};

function toLineDash(lineStyle?: string): string | undefined {
    if (lineStyle === "dashed") return "6 4";
    if (lineStyle === "dotted") return "2 4";
    return undefined;
}
function toChartTime(value: string): Time {
    const [year, month, day] = value.split("-").map(Number);
    return { year, month, day } as Time;
}

/**
 * Given two anchor points and chart bounds, compute the rendered line endpoints
 * after applying extendLeft / extendRight projection to the chart edges.
 *
 * The line equation: given (ax1,ay1)→(ax2,ay2), parametric form is
 *   P(t) = (ax1 + t*(ax2-ax1), ay1 + t*(ay2-ay1))
 * Solve for t when x = xMin (left edge) or x = xMax (right edge).
 */
function computeExtendedLine(
    ax1: number, ay1: number,
    ax2: number, ay2: number,
    extendLeft: boolean, extendRight: boolean,
    paneWidth: number,
): { lx1: number; ly1: number; lx2: number; ly2: number } {
    // If both anchors are the same x (vertical line), don't extend
    const dx = ax2 - ax1;
    const dy = ay2 - ay1;

    let lx1 = ax1, ly1 = ay1;
    let lx2 = ax2, ly2 = ay2;

    if (extendLeft && Math.abs(dx) > 0.001) {
        const t = (0 - ax1) / dx;
        lx1 = 0;
        ly1 = ay1 + t * dy;
    }
    if (extendRight && Math.abs(dx) > 0.001) {
        const t = (paneWidth - ax1) / dx;
        lx2 = paneWidth;
        ly2 = ay1 + t * dy;
    }

    return { lx1, ly1, lx2, ly2 };
}

function getPriceAtPoint(point: CandlePoint | RatioPoint): number {
    return "value" in point ? point.value : point.close;
}

function formatVolume(v: unknown): string {
    const num = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(num)) return ""; // or return "–"

    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toFixed(0);
}
export function TradingViewPriceChart({
    data,
    isRatio = false,
    isLineOnly = false,
    height = 700,
    label: _label,
    annotations = [],
    activeTool = "select",
    selectedAnnotationId = null,
    onSelectAnnotation,
    onCreateAnnotation,
    onUpdateAnnotation,
    watermark,
    chartKey,
}: Props) {

    const useLineSeries = isRatio || isLineOnly;
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    // Ref so the subscribeClick closure always has the latest onSelectAnnotation
    // without needing to re-create the chart when the prop changes.
    const onSelectAnnotationRef = useRef(onSelectAnnotation);
    useEffect(() => { onSelectAnnotationRef.current = onSelectAnnotation; }, [onSelectAnnotation]);
    // Set to true when mousedown lands on an SVG element so the chart subscribeClick
    // handler knows not to deselect — the SVG already handled it.
    const svgHandledMousedown = useRef(false);

    // OHLCV hover state — populated by subscribeCrosshairMove
    type HoverBar = {
        time: string;
        open?: number;
        high?: number;
        low?: number;
        close: number;
        volume?: number;
        change: number;      // absolute change from prev close
        changePct: number;   // % change from prev close
    };
    const [hoverBar, setHoverBar] = useState<HoverBar | null>(null);
    // Keep a ref to data so the crosshair handler always sees the latest without re-subscribing
    const dataRef = useRef(data);
    useEffect(() => { dataRef.current = data; }, [data]);

    const [overlayLines, setOverlayLines] = useState<OverlayLine[]>([]);
    const [overlayRects, setOverlayRects] = useState<OverlayRect[]>([]);
    const [chartWidth, setChartWidth] = useState(0);
    const [renderKey, setRenderKey] = useState(0);
    // Inner pane dimensions — excludes price scale (right) and time axis (bottom).
    // Used to define the SVG clip rect so extended lines don't bleed into the gutters.
    const [paneWidth, setPaneWidth] = useState(0);
    const [paneHeight, setPaneHeight] = useState(0);
    const [draftStart, setDraftStart] = useState<{ x: number; y: number } | null>(null);
    const [draftEnd, setDraftEnd] = useState<{ x: number; y: number } | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    // Endpoint drag state — stored in a ref to avoid re-renders on every mousemove pixel.
    // dragEndpoint.current is non-null only while an endpoint drag is in progress.
    type DragState = { annotationId: string; endpoint: 0 | 1; liveX: number; liveY: number };
    const dragEndpoint = useRef<DragState | null>(null);
    // Trigger a re-render when drag position changes so the SVG updates live.
    const [, setDragTick] = useState(0);

    function distance(x1: number, y1: number, x2: number, y2: number): number {
        return Math.hypot(x2 - x1, y2 - y1);
    }

    function distancePointToSegment(
        px: number,
        py: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number
    ): number {
        const dx = x2 - x1;
        const dy = y2 - y1;

        if (dx === 0 && dy === 0) {
            return distance(px, py, x1, y1);
        }

        const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
        const clampedT = Math.max(0, Math.min(1, t));

        const cx = x1 + clampedT * dx;
        const cy = y1 + clampedT * dy;

        return distance(px, py, cx, cy);
    }

    // True when (x,y) is near a rectangle's border (like a trendline's hit band) —
    // deliberately NOT "anywhere inside the box": a filled hit-area that size would
    // swallow every click/drag/pan inside a wide consolidation-area box, effectively
    // freezing chart interaction under it.
    function hitTestRectangle(x: number, y: number, rect: OverlayRect): boolean {
        const tolerance = 8;
        const left = Math.min(rect.x1, rect.x2);
        const right = Math.max(rect.x1, rect.x2);
        const top = Math.min(rect.y1, rect.y2);
        const bottom = Math.max(rect.y1, rect.y2);

        const dLeft = distancePointToSegment(x, y, left, top, left, bottom);
        const dRight = distancePointToSegment(x, y, right, top, right, bottom);
        const dTop = distancePointToSegment(x, y, left, top, right, top);
        const dBottom = distancePointToSegment(x, y, left, bottom, right, bottom);

        return Math.min(dLeft, dRight, dTop, dBottom) <= tolerance;
    }

    function hitTestAnnotation(x: number, y: number): string | null {
        const endpointRadius = 8;
        const lineTolerance = 6;

        for (let i = overlayLines.length - 1; i >= 0; i--) {
            const line = overlayLines[i];

            const d1 = distance(x, y, line.x1, line.y1);
            const d2 = distance(x, y, line.x2, line.y2);

            if (d1 <= endpointRadius || d2 <= endpointRadius) {
                return line.id;
            }

            const lineDistance = distancePointToSegment(
                x,
                y,
                line.x1,
                line.y1,
                line.x2,
                line.y2
            );

            if (lineDistance <= lineTolerance) {
                return line.id;
            }
        }

        for (let i = overlayRects.length - 1; i >= 0; i--) {
            if (hitTestRectangle(x, y, overlayRects[i])) return overlayRects[i].id;
        }

        return null;
    }

    // Returns which endpoint (0 or 1) of a selected line/rectangle is under the cursor, or null.
    function hitTestEndpoint(x: number, y: number, annotationId: string): 0 | 1 | null {
        const endpointRadius = 10; // slightly larger grab target than visual radius

        const line = overlayLines.find((l) => l.id === annotationId);
        if (line) {
            if (distance(x, y, line.x1, line.y1) <= endpointRadius) return 0;
            if (distance(x, y, line.x2, line.y2) <= endpointRadius) return 1;
            return null;
        }

        const rect = overlayRects.find((r) => r.id === annotationId);
        if (rect) {
            if (distance(x, y, rect.x1, rect.y1) <= endpointRadius) return 0;
            if (distance(x, y, rect.x2, rect.y2) <= endpointRadius) return 1;
            return null;
        }

        return null;
    }

    function screenToTimePrice(x: number, y: number) {
        if (!chartRef.current || !seriesRef.current || !data.length) return null;

        const chart = chartRef.current;
        const series = seriesRef.current;

        let nearestIndex = -1;
        let nearestDistance = Number.POSITIVE_INFINITY;

        data.forEach((point, index) => {
            const px = chart.timeScale().timeToCoordinate(toChartTime(point.time));
            if (px == null) return;

            const dist = Math.abs(px - x);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestIndex = index;
            }
        });

        if (nearestIndex < 0) return null;

        const point = data[nearestIndex];
        const time = point.time;
        // Use the true pixel-derived price rather than snapping to the nearest bar's
        // close — only the time axis is inherently bar-indexed, the price axis is continuous.
        const coordPrice = series.coordinateToPrice(y);
        const price = coordPrice != null && Number.isFinite(coordPrice) ? coordPrice : getPriceAtPoint(point);

        return { time, price };
    }
    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;

        const chart = createChart(container, {
            width: container.clientWidth,
            height,
            layout: {
                background: { type: ColorType.Solid, color: "#111111" },
                textColor: "#cccccc",
            },
            grid: {
                vertLines: { color: "#222222" },
                horzLines: { color: "#222222" },
            },
            rightPriceScale: {
                borderColor: "#444444",
            },
            timeScale: {
                borderColor: "#444444",
                timeVisible: true,
                secondsVisible: false,
            },
            crosshair: {
                vertLine: { color: "#758696", labelBackgroundColor: "#222" },
                horzLine: { color: "#758696", labelBackgroundColor: "#222" },
            },
        });

        const priceSeries = useLineSeries
            ? chart.addSeries(LineSeries, {
                color: "#4da3ff",
                lineWidth: 2,
            })
            : chart.addSeries(CandlestickSeries, {
                upColor: "#26a69a",
                downColor: "#ef5350",
                borderUpColor: "#26a69a",
                borderDownColor: "#ef5350",
                wickUpColor: "#26a69a",
                wickDownColor: "#ef5350",
            });

        chartRef.current = chart;
        seriesRef.current = priceSeries;

        // Re-render the SVG overlay whenever the visible time range changes (pan / horizontal zoom).
        // subscribeVisibleTimeRangeChange returns void in this version of lightweight-charts,
        // so we store the handler reference and call unsubscribeVisibleTimeRangeChange on cleanup.
        // Helper: read inner pane pixel dimensions from the chart API.
        // timeScale().width() = drawable pane width (excludes price scale on right).
        // container.clientHeight - timeAxis height = pane height (excludes time axis on bottom).
        // Falls back to container dimensions if the API returns 0 (chart not yet laid out).
        function updatePaneDimensions() {
            const tw = chart.timeScale().width();
            // Lightweight Charts doesn't expose timeScale().height() in all versions —
            // 34px is the default time axis height and works well as a fallback.
            const timeAxisH = 34;
            const pw = tw > 0 ? tw : container.clientWidth;
            const ph = container.clientHeight - timeAxisH;
            setPaneWidth(pw);
            setPaneHeight(ph > 0 ? ph : container.clientHeight);
        }

        const handleTimeRangeChange = () => { setRenderKey((k) => k + 1); updatePaneDimensions(); };
        chart.timeScale().subscribeVisibleTimeRangeChange(handleTimeRangeChange);

        // Also re-render on wheel events — catches vertical price-scale zoom which
        // does not fire the time range subscription
        const handleWheel = () => { setRenderKey((k) => k + 1); updatePaneDimensions(); };
        container.addEventListener("wheel", handleWheel, { passive: true });

        // Clicking the chart background (not an SVG line) deselects the current annotation.
        // We use the chart's own click subscription so it fires through the Lightweight Charts
        // canvas layer, which the SVG overlay doesn't cover in select mode.
        // svgHandledMousedown guards against the chart click firing after an SVG line click.
        // OHLCV hover info bar
        chart.subscribeCrosshairMove((param) => {
            try {
                if (!param.time || !param.seriesData || !seriesRef.current) {
                    setHoverBar(null);
                    return;
                }

                const series = seriesRef.current as any;
                const point = param.seriesData.get(series);
                if (!point) {
                    setHoverBar(null);
                    return;
                }

                const currentData = dataRef.current;
                if (!currentData || currentData.length === 0) {
                    setHoverBar(null);
                    return;
                }

                const timeStr =
                    typeof param.time === "object"
                        ? `${param.time.year}-${String(param.time.month).padStart(2, "0")}-${String(param.time.day).padStart(2, "0")}`
                        : String(param.time);

                // Try exact time match first
                let idx = currentData.findIndex((d) => d.time === timeStr);

                // If that fails (e.g., differing timestamps), fall back to nearest by time
                if (idx < 0) {
                    let bestIdx = -1;
                    let bestDiff = Number.POSITIVE_INFINITY;
                    for (let i = 0; i < currentData.length; i++) {
                        const d = currentData[i];
                        const diff = Math.abs(new Date(d.time).getTime() - new Date(timeStr).getTime());
                        if (!Number.isFinite(diff)) continue;
                        if (diff < bestDiff) {
                            bestDiff = diff;
                            bestIdx = i;
                        }
                    }
                    idx = bestIdx;
                }

                if (idx < 0) {
                    setHoverBar(null);
                    return;
                }

                const rawBar = currentData[idx];
                const prevBar = idx > 0 ? currentData[idx - 1] : null;

                const close =
                    "value" in point ? point.value : "close" in point ? point.close : getPriceAtPoint(rawBar);
                const prevClose = prevBar ? getPriceAtPoint(prevBar) : null;

                const change = prevClose != null ? close - prevClose : 0;
                const changePct =
                    prevClose != null && prevClose !== 0 ? (change / prevClose) * 100 : 0;

                if ("open" in rawBar && "high" in rawBar && "low" in rawBar && "close" in rawBar) {
                    // Candlestick / OHLC source (equities, XAU, XAG single-symbol mode)
                    setHoverBar({
                        time: rawBar.time,
                        open: rawBar.open,
                        high: rawBar.high,
                        low: rawBar.low,
                        close: rawBar.close,
                        volume: rawBar.volume,
                        change,
                        changePct,
                    });
                } else {
                    // Ratio / line-only source
                    setHoverBar({
                        time: rawBar.time,
                        close,
                        change,
                        changePct,
                    });
                }
            } catch {
                // Absolutely never let an exception here kill the chart
                setHoverBar(null);
            }
        });

        chart.subscribeClick(() => {
            if (svgHandledMousedown.current) {
                svgHandledMousedown.current = false;
                return;
            }
            onSelectAnnotationRef.current?.(null);
        });

        if (!useLineSeries) {
            const volumeSeries = chart.addSeries(HistogramSeries, {
                priceFormat: { type: "volume" },
                priceScaleId: "volume",
                color: "#26a69a",
            });

            chart.priceScale("volume").applyOptions({
                scaleMargins: {
                    top: 0.75,
                    bottom: 0,
                },
            });

            chart.priceScale("right").applyOptions({
                scaleMargins: {
                    top: 0.05,
                    bottom: 0.25,
                },
            });

            volumeSeriesRef.current = volumeSeries;
        } else {
            volumeSeriesRef.current = null;
        }

        chart.timeScale().fitContent();
        setChartWidth(container.clientWidth);
        // Initial pane dimension read — done after fitContent so the time scale is laid out
        setTimeout(updatePaneDimensions, 0);

        const handleResize = () => {
            if (!containerRef.current || !chartRef.current) return;

            const width = containerRef.current.clientWidth;

            chartRef.current.applyOptions({ width });
            setChartWidth(width);
            updatePaneDimensions();
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            container.removeEventListener("wheel", handleWheel);
            // chart.remove() destroys all internal subscriptions including handleTimeRangeChange
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
            volumeSeriesRef.current = null;
        };
    }, [height, isRatio, isLineOnly]);

    // Clear hover bar when data changes (e.g. symbol/timeframe switch)
    useEffect(() => { setHoverBar(null); }, [data]);

    useEffect(() => {
        if (!seriesRef.current || !chartRef.current) return;

        if (useLineSeries) {
            const lineData: RatioPoint[] =
                isRatio
                    ? (data as RatioPoint[])
                    : (data as CandlePoint[]).map((d) => ({
                        time: d.time,
                        value: d.close,
                    }));

            (seriesRef.current as ISeriesApi<"Line">).setData(lineData);

            if (volumeSeriesRef.current) {
                volumeSeriesRef.current.setData([]);
            }
        } else {
            const candles = data as CandlePoint[];
            (seriesRef.current as ISeriesApi<"Candlestick">).setData(candles);

            if (volumeSeriesRef.current) {
                const volumeData: VolumePoint[] = candles
                    .filter((d) => d.volume != null)
                    .map((d) => ({
                        time: d.time,
                        value: Number(d.volume),
                        color: d.close >= d.open ? "#26a69a" : "#ef5350",
                    }))
                    .filter((d) => Number.isFinite(d.value));

                volumeSeriesRef.current.setData(volumeData);
            }
        }

        chartRef.current.timeScale().fitContent();
    }, [data, isRatio, isLineOnly]);

    const overlayDeps = useMemo(
        () => ({
            annotations,
            data,
            isRatio,
            chartWidth,
            renderKey,
            paneWidth,
        }),
        [annotations, data, isRatio, chartWidth, renderKey, paneWidth]
    );

    useEffect(() => {
        if (!chartRef.current || !seriesRef.current || !containerRef.current) {
            setOverlayLines([]);
            setOverlayRects([]);
            return;
        }

        if (!data || data.length === 0) {
            setOverlayLines([]);
            setOverlayRects([]);
            return;
        }

        const chart = chartRef.current;
        const series = seriesRef.current;

        const lines: OverlayLine[] = [];
        const rects: OverlayRect[] = [];

        for (const ann of overlayDeps.annotations) {
            if (ann.type !== "trendline" && ann.type !== "rectangle" && ann.type !== "horizontalline") continue;

            if (ann.type === "horizontalline") {
                const y = series.priceToCoordinate(ann.points[0].price);
                if (y == null || !Number.isFinite(y)) continue;

                lines.push({
                    id: ann.id,
                    x1: 0,
                    y1: y,
                    x2: paneWidth,
                    y2: y,
                    color: ann.style?.color || "#4aa3ff",
                    width: ann.style?.lineWidth || 2,
                    dashArray: toLineDash(ann.style?.lineStyle),
                    extendLeft: false,
                    extendRight: false,
                });
                continue;
            }

            const [p1, p2] = ann.points;

            const x1 = chart.timeScale().timeToCoordinate(toChartTime(p1.time));
            const x2 = chart.timeScale().timeToCoordinate(toChartTime(p2.time));
            const y1 = series.priceToCoordinate(p1.price);
            const y2 = series.priceToCoordinate(p2.price);

            if (
                x1 == null ||
                x2 == null ||
                y1 == null ||
                y2 == null ||
                !Number.isFinite(x1) ||
                !Number.isFinite(x2) ||
                !Number.isFinite(y1) ||
                !Number.isFinite(y2)
            ) {
                continue;
            }

            if (ann.type === "trendline") {
                lines.push({
                    id: ann.id,
                    x1,
                    y1,
                    x2,
                    y2,
                    color: ann.style?.color || "#4aa3ff",
                    width: ann.style?.lineWidth || 2,
                    dashArray: toLineDash(ann.style?.lineStyle),
                    extendLeft: ann.style?.extendLeft ?? false,
                    extendRight: ann.style?.extendRight ?? false,
                });
            } else {
                rects.push({
                    id: ann.id,
                    x1,
                    y1,
                    x2,
                    y2,
                    color: ann.style?.color || "#4aa3ff",
                    width: ann.style?.lineWidth || 2,
                    dashArray: toLineDash(ann.style?.lineStyle),
                });
            }
        }

        setOverlayLines(lines);
        setOverlayRects(rects);
    }, [overlayDeps]);

    useEffect(() => {
        if (activeTool !== "trendline" && activeTool !== "rectangle") {
            setDraftStart(null);
            setDraftEnd(null);
        }
    }, [activeTool]);

    const volumeText =
        hoverBar && hoverBar.volume != null ? formatVolume(hoverBar.volume) : "";

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                height,
            }}
        >
            <div
                ref={containerRef}
                style={{
                    width: "100%",
                    height,
                    position: "relative",
                    zIndex: 1,
                }}
            />

            {hoverBar && (
                <div
                    style={{
                        position: "absolute",
                        top: 6,
                        left: 8,
                        zIndex: 30,
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        pointerEvents: "none",
                        userSelect: "none",
                        fontSize: 12,
                        fontFamily: "Arial, sans-serif",
                        color: "#ccc",
                        background: "rgba(17,17,17,0.75)",
                        padding: "3px 10px",
                        borderRadius: 4,
                    }}
                >
                    <span style={{ color: "#888", marginRight: 2 }}>{hoverBar.time}</span>

                    {hoverBar.open != null && (
                        <>
                            <span>O <strong style={{ color: "#e2e8f0" }}>{hoverBar.open.toFixed(2)}</strong></span>
                            <span>H <strong style={{ color: "#26a69a" }}>{hoverBar.high!.toFixed(2)}</strong></span>
                            <span>L <strong style={{ color: "#ef5350" }}>{hoverBar.low!.toFixed(2)}</strong></span>
                            <span>C <strong style={{ color: "#e2e8f0" }}>{hoverBar.close.toFixed(2)}</strong></span>

                            {volumeText && (
                                <span>
                                    V <strong style={{ color: "#94a3b8" }}>{volumeText}</strong>
                                </span>
                            )}
                        </>
                    )}

                    {hoverBar.open == null && (
                        <span>
                            Value <strong style={{ color: "#e2e8f0" }}>{hoverBar.close.toFixed(4)}</strong>
                        </span>
                    )}

                    <span
                        style={{
                            color: hoverBar.change >= 0 ? "#26a69a" : "#ef5350",
                            fontWeight: "bold",
                        }}
                    >
                        {hoverBar.change >= 0 ? "+" : ""}
                        {hoverBar.change.toFixed(2)} ({hoverBar.change >= 0 ? "+" : ""}
                        {hoverBar.changePct.toFixed(2)}%)
                    </span>
                </div>
            )}

            <svg
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    // Capture the full SVG surface only when drawing or mid-drag.
                    // Otherwise pass events through to the chart (pan/zoom/scroll).
                    // Individual line/circle elements have their own pointerEvents:auto
                    // so click-to-select and endpoint dragging still work in select mode.
                    pointerEvents: (activeTool === "trendline" || activeTool === "rectangle" || activeTool === "horizontalline" || !!dragEndpoint.current) ? "auto" : "none",
                    overflow: "visible",
                    zIndex: 20,
                    cursor: dragEndpoint.current ? "crosshair" : "default",
                }}
                onMouseDown={(e) => {
                    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;

                    // Tell subscribeClick not to deselect — SVG is handling this click
                    svgHandledMousedown.current = true;

                    if (activeTool === "select") {
                        // If a line is already selected, check if we clicked an endpoint
                        if (selectedAnnotationId) {
                            const ep = hitTestEndpoint(x, y, selectedAnnotationId);
                            if (ep !== null) {
                                // Start endpoint drag
                                dragEndpoint.current = {
                                    annotationId: selectedAnnotationId,
                                    endpoint: ep,
                                    liveX: x,
                                    liveY: y,
                                };
                                setDragTick((t) => t + 1); // force SVG pointerEvents to switch to "auto"
                                e.stopPropagation();
                                return;
                            }
                        }
                        // Otherwise hit-test for a new selection
                        const hitId = hitTestAnnotation(x, y);
                        onSelectAnnotation?.(hitId);
                        return;
                    }

                    if (activeTool === "horizontalline") {
                        const anchor = screenToTimePrice(x, y);
                        if (anchor && onCreateAnnotation) {
                            const now = new Date().toISOString();
                            onCreateAnnotation({
                                id: `ann-${Date.now()}`,
                                type: "horizontalline",
                                chartKey,
                                points: [anchor, anchor],
                                style: {
                                    color: "#4aa3ff",
                                    lineWidth: 2,
                                    lineStyle: "solid",
                                },
                                locked: false,
                                createdAt: now,
                                updatedAt: now,
                            });
                        }
                        return;
                    }

                    if (activeTool !== "trendline" && activeTool !== "rectangle") return;

                    setDraftStart({ x, y });
                    setDraftEnd({ x, y });
                    setIsDrawing(true);
                }}
                onMouseMove={(e) => {
                    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;

                    // Endpoint drag in progress
                    if (dragEndpoint.current) {
                        dragEndpoint.current.liveX = x;
                        dragEndpoint.current.liveY = y;
                        setDragTick((t) => t + 1); // trigger re-render for live preview
                        return;
                    }

                    if ((activeTool !== "trendline" && activeTool !== "rectangle") || !isDrawing || !draftStart) return;
                    setDraftEnd({ x, y });
                }}
                onMouseUp={(e) => {
                    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;

                    // Commit endpoint drag
                    if (dragEndpoint.current) {
                        const { annotationId, endpoint } = dragEndpoint.current;
                        dragEndpoint.current = null;
                        setDragTick((t) => t + 1);

                        const newAnchor = screenToTimePrice(x, y);
                        if (!newAnchor || !onUpdateAnnotation) return;

                        // Find the annotation and build updated points
                        const ann = annotations.find((a) => a.id === annotationId);
                        if (!ann) return;

                        const [p0, p1] = ann.points;

                        // Horizontal lines have no meaningful per-endpoint time — dragging either
                        // endpoint moves the whole line to the new price, keeping both points' times.
                        if (ann.type === "horizontalline") {
                            onUpdateAnnotation(annotationId, [
                                { time: p0.time, price: newAnchor.price },
                                { time: p1.time, price: newAnchor.price },
                            ]);
                            return;
                        }

                        const updatedPoints: [{ time: string; price: number }, { time: string; price: number }] =
                            endpoint === 0
                                ? [newAnchor, p1]
                                : [p0, newAnchor];

                        onUpdateAnnotation(annotationId, updatedPoints);
                        return;
                    }

                    if ((activeTool !== "trendline" && activeTool !== "rectangle") || !isDrawing || !draftStart) return;

                    setDraftEnd({ x, y });
                    setIsDrawing(false);

                    const p1 = screenToTimePrice(draftStart.x, draftStart.y);
                    const p2 = screenToTimePrice(x, y);

                    if (!p1 || !p2 || !onCreateAnnotation) {
                        setDraftStart(null);
                        setDraftEnd(null);
                        return;
                    }

                    const now = new Date().toISOString();

                    const annotation: Annotation =
                        activeTool === "rectangle"
                            ? {
                                id: `ann-${Date.now()}`,
                                type: "rectangle",
                                chartKey,
                                points: [p1, p2],
                                style: {
                                    color: "#4aa3ff",
                                    lineWidth: 2,
                                    lineStyle: "solid",
                                },
                                locked: false,
                                createdAt: now,
                                updatedAt: now,
                            }
                            : {
                                id: `ann-${Date.now()}`,
                                type: "trendline",
                                chartKey,
                                points: [p1, p2],
                                style: {
                                    color: "#4aa3ff",
                                    lineWidth: 2,
                                    lineStyle: "solid",
                                    extendLeft: false,
                                    extendRight: false,
                                },
                                locked: false,
                                createdAt: now,
                                updatedAt: now,
                            };

                    onCreateAnnotation(annotation);
                    setDraftStart(null);
                    setDraftEnd(null);
                }}
            >
                {/* Clip path that matches the inner chart pane — excludes price scale and time axis */}
                {paneWidth > 0 && paneHeight > 0 && (
                    <defs>
                        <clipPath id="annotation-clip">
                            <rect x={0} y={0} width={paneWidth} height={paneHeight} />
                        </clipPath>
                    </defs>
                )}

                {overlayLines.map((line) => {
                    const isSelected = line.id === selectedAnnotationId;

                    // If this line's endpoint is being dragged, substitute the live pixel position.
                    // Anchor coords (for circles and hit-testing)
                    const drag = dragEndpoint.current;
                    const isDraggingThis = drag && drag.annotationId === line.id;
                    const ax1 = isDraggingThis && drag.endpoint === 0 ? drag.liveX : line.x1;
                    const ay1 = isDraggingThis && drag.endpoint === 0 ? drag.liveY : line.y1;
                    const ax2 = isDraggingThis && drag.endpoint === 1 ? drag.liveX : line.x2;
                    const ay2 = isDraggingThis && drag.endpoint === 1 ? drag.liveY : line.y2;

                    // Extend-projected endpoints for the rendered line stroke.
                    // When dragging we don't apply extension so the preview stays clean.
                    const extendLeft  = !isDraggingThis && line.extendLeft;
                    const extendRight = !isDraggingThis && line.extendRight;
                    const { lx1, ly1, lx2, ly2 } = computeExtendedLine(
                        ax1, ay1, ax2, ay2,
                        extendLeft, extendRight,
                        paneWidth,
                    );

                    return (
                        <React.Fragment key={line.id}>
                            {/* Invisible wide stroke for easier line hit-testing (uses anchor coords) */}
                            <line
                                x1={ax1}
                                y1={ay1}
                                x2={ax2}
                                y2={ay2}
                                stroke="transparent"
                                strokeWidth={16}
                                style={{ pointerEvents: "auto", cursor: "pointer" }}
                            />
                            {/* Visible stroke — uses projected endpoints when extended, clipped to pane */}
                            <line
                                x1={lx1}
                                y1={ly1}
                                x2={lx2}
                                y2={ly2}
                                stroke={line.color}
                                strokeWidth={isSelected ? line.width + 2 : line.width}
                                strokeDasharray={line.dashArray}
                                strokeLinecap="round"
                                opacity={isSelected ? 1 : 0.9}
                                clipPath={paneWidth > 0 ? "url(#annotation-clip)" : undefined}
                                style={{ pointerEvents: "none" }}
                            />
                            {/* Anchor circles always at original endpoints */}
                            <circle
                                cx={ax1}
                                cy={ay1}
                                r={isSelected ? 7 : 5}
                                fill={isDraggingThis && drag.endpoint === 0 ? "#22c55e" : line.color}
                                stroke={isSelected ? "#ffffff" : "none"}
                                strokeWidth={isSelected ? 2 : 0}
                                style={{ pointerEvents: "auto", cursor: isSelected ? "grab" : "pointer" }}
                            />
                            <circle
                                cx={ax2}
                                cy={ay2}
                                r={isSelected ? 7 : 5}
                                fill={isDraggingThis && drag.endpoint === 1 ? "#22c55e" : line.color}
                                stroke={isSelected ? "#ffffff" : "none"}
                                strokeWidth={isSelected ? 2 : 0}
                                style={{ pointerEvents: "auto", cursor: isSelected ? "grab" : "pointer" }}
                            />
                        </React.Fragment>
                    );
                })}

                {overlayRects.map((rectAnn) => {
                    const isSelected = rectAnn.id === selectedAnnotationId;

                    const drag = dragEndpoint.current;
                    const isDraggingThis = drag && drag.annotationId === rectAnn.id;
                    const ax1 = isDraggingThis && drag.endpoint === 0 ? drag.liveX : rectAnn.x1;
                    const ay1 = isDraggingThis && drag.endpoint === 0 ? drag.liveY : rectAnn.y1;
                    const ax2 = isDraggingThis && drag.endpoint === 1 ? drag.liveX : rectAnn.x2;
                    const ay2 = isDraggingThis && drag.endpoint === 1 ? drag.liveY : rectAnn.y2;

                    const rx = Math.min(ax1, ax2);
                    const ry = Math.min(ay1, ay2);
                    const rw = Math.abs(ax2 - ax1);
                    const rh = Math.abs(ay2 - ay1);

                    return (
                        <React.Fragment key={rectAnn.id}>
                            {/* Fill wash — purely visual, never captures pointer events so the
                                chart underneath stays pannable/zoomable/clickable through the interior. */}
                            <rect
                                x={rx}
                                y={ry}
                                width={rw}
                                height={rh}
                                fill={rectAnn.color}
                                fillOpacity={0.12}
                                clipPath={paneWidth > 0 ? "url(#annotation-clip)" : undefined}
                                style={{ pointerEvents: "none" }}
                            />
                            {/* Invisible wide border for easier hit-testing (mirrors the trendline's wide stroke) */}
                            <rect
                                x={rx}
                                y={ry}
                                width={rw}
                                height={rh}
                                fill="none"
                                stroke="transparent"
                                strokeWidth={16}
                                style={{ pointerEvents: "auto", cursor: "pointer" }}
                            />
                            {/* Visible border stroke */}
                            <rect
                                x={rx}
                                y={ry}
                                width={rw}
                                height={rh}
                                fill="none"
                                stroke={rectAnn.color}
                                strokeWidth={isSelected ? rectAnn.width + 1 : rectAnn.width}
                                strokeDasharray={rectAnn.dashArray}
                                opacity={isSelected ? 1 : 0.9}
                                clipPath={paneWidth > 0 ? "url(#annotation-clip)" : undefined}
                                style={{ pointerEvents: "none" }}
                            />
                            {/* Corner handles at the original anchor points */}
                            <circle
                                cx={ax1}
                                cy={ay1}
                                r={isSelected ? 7 : 5}
                                fill={isDraggingThis && drag.endpoint === 0 ? "#22c55e" : rectAnn.color}
                                stroke={isSelected ? "#ffffff" : "none"}
                                strokeWidth={isSelected ? 2 : 0}
                                style={{ pointerEvents: "auto", cursor: isSelected ? "grab" : "pointer" }}
                            />
                            <circle
                                cx={ax2}
                                cy={ay2}
                                r={isSelected ? 7 : 5}
                                fill={isDraggingThis && drag.endpoint === 1 ? "#22c55e" : rectAnn.color}
                                stroke={isSelected ? "#ffffff" : "none"}
                                strokeWidth={isSelected ? 2 : 0}
                                style={{ pointerEvents: "auto", cursor: isSelected ? "grab" : "pointer" }}
                            />
                        </React.Fragment>
                    );
                })}

                {/* Centered watermark — renders behind all annotation lines */}
                {watermark && (
                    <text
                        x="50%"
                        y="50%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{
                            fill: "rgba(255,255,255,0.06)",
                            fontSize: "clamp(24px, 4vw, 56px)",
                            fontFamily: "Arial, sans-serif",
                            fontWeight: "bold",
                            letterSpacing: "0.08em",
                            pointerEvents: "none",
                            userSelect: "none",
                        }}
                    >
                        {watermark}
                    </text>
                )}

                {draftStart && draftEnd && activeTool === "rectangle" && (
                    <React.Fragment>
                        <rect
                            x={Math.min(draftStart.x, draftEnd.x)}
                            y={Math.min(draftStart.y, draftEnd.y)}
                            width={Math.abs(draftEnd.x - draftStart.x)}
                            height={Math.abs(draftEnd.y - draftStart.y)}
                            fill="#22c55e"
                            fillOpacity={0.12}
                            stroke="#22c55e"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            clipPath={paneWidth > 0 ? "url(#annotation-clip)" : undefined}
                        />
                        <circle cx={draftStart.x} cy={draftStart.y} r={5} fill="#22c55e" />
                        <circle cx={draftEnd.x} cy={draftEnd.y} r={5} fill="#22c55e" />
                    </React.Fragment>
                )}

                {draftStart && draftEnd && activeTool === "trendline" && (
                    <React.Fragment>
                        <line
                            x1={draftStart.x}
                            y1={draftStart.y}
                            x2={draftEnd.x}
                            y2={draftEnd.y}
                            stroke="#22c55e"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            strokeLinecap="round"
                            clipPath={paneWidth > 0 ? "url(#annotation-clip)" : undefined}
                        />
                        <circle cx={draftStart.x} cy={draftStart.y} r={5} fill="#22c55e" />
                        <circle cx={draftEnd.x} cy={draftEnd.y} r={5} fill="#22c55e" />
                    </React.Fragment>
                )}
            </svg>
        </div>
    );
}
