import React, { useEffect, useState } from 'react';
import {
    type AssetWatchlistEntry,
    fetchAssetWatchlists,
    fetchStockRankings,
    fetchEtfRankings,
} from './services/assetWatchlistApi';
import { useSortableRows } from './hooks/useSortableRows';

type Props = {
    activeWatchlistId: number | null;
    refreshToken: number;
    onOpenChart: (ticker: string) => void;
};

type Row = AssetWatchlistEntry & {
    rank: number | null;
    price1yrApprPct: number | null;
    yieldPct: number | null;
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
            fontSize: 11,
        }}>
            {rank}
        </span>
    );
}

function pct(v: number | null | undefined): string {
    return v == null ? '—' : `${v.toFixed(2)}%`;
}

export function AssetWatchlistOverview({ activeWatchlistId, refreshToken, onOpenChart }: Props) {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (activeWatchlistId == null) {
            setRows(null);
            return;
        }
        let cancelled = false;
        setLoading(true);

        Promise.all([
            fetchAssetWatchlists(),
            fetchStockRankings(100000),
            fetchEtfRankings(100000),
        ]).then(([lists, stockRanks, etfRanks]) => {
            if (cancelled) return;
            const active = lists.find(w => w.id === activeWatchlistId);
            if (!active) { setRows([]); setLoading(false); return; }

            const stockMap = new Map(stockRanks.map(r => [r.TickerSymbol, r]));
            const etfMap = new Map(etfRanks.map(r => [r.TickerSymbol, r]));

            const merged: Row[] = active.entries.map(entry => {
                if (entry.assetType.toUpperCase() === 'ETF') {
                    const r = etfMap.get(entry.tickerSymbol);
                    return {
                        ...entry,
                        rank: r?.OpportunityRank ?? null,
                        price1yrApprPct: r?.Price1yrApprPct ?? null,
                        yieldPct: r?.AverageYieldPct ?? null,
                    };
                }
                const r = stockMap.get(entry.tickerSymbol);
                return {
                    ...entry,
                    rank: r?.StockRank ?? null,
                    price1yrApprPct: r?.Price1yrApprPct ?? null,
                    yieldPct: r?.DividendYieldPct ?? null,
                };
            });

            setRows(merged);
            setLoading(false);
        });

        return () => { cancelled = true; };
    }, [activeWatchlistId, refreshToken]);

    type SortKey = 'ticker' | 'name' | 'appr' | 'yield' | 'rank';
    const { sortedRows, requestSort, sortIndicator } = useSortableRows<Row, SortKey>(
        rows ?? [],
        (row, key) => {
            switch (key) {
                case 'ticker': return row.tickerSymbol;
                case 'name': return row.companyName;
                case 'appr': return row.price1yrApprPct;
                case 'yield': return row.yieldPct;
                case 'rank': return row.rank;
            }
        },
        { key: 'rank', direction: 'desc' }
    );

    const thStyle: React.CSSProperties = {
        textAlign: 'left',
        padding: '6px 10px',
        borderBottom: '1px solid #2a2a2a',
        color: '#94a3b8',
        fontWeight: 600,
        fontSize: 12,
        whiteSpace: 'nowrap',
    };
    const tdStyle: React.CSSProperties = {
        padding: '6px 10px',
        borderBottom: '1px solid #1f1f1f',
        color: '#e2e8f0',
        whiteSpace: 'nowrap',
    };

    if (activeWatchlistId == null) {
        return <div style={{ color: '#555', marginTop: 16 }}>No watchlist selected — create one on the right.</div>;
    }

    if (loading || rows == null) {
        return <div style={{ color: '#94a3b8', marginTop: 16 }}>Loading…</div>;
    }

    if (rows.length === 0) {
        return <div style={{ color: '#555', marginTop: 16 }}>No assets — press + Stock / + ETF on the right to add some.</div>;
    }

    const sortableThStyle: React.CSSProperties = { ...thStyle, cursor: 'pointer', userSelect: 'none' };

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16, fontSize: 13 }}>
            <thead>
                <tr>
                    <th style={thStyle}></th>
                    <th style={sortableThStyle} onClick={() => requestSort('ticker')}>Ticker{sortIndicator('ticker')}</th>
                    <th style={sortableThStyle} onClick={() => requestSort('name')}>Name{sortIndicator('name')}</th>
                    <th style={sortableThStyle} onClick={() => requestSort('appr')}>1yr Appr.{sortIndicator('appr')}</th>
                    <th style={sortableThStyle} onClick={() => requestSort('yield')}>Yield{sortIndicator('yield')}</th>
                    <th style={sortableThStyle} onClick={() => requestSort('rank')}>Rank{sortIndicator('rank')}</th>
                </tr>
            </thead>
            <tbody>
                {sortedRows.map(row => {
                    const isEtf = row.assetType.toUpperCase() === 'ETF';
                    return (
                        <tr key={row.tickerSymbol}>
                            <td style={tdStyle}>
                                <span style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: '1px 4px',
                                    borderRadius: 3,
                                    background: isEtf ? '#2d1f5e' : '#1a3a2a',
                                    color: isEtf ? '#a78bfa' : '#4ade80',
                                    letterSpacing: 0.5,
                                }}>
                                    {isEtf ? 'ETF' : 'STK'}
                                </span>
                            </td>
                            <td
                                style={{ ...tdStyle, color: '#93c5fd', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={() => onOpenChart(row.tickerSymbol)}
                                title={`Open ${row.tickerSymbol} in Chart tab`}
                            >
                                {row.tickerSymbol}
                            </td>
                            <td style={{ ...tdStyle, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.companyName}>
                                {row.companyName}
                            </td>
                            <td style={tdStyle}>{pct(row.price1yrApprPct)}</td>
                            <td style={tdStyle}>{pct(row.yieldPct)}</td>
                            <td style={tdStyle}><RankBadge rank={row.rank} /></td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
