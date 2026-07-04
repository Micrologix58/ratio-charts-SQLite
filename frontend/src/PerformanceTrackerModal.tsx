import React, { useEffect, useState } from 'react';
import { type MonthlyDividendTotal, fetchPortfolioPerformance } from './services/portfolioApi';

type Props = {
    onClose: () => void;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function money(v: number | null | undefined): string {
    return v == null ? '—' : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function niceCeil(v: number): number {
    if (v <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(v)));
    const normalized = v / magnitude;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return step * magnitude;
}

function roundedTopRectPath(x: number, y: number, w: number, h: number, r: number): string {
    if (h <= 0) return '';
    const radius = Math.min(r, w / 2, h);
    return `M ${x},${y + h} L ${x},${y + radius} Q ${x},${y} ${x + radius},${y} L ${x + w - radius},${y} Q ${x + w},${y} ${x + w},${y + radius} L ${x + w},${y + h} Z`;
}

// Single-series (Monthly Dividend Income) bar chart -- rounded top, square baseline,
// hairline recessive gridlines, per-bar hover tooltip, direct label on the max bar only.
function MonthlyBarChart({ data }: { data: MonthlyDividendTotal[] }) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    const paddingLeft = 56;
    const paddingRight = 16;
    const paddingTop = 24;
    const paddingBottom = 34;
    const barSlot = 30;
    const chartW = Math.max(280, data.length * barSlot);
    const chartH = 220;
    const width = chartW + paddingLeft + paddingRight;
    const height = chartH + paddingTop + paddingBottom;

    const maxVal = Math.max(...data.map(d => d.total), 0);
    const niceMax = niceCeil(maxVal || 1);
    const barWidth = Math.min(24, barSlot - 4);

    function yFor(v: number) { return paddingTop + chartH - (v / niceMax) * chartH; }

    const gridFractions = [0, 0.25, 0.5, 0.75, 1];
    const maxIdx = data.length ? data.reduce((best, d, i) => (d.total > data[best].total ? i : best), 0) : -1;
    const hovered = hoverIdx != null ? data[hoverIdx] : null;

    return (
        <div style={{ overflowX: 'auto' }}>
            <svg width={width} height={height} style={{ display: 'block', fontFamily: 'Arial, sans-serif' }}>
                {gridFractions.map(f => {
                    const v = niceMax * f;
                    const y = yFor(v);
                    return (
                        <g key={f}>
                            <line x1={paddingLeft} x2={width - paddingRight} y1={y} y2={y} stroke="#2a2a2a" strokeWidth={1} />
                            <text x={paddingLeft - 8} y={y + 4} fontSize={10} fill="#94a3b8" textAnchor="end">
                                {v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`}
                            </text>
                        </g>
                    );
                })}

                {data.map((d, i) => {
                    const x = paddingLeft + i * barSlot + (barSlot - barWidth) / 2;
                    const barH = (d.total / niceMax) * chartH;
                    const y = paddingTop + chartH - barH;
                    const isHover = hoverIdx === i;
                    return (
                        <g
                            key={d.monthLabel}
                            onMouseEnter={() => setHoverIdx(i)}
                            onMouseLeave={() => setHoverIdx(null)}
                            style={{ cursor: 'pointer' }}
                        >
                            <rect x={x - 2} y={paddingTop} width={barWidth + 4} height={chartH} fill="transparent" />
                            <path d={roundedTopRectPath(x, y, barWidth, barH, 4)} fill={isHover ? '#6db8ff' : '#4aa3ff'} />
                            {i === maxIdx && (
                                <text x={x + barWidth / 2} y={y - 6} fontSize={10} fill="#e2e8f0" textAnchor="middle">
                                    {money(d.total)}
                                </text>
                            )}
                            <text x={x + barWidth / 2} y={paddingTop + chartH + 16} fontSize={9} fill="#94a3b8" textAnchor="middle">
                                {MONTH_NAMES[d.month - 1]}
                            </text>
                            <text x={x + barWidth / 2} y={paddingTop + chartH + 28} fontSize={9} fill="#555" textAnchor="middle">
                                {d.year}
                            </text>
                        </g>
                    );
                })}

                {hovered && hoverIdx != null && (() => {
                    const x = paddingLeft + hoverIdx * barSlot + barSlot / 2;
                    const barH = (hovered.total / niceMax) * chartH;
                    const y = paddingTop + chartH - barH;
                    const label = `${MONTH_NAMES[hovered.month - 1]} ${hovered.year}: ${money(hovered.total)}`;
                    const boxW = label.length * 5.6 + 16;
                    const boxX = Math.min(Math.max(x - boxW / 2, paddingLeft), width - paddingRight - boxW);
                    const boxY = Math.max(y - 30, paddingTop);
                    return (
                        <g pointerEvents="none">
                            <rect x={boxX} y={boxY} width={boxW} height={20} rx={4} fill="#1e1e1e" stroke="#3a3a3a" />
                            <text x={boxX + boxW / 2} y={boxY + 14} fontSize={11} fill="#e2e8f0" textAnchor="middle">{label}</text>
                        </g>
                    );
                })()}
            </svg>
        </div>
    );
}

export function PerformanceTrackerModal({ onClose }: Props) {
    const [rows, setRows] = useState<MonthlyDividendTotal[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPortfolioPerformance().then(data => { setRows(data); setLoading(false); });
    }, []);

    const thStyle: React.CSSProperties = {
        textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #2a2a2a',
        color: '#94a3b8', fontWeight: 600, position: 'sticky', top: 0, background: '#141414', whiteSpace: 'nowrap',
    };
    const tdStyle: React.CSSProperties = {
        padding: '5px 10px', borderBottom: '1px solid #1f1f1f', color: '#e2e8f0', whiteSpace: 'nowrap',
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8,
                width: 'min(1100px, 96vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                fontFamily: 'Arial, sans-serif', fontSize: 13,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #2a2a2a' }}>
                    <h3 style={{ margin: 0, color: '#e2e8f0' }}>Performance Tracker — Dividend Income</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                {loading && <div style={{ padding: 20, color: '#94a3b8' }}>Loading…</div>}

                {!loading && rows.length === 0 && (
                    <div style={{ padding: 20, color: '#555' }}>
                        No dividend payments logged yet — use + Log Transaction to record one.
                    </div>
                )}

                {!loading && rows.length > 0 && (
                    <div style={{ display: 'flex', overflow: 'hidden', flex: 1 }}>
                        <div style={{ flex: '0 0 320px', overflow: 'auto', borderRight: '1px solid #2a2a2a' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Month</th>
                                        <th style={thStyle}>Year</th>
                                        <th style={thStyle}>Total</th>
                                        <th style={thStyle}>Annual Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => (
                                        <tr key={r.monthLabel}>
                                            <td style={tdStyle}>{MONTH_NAMES[r.month - 1]}</td>
                                            <td style={tdStyle}>{r.year}</td>
                                            <td style={tdStyle}>{money(r.total)}</td>
                                            <td style={tdStyle}>{money(r.annualTotal)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                            <MonthlyBarChart data={rows} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
