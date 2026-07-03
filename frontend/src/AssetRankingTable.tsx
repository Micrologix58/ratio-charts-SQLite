import React, { useEffect, useState } from 'react';
import {
    type EtfRankingRow,
    type StockRankingRow,
    fetchEtfRankings,
    fetchStockRankings,
    addAssetEntry,
} from './services/assetWatchlistApi';

type Props = {
    mode: 'ETF' | 'stock';
    activeWatchlistId: number | null;
    onClose: () => void;
    onAdded: () => void;
    onOpenChart: (ticker: string) => void;
};

const RANK_COLORS: Record<number, string> = {
    5: '#4ade80',
    4: '#a3e635',
    3: '#facc15',
    2: '#fb923c',
    1: '#ef4444',
};

function RankBadge({ rank }: { rank: number | null }) {
    if (rank == null) return <span style={{ color: '#555' }}>—</span>;
    return (
        <span style={{
            display: 'inline-block',
            minWidth: 20,
            textAlign: 'center',
            padding: '1px 6px',
            borderRadius: 10,
            background: RANK_COLORS[rank] ?? '#555',
            color: '#111',
            fontWeight: 700,
            fontSize: 12,
        }}>
            {rank}
        </span>
    );
}

function pct(v: number | null | undefined): string {
    return v == null ? '—' : `${v.toFixed(2)}%`;
}

function num(v: number | null | undefined, digits = 2): string {
    return v == null ? '—' : v.toFixed(digits);
}

