import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    type AssetWatchlist,
    type AssetInfo,
    fetchAssetWatchlists,
    createAssetWatchlist,
    renameAssetWatchlist,
    deleteAssetWatchlist,
    addAssetEntry,
    removeAssetEntry,
    fetchAssetUniverse,
} from './services/assetWatchlistApi';

type Props = {
    activeWatchlistId: number | null;
    onActiveWatchlistChange: (id: number | null) => void;
    onOpenRanking: (mode: 'ETF' | 'stock') => void;
    onOpenChart: (ticker: string) => void;
    refreshToken: number;
    onWatchlistDataChanged?: () => void;
};

const PANEL_W = 320;

const btnStyle: React.CSSProperties = {
    background: '#1e1e1e',
    color: '#e2e8f0',
    border: '1px solid #3a3a3a',
    borderRadius: 4,
    padding: '3px 8px',
    cursor: 'pointer',
    fontSize: 13,
};

const inputStyle: React.CSSProperties = {
    flex: 1,
    background: '#111',
    color: '#e2e8f0',
    border: '1px solid #3a3a3a',
    borderRadius: 4,
    padding: '3px 6px',
    fontSize: 12,
    outline: 'none',
};

// ── Asset search dropdown (reused for both + Stock and + ETF) ──────────────
function AssetSearch({
    assetType,
    onSelect,
    onClose,
}: {
    assetType: 'stock' | 'ETF';
    onSelect: (symbol: string) => void;
    onClose: () => void;
}) {
    const [search, setSearch] = useState('');
    const [universe, setUniverse] = useState<AssetInfo[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchAssetUniverse(assetType).then(setUniverse);
    }, [assetType]);

    useEffect(() => { setTimeout(() => inputRef.current?.focus(), 40); }, []);

    const filtered = universe.filter(t =>
        t.TickerSymbol.toLowerCase().includes(search.toLowerCase()) ||
        t.CompanyName.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 100);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 260 }}>
            <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && onClose()}
                placeholder={`Search ${assetType === 'ETF' ? 'ETF' : 'stock'} or name…`}
                style={{ ...inputStyle, margin: '6px 6px 2px' }}
            />
            <div style={{ overflowY: 'auto', flex: 1 }}>
                {filtered.map(t => (
                    <div
                        key={t.TickerSymbol}
                        onClick={() => onSelect(t.TickerSymbol)}
                        style={{ padding: '5px 10px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'baseline' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#2a3a4a')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                        <strong style={{ minWidth: 52, color: '#93c5fd', fontSize: 12 }}>{t.TickerSymbol}</strong>
                        <span style={{ color: '#94a3b8', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.CompanyName}
                        </span>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div style={{ padding: '8px 10px', color: '#555', fontSize: 12 }}>No matches</div>
                )}
            </div>
        </div>
    );
}

// ── Main panel ───────────────────────────────────────────────────────────────
export function AssetWatchlistPanel({ activeWatchlistId, onActiveWatchlistChange, onOpenRanking, onOpenChart, refreshToken, onWatchlistDataChanged }: Props) {
    const [watchlists, setWatchlists] = useState<AssetWatchlist[]>([]);
    const [addMode, setAddMode] = useState<'stock' | 'ETF' | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [renamingId, setRenamingId] = useState<number | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [showNewInput, setShowNewInput] = useState(false);
    const [newName, setNewName] = useState('');

    const activeList = watchlists.find(w => w.id === activeWatchlistId) ?? null;

    const refresh = useCallback(() => {
        fetchAssetWatchlists().then(data => {
            setWatchlists(data);
            if (data.length === 0) {
                onActiveWatchlistChange(null);
            } else if (!data.some(w => w.id === activeWatchlistId)) {
                onActiveWatchlistChange(data[0].id);
            }
        });
    }, [activeWatchlistId, onActiveWatchlistChange]);

    useEffect(() => { refresh(); }, [refresh, refreshToken]);

    // Close add dropdown on outside click
    useEffect(() => {
        if (!addMode) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setAddMode(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [addMode]);

    async function handleAddAsset(symbol: string) {
        if (!activeWatchlistId) return;
        setAddMode(null);
        const updated = await addAssetEntry(activeWatchlistId, symbol);
        setWatchlists(prev => prev.map(w => w.id === activeWatchlistId ? updated : w));
        onWatchlistDataChanged?.();
    }

    async function handleRemoveEntry(symbol: string) {
        if (!activeWatchlistId) return;
        const updated = await removeAssetEntry(activeWatchlistId, symbol);
        setWatchlists(prev => prev.map(w => w.id === activeWatchlistId ? updated : w));
        onWatchlistDataChanged?.();
    }

    async function handleCreateWatchlist() {
        const name = newName.trim() || `Watchlist ${watchlists.length + 1}`;
        const wl = await createAssetWatchlist(name);
        setWatchlists(prev => [...prev, wl]);
        onActiveWatchlistChange(wl.id);
        setShowNewInput(false);
        setNewName('');
    }

    async function handleDeleteWatchlist(id: number) {
        await deleteAssetWatchlist(id);
        setWatchlists(prev => {
            const next = prev.filter(w => w.id !== id);
            if (activeWatchlistId === id) onActiveWatchlistChange(next[0]?.id ?? null);
            return next;
        });
    }

    async function handleRenameCommit() {
        if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
        const updated = await renameAssetWatchlist(renamingId, renameValue.trim());
        setWatchlists(prev => prev.map(w => w.id === renamingId ? { ...w, name: updated.name } : w));
        setRenamingId(null);
    }

    return (
        <div
            style={{
                width: PANEL_W,
                minWidth: PANEL_W,
                background: '#141414',
                borderLeft: '1px solid #2a2a2a',
                display: 'flex',
                flexDirection: 'column',
                alignSelf: 'stretch',
                fontSize: 13,
                fontFamily: 'Arial, sans-serif',
            }}
        >
            {/* ── Header: watchlist selector ── */}
            <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid #2a2a2a' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <select
                        value={activeWatchlistId ?? ''}
                        onChange={e => onActiveWatchlistChange(e.target.value ? Number(e.target.value) : null)}
                        style={{ flex: 1, background: '#1e1e1e', color: '#e2e8f0', border: '1px solid #3a3a3a', borderRadius: 4, padding: '3px 6px', fontSize: 13, cursor: 'pointer' }}
                    >
                        {watchlists.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        {watchlists.length === 0 && <option value="">No watchlists</option>}
                    </select>
                    <button onClick={() => setShowNewInput(v => !v)} title="New watchlist" style={btnStyle}>+</button>
                    {activeWatchlistId != null && (
                        <button onClick={() => handleDeleteWatchlist(activeWatchlistId)} title="Delete watchlist" style={{ ...btnStyle, color: '#ef5350' }}>✕</button>
                    )}
                </div>

                {showNewInput && (
                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleCreateWatchlist(); if (e.key === 'Escape') setShowNewInput(false); }}
                            placeholder="Watchlist name…" style={inputStyle} />
                        <button onClick={handleCreateWatchlist} style={btnStyle}>✓</button>
                    </div>
                )}

                {activeList && renamingId === activeList.id ? (
                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameCommit(); if (e.key === 'Escape') setRenamingId(null); }}
                            style={inputStyle} />
                        <button onClick={handleRenameCommit} style={btnStyle}>✓</button>
                    </div>
                ) : activeList ? (
                    <div onDoubleClick={() => { setRenamingId(activeList.id); setRenameValue(activeList.name); }}
                        title="Double-click to rename"
                        style={{ color: '#94a3b8', fontSize: 11, paddingLeft: 2, cursor: 'text', marginBottom: 2 }}>
                        {activeList.name}
                    </div>
                ) : null}
            </div>

            {/* ── Entry list ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {(activeList?.entries ?? []).length === 0 && (
                    <div style={{ color: '#555', padding: '12px 10px', fontSize: 12 }}>No assets — press + Stock / + ETF to add</div>
                )}
                {(activeList?.entries ?? []).map(entry => {
                    const isEtf = entry.assetType.toUpperCase() === 'ETF';
                    return (
                        <div
                            key={entry.tickerSymbol}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '5px 10px',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                                <span style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: '1px 4px',
                                    borderRadius: 3,
                                    background: isEtf ? '#2d1f5e' : '#1a3a2a',
                                    color: isEtf ? '#a78bfa' : '#4ade80',
                                    letterSpacing: 0.5,
                                    flexShrink: 0,
                                }}>
                                    {isEtf ? 'ETF' : 'STK'}
                                </span>
                                <span
                                    onClick={() => onOpenChart(entry.tickerSymbol)}
                                    title={`Open ${entry.tickerSymbol} in Chart tab`}
                                    style={{ color: '#93c5fd', fontSize: 13, flexShrink: 0, cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                    {entry.tickerSymbol}
                                </span>
                                <span style={{ color: '#94a3b8', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {entry.companyName}
                                </span>
                            </div>
                            <button
                                onClick={() => handleRemoveEntry(entry.tickerSymbol)}
                                title="Remove"
                                className="remove-btn"
                                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
                            >✕</button>
                        </div>
                    );
                })}
            </div>

            {/* ── Footer: add + list buttons ── */}
            <div style={{ borderTop: '1px solid #2a2a2a', padding: '6px 8px', position: 'relative' }} ref={dropdownRef}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    <button
                        onClick={() => setAddMode(m => m === 'stock' ? null : 'stock')}
                        disabled={!activeWatchlistId}
                        style={{ ...btnStyle, flex: 1, fontSize: 12 }}
                    >
                        + Stock
                    </button>
                    <button
                        onClick={() => setAddMode(m => m === 'ETF' ? null : 'ETF')}
                        disabled={!activeWatchlistId}
                        style={{ ...btnStyle, flex: 1, fontSize: 12, color: '#a78bfa' }}
                    >
                        + ETF
                    </button>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => onOpenRanking('stock')} title="Top 200 Stocks" style={{ ...btnStyle, flex: 1, fontSize: 12 }}>
                        +S List
                    </button>
                    <button onClick={() => onOpenRanking('ETF')} title="Top 100 ETFs" style={{ ...btnStyle, flex: 1, fontSize: 12, color: '#a78bfa' }}>
                        +L List
                    </button>
                </div>

                {addMode && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 4, zIndex: 100 }}>
                        <AssetSearch
                            assetType={addMode}
                            onSelect={handleAddAsset}
                            onClose={() => setAddMode(null)}
                        />
                    </div>
                )}
            </div>

            <style>{`
                .remove-btn { opacity: 0 !important; transition: opacity 0.15s; }
                div:hover > .remove-btn { opacity: 1 !important; }
            `}</style>
        </div>
    );
}
