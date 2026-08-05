import { useState } from "react";

type Slice = {
    categoryName: string;
    amountUSD: number;
    pct: number;
};

type Props = {
    slices: Slice[];
    colors: string[];
    netWorth: number;
};

// Validated (dataviz skill, dark mode, --surface #141414): 7-slot categorical
// order, worst adjacent CVD ΔE 8.4, worst normal-vision ΔE 19.3, all >=3:1 contrast.
export const ALLOCATION_COLORS = [
    "#3987e5", // blue
    "#d95926", // orange
    "#199e70", // aqua
    "#c98500", // yellow
    "#d55181", // magenta
    "#008300", // green
    "#9085e9", // violet
];

const PAGE_BG = "#0b0b0b"; // matches App.tsx root background — used as the segment-gap stroke

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSegmentPath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number): string {
    const startOuter = polarToCartesian(cx, cy, rOuter, endAngle);
    const endOuter = polarToCartesian(cx, cy, rOuter, startAngle);
    const startInner = polarToCartesian(cx, cy, rInner, endAngle);
    const endInner = polarToCartesian(cx, cy, rInner, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return [
        "M", startOuter.x, startOuter.y,
        "A", rOuter, rOuter, 0, largeArc, 0, endOuter.x, endOuter.y,
        "L", endInner.x, endInner.y,
        "A", rInner, rInner, 0, largeArc, 1, startInner.x, startInner.y,
        "Z",
    ].join(" ");
}

function formatUSD(v: number): string {
    return `$${Math.round(v).toLocaleString()}`;
}

export function AllocationDonutChart({ slices, colors, netWorth }: Props) {
    const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

    const size = 200;
    const cx = size / 2;
    const cy = size / 2;
    const rOuter = 90;
    const rInner = 55;

    let cursor = 0;
    const segments = slices.map((s, i) => {
        const startAngle = (cursor / netWorth) * 360;
        cursor += s.amountUSD;
        const endAngle = (cursor / netWorth) * 360;
        return { ...s, startAngle, endAngle, color: colors[i % colors.length] };
    });

    return (
        <div style={{ position: "relative", width: size, height: size, margin: "0 auto 8px" }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {segments.map((seg, i) => (
                    <path
                        key={seg.categoryName}
                        d={donutSegmentPath(cx, cy, rOuter, rInner, seg.startAngle, seg.endAngle)}
                        fill={seg.color}
                        stroke={PAGE_BG}
                        strokeWidth={2}
                        onMouseEnter={e => setHover({ index: i, x: e.clientX, y: e.clientY })}
                        onMouseMove={e => setHover({ index: i, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHover(null)}
                        style={{ cursor: "default" }}
                    />
                ))}
            </svg>

            <div style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", pointerEvents: "none",
            }}>
                <div style={{ color: "#94a3b8", fontSize: 11 }}>Net Worth</div>
                <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 700 }}>{formatUSD(netWorth)}</div>
            </div>

            {hover && (
                <div style={{
                    position: "fixed", left: hover.x + 14, top: hover.y + 10, zIndex: 1000,
                    background: "#1e1e1e", border: "1px solid #3a3a3a", borderRadius: 4,
                    padding: "6px 10px", fontSize: 12, color: "#e2e8f0", pointerEvents: "none",
                    whiteSpace: "nowrap",
                }}>
                    <div style={{ fontWeight: 700 }}>{segments[hover.index].categoryName}</div>
                    <div style={{ color: "#94a3b8" }}>
                        {formatUSD(segments[hover.index].amountUSD)} ({segments[hover.index].pct.toFixed(1)}%)
                    </div>
                </div>
            )}
        </div>
    );
}