export function AssetRankingTable({ mode, activeWatchlistId, onClose, onAdded, onOpenChart }: Props) {
    const [etfRows, setEtfRows] = useState<EtfRankingRow[]>([]);
    const [stockRows, setStockRows] = useState<StockRankingRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [addedSet, setAddedSet] = useState<Set<string>>(new Set());

    useEffect(() => {
        setLoading(true);
        if (mode === 'ETF') {
            fetchEtfRankings(100).then(rows => { setEtfRows(rows); setLoading(false); });
        } else {
            fetchStockRankings(200).then(rows => { setStockRows(rows); setLoading(false); });
        }
    }, [mode]);

    async function handleAdd(ticker: string) {
        if (!activeWatchlistId) return;
        await addAssetEntry(activeWatchlistId, ticker);
        setAddedSet(prev => new Set(prev).add(ticker));
        onAdded();
    }

    const thStyle: React.CSSProperties = {
        textAlign: 'left',
        padding: '6px 10px',
        borderBottom: '1px solid #2a2a2a',
        color: '#94a3b8',
        fontWeight: 600,
        position: 'sticky',
        top: 0,
        background: '#141414',
        whiteSpace: 'nowrap',
    };
    const tdStyle: React.CSSProperties = {
        padding: '5px 10px',
        borderBottom: '1px solid #1f1f1f',
        color: '#e2e8f0',
        whiteSpace: 'nowrap',
    };
    const nameStyle: React.CSSProperties = {
        ...tdStyle,
        maxWidth: 220,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8,
                    width: mode === 'ETF' ? 'min(1900px, 99vw)' : 'min(1200px, 96vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                    fontFamily: 'Arial, sans-serif', fontSize: 13,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #2a2a2a' }}>
                    <h3 style={{ margin: 0, color: '#e2e8f0' }}>
                        {mode === 'ETF' ? 'Top 100 ETFs' : 'Top 200 Stocks'}
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ overflow: 'auto', flex: 1 }}>
                    {loading && <div style={{ padding: 20, color: '#94a3b8' }}>Loading…</div>}

                    {!loading && mode === 'ETF' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Ticker</th>
                                    <th style={thStyle}>Fund Name</th>
                                    <th style={thStyle}>1yr Appr.</th>
                                    <th style={thStyle}>Full-Drip Return</th>
                                    <th style={thStyle}>Zero-Drip Return</th>
                                    <th style={thStyle}>Avg Yield</th>
                                    <th style={thStyle}>DRIP Score</th>
                                    <th style={thStyle}>DRIP Opportunity</th>
                                    <th style={thStyle}>Opp Rank</th>
                                    <th style={thStyle}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {etfRows.map(r => (
                                    <tr key={r.TickerSymbol}>
                                        <td
                                            style={{ ...tdStyle, color: '#93c5fd', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                                            onClick={() => { onOpenChart(r.TickerSymbol); onClose(); }}
                                            title={`Open ${r.TickerSymbol} in Chart tab`}
                                        >
                                            {r.TickerSymbol}
                                        </td>
                                        <td style={nameStyle} title={r.CompanyName}>{r.CompanyName}</td>
                                        <td style={tdStyle}>{pct(r.Price1yrApprPct)}</td>
                                        <td style={tdStyle}>{pct(r.FullDripReturnPct)}</td>
                                        <td style={tdStyle}>{pct(r.ZeroDripReturnPct)}</td>
                                        <td style={tdStyle}>{pct(r.AverageYieldPct)}</td>
                                        <td style={tdStyle}>{num(r.DripScore, 3)}</td>
                                        <td style={tdStyle}>{pct(r.DripOpportunityPct)}</td>
                                        <td style={tdStyle}><RankBadge rank={r.OpportunityRank} /></td>
                                        <td style={tdStyle}>
                                            <button
                                                onClick={() => handleAdd(r.TickerSymbol)}
                                                disabled={!activeWatchlistId || addedSet.has(r.TickerSymbol)}
                                                style={{ ...btnSmall }}
                                            >
                                                {addedSet.has(r.TickerSymbol) ? 'Added' : 'Add'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {!loading && mode === 'stock' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Ticker</th>
                                    <th style={thStyle}>Name</th>
                                    <th style={thStyle}>Sector</th>
                                    <th style={thStyle}>1yr Appr.</th>
                                    <th style={thStyle}>Div Amount</th>
                                    <th style={thStyle}>Annual Amount</th>
                                    <th style={thStyle}>Div Yield</th>
                                    <th style={thStyle}>Rank</th>
                                    <th style={thStyle}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {stockRows.map(r => (
                                    <tr key={r.TickerSymbol}>
                                        <td
                                            style={{ ...tdStyle, color: '#93c5fd', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                                            onClick={() => { onOpenChart(r.TickerSymbol); onClose(); }}
                                            title={`Open ${r.TickerSymbol} in Chart tab`}
                                        >
                                            {r.TickerSymbol}
                                        </td>
                                        <td style={nameStyle} title={r.CompanyName}>{r.CompanyName}</td>
                                        <td style={tdStyle}>{r.Sector ?? '—'}</td>
                                        <td style={tdStyle}>{pct(r.Price1yrApprPct)}</td>
                                        <td style={tdStyle}>{num(r.LastDividendAmount, 4)}</td>
                                        <td style={tdStyle}>{num(r.TrailingAnnualDividend, 4)}</td>
                                        <td style={tdStyle}>{pct(r.DividendYieldPct)}</td>
                                        <td style={tdStyle}><RankBadge rank={r.StockRank} /></td>
                                        <td style={tdStyle}>
                                            <button
                                                onClick={() => handleAdd(r.TickerSymbol)}
                                                disabled={!activeWatchlistId || addedSet.has(r.TickerSymbol)}
                                                style={{ ...btnSmall }}
                                            >
                                                {addedSet.has(r.TickerSymbol) ? 'Added' : 'Add'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {!activeWatchlistId && (
                    <div style={{ padding: '8px 14px', color: '#facc15', fontSize: 12, borderTop: '1px solid #2a2a2a' }}>
                        Select or create a watchlist to enable adding assets from this list.
                    </div>
                )}
            </div>
        </div>
    );
}

const btnSmall: React.CSSProperties = {
    background: '#1e1e1e',
    color: '#e2e8f0',
    border: '1px solid #3a3a3a',
    borderRadius: 4,
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: 11,
};
