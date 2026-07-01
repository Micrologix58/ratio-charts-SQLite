import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    type Watchlist,
    type WatchlistEntry,
    type TickerInfo,
    entryKey,
    fetchWatchlists,
    createWatchlist,
    renameWatchlist,
    deleteWatchlist,
    addEntry,
    removeEntry,
    fetchAllTickers,
} from './services/watchlistApi';

type Props = {
    activeSymbol: string;       // current single symbol
    activeExpression: string;   // current ratio expression e.g. "GLD/SPY"
    activeMode: 'S' | 'R';
    onSelectEntry: (entry: WatchlistEntry) => void;
};

const PANEL_W = 230;

// ── Shared micro-styles ──────────────────────────────────────────────────────
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

// ── Ticker search dropdown (reused for both single + ratio picker) ────────────
function TickerSearch({
    allTickers,
    placeholder,
    onSelect,
    onClose,
}: {
    allTickers: TickerInfo[];
    placeholder: string;
    onSelect: (symbol: string) => void;
    onClose: () => void;
}) {
    const [search, setSearch] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setTimeout(() => inputRef.current?.focus(), 40); }, []);

    const filtered = allTickers.filter(t =>
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
                placeholder={placeholder}
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

// ── Main panel ────────────────────────────────────────────────────────────────
export function WatchlistPanel({ activeSymbol, activeExpression, activeMode, onSelectEntry }: Props) {
    const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [allTickers, setAllTickers] = useState<TickerInfo[]>([]);

    // Add dropdown state
    type AddStep =
        | null
        | { mode: 'S' }                         // single: show ticker search
        | { mode: 'R'; step: 1 }                // ratio step 1: pick numerator
        | { mode: 'R'; step: 2; num: string };  // ratio step 2: pick denominator

    const [addStep, setAddStep] = useState<AddStep>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Watchlist management
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [showNewInput, setShowNewInput] = useState(false);
    const [newName, setNewName] = useState('');

    // Arrow key navigation
    const [focusedIdx, setFocusedIdx] = useState(-1);

    const activeList = watchlists.find(w => w.id === activeId) ?? null;

    // Active entry key for highlighting
    const activeKey = activeMode === 'S' ? activeSymbol : activeExpression;

    useEffect(() => {
        fetchWatchlists().then(data => {
            setWatchlists(data);
            if (data.length > 0) setActiveId(data[0].id);
        });
        fetchAllTickers().then(setAllTickers);
    }, []);

    // Sync focused index when active entry changes
    useEffect(() => {
        if (!activeList) return;
        const idx = activeList.entries.findIndex(e => entryKey(e) === activeKey);
        setFocusedIdx(idx);
    }, [activeKey, activeList]);

    // Close add dropdown on outside click
    useEffect(() => {
        if (!addStep) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setAddStep(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [addStep]);

    // Arrow key navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!activeList) return;
        const entries = activeList.entries;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = Math.min(focusedIdx + 1, entries.length - 1);
            setFocusedIdx(next);
            onSelectEntry(entries[next]);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = Math.max(focusedIdx - 1, 0);
            setFocusedIdx(prev);
            onSelectEntry(entries[prev]);
        }
    }, [activeList, focusedIdx, onSelectEntry]);

    // ── Add entry handlers ──
    async function handleAddSingle(symbol: string) {
        if (!activeId) return;
        setAddStep(null);
        const updated = await addEntry(activeId, { type: 'S', symbol });
        setWatchlists(prev => prev.map(w => w.id === activeId ? updated : w));
    }

    async function handleAddRatio(num: string, den: string) {
        if (!activeId) return;
        setAddStep(null);
        const expression = `${num}/${den}`;
        const updated = await addEntry(activeId, { type: 'R', expression });
        setWatchlists(prev => prev.map(w => w.id === activeId ? updated : w));
    }

    async function handleRemoveEntry(key: string) {
        if (!activeId) return;
        const updated = await removeEntry(activeId, key);
        setWatchlists(prev => prev.map(w => w.id === activeId ? updated : w));
    }

    // ── Watchlist CRUD ──
    async function handleCreateWatchlist() {
        const name = newName.trim() || `Watchlist ${watchlists.length + 1}`;
        const wl = await createWatchlist(name);
        setWatchlists(prev => [...prev, wl]);
        setActiveId(wl.id);
        setShowNewInput(false);
        setNewName('');
    }

    async function handleDeleteWatchlist(id: string) {
        await deleteWatchlist(id);
        setWatchlists(prev => {
            const next = prev.filter(w => w.id !== id);
            if (activeId === id) setActiveId(next[0]?.id ?? null);
            return next;
        });
    }

    async function handleRenameCommit() {
        if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
        const updated = await renameWatchlist(renamingId, renameValue.trim());
        setWatchlists(prev => prev.map(w => w.id === renamingId ? { ...w, name: updated.name } : w));
        setRenamingId(null);
    }

    // ── Import from file ──
    async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
        if (!activeId || !e.target.files?.[0]) return;
        const text = await e.target.files[0].text();
        const lines = text.split(/[\n\r]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
        for (const line of lines) {
            if (line.includes('/')) {
                const [num, den] = line.split('/').map(s => s.trim());
                if (num && den) await addEntry(activeId, { type: 'R', expression: `${num}/${den}` });
            } else if (line.length <= 10) {
                await addEntry(activeId, { type: 'S', symbol: line });
            }
        }
        // Refresh
        const updated = watchlists.find(w => w.id === activeId);
        if (updated) {
            const fresh = await fetchWatchlists();
            setWatchlists(fresh);
        }
        e.target.value = '';
    }

    // ── Render ──
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
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            {/* ── Header: watchlist selector ── */}
            <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid #2a2a2a' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <select
                        value={activeId ?? ''}
                        onChange={e => setActiveId(e.target.value)}
                        style={{ flex: 1, background: '#1e1e1e', color: '#e2e8f0', border: '1px solid #3a3a3a', borderRadius: 4, padding: '3px 6px', fontSize: 13, cursor: 'pointer' }}
                    >
                        {watchlists.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        {watchlists.length === 0 && <option value="">No watchlists</option>}
                    </select>
                    <button onClick={() => setShowNewInput(v => !v)} title="New watchlist" style={btnStyle}>+</button>
                    {activeId && (
                        <button onClick={() => handleDeleteWatchlist(activeId)} title="Delete watchlist" style={{ ...btnStyle, color: '#ef5350' }}>✕</button>
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

                {activeList && renamingId === activeId ? (
                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameCommit(); if (e.key === 'Escape') setRenamingId(null); }}
                            style={inputStyle} />
                        <button onClick={handleRenameCommit} style={btnStyle}>✓</button>
                    </div>
                ) : activeList ? (
                    <div onDoubleClick={() => { setRenamingId(activeId); setRenameValue(activeList.name); }}
                        title="Double-click to rename"
                        style={{ color: '#94a3b8', fontSize: 11, paddingLeft: 2, cursor: 'text', marginBottom: 2 }}>
                        {activeList.name}
                    </div>
                ) : null}
            </div>

            {/* ── Entry list ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {(activeList?.entries ?? []).length === 0 && (
                    <div style={{ color: '#555', padding: '12px 10px', fontSize: 12 }}>No entries — press + to add</div>
                )}
                {(activeList?.entries ?? []).map((entry, idx) => {
                    const key = entryKey(entry);
                    const isActive = key === activeKey;
                    const isFocused = idx === focusedIdx;
                    const isRatio = entry.type === 'R';

                    return (
                        <div
                            key={key}
                            onClick={() => { onSelectEntry(entry); setFocusedIdx(idx); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '5px 10px',
                                cursor: 'pointer',
                                background: isActive ? '#1e3a5f' : isFocused ? '#1a2a3a' : 'transparent',
                                borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                                {/* Type badge */}
                                <span style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: '1px 4px',
                                    borderRadius: 3,
                                    background: isRatio ? '#2d1f5e' : '#1a3a2a',
                                    color: isRatio ? '#a78bfa' : '#4ade80',
                                    letterSpacing: 0.5,
                                    flexShrink: 0,
                                }}>
                                    {isRatio ? 'R' : 'S'}
                                </span>
                                <span style={{
                                    color: isActive ? '#93c5fd' : isRatio ? '#c4b5fd' : '#e2e8f0',
                                    fontWeight: isActive ? 600 : 400,
                                    fontSize: isRatio ? 12 : 13,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {key}
                                </span>
                            </div>
                            <button
                                onClick={e => { e.stopPropagation(); handleRemoveEntry(key); }}
                                title="Remove"
                                className="remove-btn"
                                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
                            >✕</button>
                        </div>
                    );
                })}
            </div>

            {/* ── Footer: add + import ── */}
            <div style={{ borderTop: '1px solid #2a2a2a', padding: '6px 8px', position: 'relative' }} ref={dropdownRef}>

                {/* Add type selector + import */}
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        onClick={() => setAddStep(s => s ? null : { mode: 'S' })}
                        disabled={!activeId}
                        style={{ ...btnStyle, flex: 1, fontSize: 12 }}
                    >
                        + Single
                    </button>
                    <button
                        onClick={() => setAddStep(s => s?.mode === 'R' ? null : { mode: 'R', step: 1 })}
                        disabled={!activeId}
                        style={{ ...btnStyle, flex: 1, fontSize: 12, color: '#c4b5fd' }}
                    >
                        + Ratio
                    </button>
                    <label title="Import from file" style={{ ...btnStyle, display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '3px 7px' }}>
                        ↑
                        <input type="file" accept=".txt,.csv" onChange={handleImport} style={{ display: 'none' }} />
                    </label>
                </div>

                {/* ── Single ticker dropdown ── */}
                {addStep?.mode === 'S' && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 4, zIndex: 100 }}>
                        <TickerSearch
                            allTickers={allTickers}
                            placeholder="Search ticker or name…"
                            onSelect={handleAddSingle}
                            onClose={() => setAddStep(null)}
                        />
                    </div>
                )}

                {/* ── Ratio step 1: pick numerator ── */}
                {addStep?.mode === 'R' && addStep.step === 1 && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 4, zIndex: 100 }}>
                        <div style={{ padding: '6px 10px 2px', color: '#a78bfa', fontSize: 11, fontWeight: 600 }}>
                            RATIO — Step 1: Pick numerator
                        </div>
                        <TickerSearch
                            allTickers={allTickers}
                            placeholder="Numerator (e.g. GLD)…"
                            onSelect={num => setAddStep({ mode: 'R', step: 2, num })}
                            onClose={() => setAddStep(null)}
                        />
                    </div>
                )}

                {/* ── Ratio step 2: pick denominator ── */}
                {addStep?.mode === 'R' && addStep.step === 2 && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 4, zIndex: 100 }}>
                        <div style={{ padding: '6px 10px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: '#a78bfa', fontSize: 11, fontWeight: 600 }}>
                                RATIO — Step 2: Pick denominator
                            </span>
                            <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>
                                {addStep.num} / ?
                            </span>
                        </div>
                        <TickerSearch
                            allTickers={allTickers}
                            placeholder="Denominator (e.g. SPY)…"
                            onSelect={den => handleAddRatio((addStep as { mode: 'R'; step: 2; num: string }).num, den)}
                            onClose={() => setAddStep(null)}
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
