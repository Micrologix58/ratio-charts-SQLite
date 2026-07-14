import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    type PortfolioAccount,
    type PortfolioHolding,
    type PortfolioHoldingEdits,
    fetchPortfolioAccounts,
    createPortfolioAccount,
    fetchPortfolioHoldings,
    addPortfolioHolding,
    updatePortfolioHolding,
    deletePortfolioHolding,
} from './services/portfolioApi';
import { type AssetInfo, fetchAssetUniverse } from './services/assetWatchlistApi';
import { TickerSummaryModal } from './TickerSummaryModal';
import { PerformanceTrackerModal } from './PerformanceTrackerModal';
import { TickerDataEntryModal } from './TickerDataEntryModal';
import { buildComparator, useSortableRows } from './hooks/useSortableRows';

type Props = {
    onOpenChart: (ticker: string) => void;
};

const btnStyle: React.CSSProperties = {
    background: '#1e1e1e',
    color: '#e2e8f0',
    border: '1px solid #3a3a3a',
    borderRadius: 4,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 13,
};

const inputStyle: React.CSSProperties = {
    background: '#111',
    color: '#e2e8f0',
    border: '1px solid #3a3a3a',
    borderRadius: 4,
    padding: '5px 8px',
    fontSize: 13,
    outline: 'none',
};

function num(v: number | null | undefined, digits = 2): string {
    return v == null ? '—' : v.toFixed(digits);
}

function money(v: number | null | undefined): string {
    return v == null ? '—' : `$${v.toFixed(2)}`;
}

function pct(v: number | null | undefined): string {
    return v == null ? '—' : `${v.toFixed(2)}%`;
}

type HoldingSortKey =
    | 'ticker' | 'company' | 'account' | 'alloc' | 'basisPrice' | 'currentPrice'
    | 'currentShares' | 'sharesToHold' | 'investedBasis' | 'holdingsCount' | 'value'
    | 'pctOfHoldings' | 'distPerYear' | 'yield' | 'annualIncome' | 'status' | 'taxForm';

function getHoldingSortValue(h: PortfolioHolding, key: HoldingSortKey): string | number | null | undefined {
    switch (key) {
        case 'ticker': return h.tickerSymbol;
        case 'company': return h.companyName;
        case 'account': return h.accountName;
        case 'alloc': return h.allocationPct;
        case 'basisPrice': return h.basisPrice;
        case 'currentPrice': return h.currentPrice;
        case 'currentShares': return h.currentShares;
        case 'sharesToHold': return h.sharesToHold;
        case 'investedBasis': return h.investedBasis;
        case 'holdingsCount': return h.holdingsCount;
        case 'value': return h.value;
        case 'pctOfHoldings': return h.pctOfHoldings;
        case 'distPerYear': return h.distributionPerYear;
        case 'yield': return h.yieldPct;
        case 'annualIncome': return h.annualIncome;
        case 'status': return h.status;
        case 'taxForm': return h.taxForm;
    }
}

// ── Add Holding dropdown: account (existing or new) + ticker search ────────
function AddHoldingForm({
    accounts,
    onAdd,
    onCreateAccount,
    onClose,
}: {
    accounts: PortfolioAccount[];
    onAdd: (accountId: number, ticker: string) => void;
    onCreateAccount: (name: string) => Promise<PortfolioAccount>;
    onClose: () => void;
}) {
    const [assetType, setAssetType] = useState<'stock' | 'ETF'>('stock');
    const [accountId, setAccountId] = useState<number | ''>(accounts[0]?.id ?? '');
    const [newAccountName, setNewAccountName] = useState('');
    const [showNewAccount, setShowNewAccount] = useState(accounts.length === 0);
    const [search, setSearch] = useState('');
    const [universe, setUniverse] = useState<AssetInfo[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { fetchAssetUniverse(assetType).then(setUniverse); }, [assetType]);
    useEffect(() => { setTimeout(() => inputRef.current?.focus(), 40); }, []);

    const filtered = universe.filter(t =>
        t.TickerSymbol.toLowerCase().includes(search.toLowerCase()) ||
        t.CompanyName.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 100);

    async function handleSelect(ticker: string) {
        let id = accountId;
        if (showNewAccount) {
            const name = newAccountName.trim();
            if (!name) return;
            const created = await onCreateAccount(name);
            id = created.id;
        }
        if (!id) return;
        onAdd(Number(id), ticker);
    }

    return (
        <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
            background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 6,
            width: 320, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
            <div style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid #2a2a2a' }}>
                <button onClick={() => setAssetType('stock')} style={{ ...btnStyle, flex: 1, fontSize: 12, background: assetType === 'stock' ? '#2a3a4a' : '#1e1e1e' }}>Stock</button>
                <button onClick={() => setAssetType('ETF')} style={{ ...btnStyle, flex: 1, fontSize: 12, background: assetType === 'ETF' ? '#2a3a4a' : '#1e1e1e', color: '#a78bfa' }}>ETF</button>
            </div>

            <div style={{ padding: '8px 8px 4px' }}>
                {!showNewAccount ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                        <select
                            value={accountId}
                            onChange={e => setAccountId(Number(e.target.value))}
                            style={{ ...inputStyle, flex: 1 }}
                        >
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <button onClick={() => setShowNewAccount(true)} style={{ ...btnStyle, fontSize: 12 }}>+ New</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 4 }}>
                        <input
                            autoFocus={accounts.length > 0}
                            value={newAccountName}
                            onChange={e => setNewAccountName(e.target.value)}
                            placeholder="New account name…"
                            style={{ ...inputStyle, flex: 1 }}
                        />
                        {accounts.length > 0 && (
                            <button onClick={() => setShowNewAccount(false)} style={{ ...btnStyle, fontSize: 12 }}>Cancel</button>
                        )}
                    </div>
                )}
            </div>

            <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && onClose()}
                placeholder={`Search ${assetType === 'ETF' ? 'ETF' : 'stock'} or name…`}
                style={{ ...inputStyle, margin: '4px 8px', width: 'calc(100% - 16px)' }}
            />
            <div style={{ maxHeight: 220, overflowY: 'auto', paddingBottom: 4 }}>
                {filtered.map(t => (
                    <div
                        key={t.TickerSymbol}
                        onClick={() => handleSelect(t.TickerSymbol)}
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

// ── Edit Holding modal ──────────────────────────────────────────────────────
function EditHoldingModal({
    holding,
    onSave,
    onClose,
}: {
    holding: PortfolioHolding;
    onSave: (edits: PortfolioHoldingEdits) => void;
    onClose: () => void;
}) {
    const [allocationPct, setAllocationPct] = useState(holding.allocationPct?.toString() ?? '');
    const [basisPrice, setBasisPrice] = useState(holding.basisPrice?.toString() ?? '');
    const [currentShares, setCurrentShares] = useState(holding.currentShares.toString());
    const [sharesToHold, setSharesToHold] = useState(holding.sharesToHold?.toString() ?? '');
    const [holdingsCount, setHoldingsCount] = useState(holding.holdingsCount?.toString() ?? '1');
    const [distributionPerYear, setDistributionPerYear] = useState(holding.distributionPerYear?.toString() ?? '');
    const [status, setStatus] = useState(holding.status ?? 'Active');
    const [taxForm, setTaxForm] = useState(holding.taxForm ?? '');

    function handleSave() {
        onSave({
            allocationPct: allocationPct === '' ? null : Number(allocationPct),
            basisPrice: basisPrice === '' ? null : Number(basisPrice),
            currentShares: Number(currentShares) || 0,
            sharesToHold: sharesToHold === '' ? null : Number(sharesToHold),
            holdingsCount: holdingsCount === '' ? null : Number(holdingsCount),
            distributionPerYear: distributionPerYear === '' ? null : Number(distributionPerYear),
            status,
            taxForm,
        });
    }

    const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 };
    const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 12 };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8,
                width: 360, padding: 16, fontFamily: 'Arial, sans-serif', fontSize: 13,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, color: '#e2e8f0' }}>{holding.tickerSymbol} — {holding.accountName}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={fieldStyle}>
                        <label style={labelStyle}>Allocation %</label>
                        <input style={inputStyle} value={allocationPct} onChange={e => setAllocationPct(e.target.value)} />
                    </div>
                    <div style={fieldStyle}>
                        <label style={labelStyle}>Basis Price</label>
                        <input style={inputStyle} value={basisPrice} onChange={e => setBasisPrice(e.target.value)} />
                    </div>
                    <div style={fieldStyle}>
                        <label style={labelStyle}>Current Shares</label>
                        <input style={inputStyle} value={currentShares} onChange={e => setCurrentShares(e.target.value)} />
                    </div>
                    <div style={fieldStyle}>
                        <label style={labelStyle}>Shares To Hold</label>
                        <input style={inputStyle} value={sharesToHold} onChange={e => setSharesToHold(e.target.value)} />
                    </div>
                    <div style={fieldStyle}>
                        <label style={labelStyle}># of Holdings</label>
                        <input style={inputStyle} value={holdingsCount} onChange={e => setHoldingsCount(e.target.value)} />
                    </div>
                    <div style={fieldStyle}>
                        <label style={labelStyle}>Dist. per Year</label>
                        <input style={inputStyle} value={distributionPerYear} onChange={e => setDistributionPerYear(e.target.value)} placeholder="auto from Dividends" />
                    </div>
                    <div style={fieldStyle}>
                        <label style={labelStyle}>Status</label>
                        <input style={inputStyle} value={status} onChange={e => setStatus(e.target.value)} />
                    </div>
                    <div style={fieldStyle}>
                        <label style={labelStyle}>Tax Form</label>
                        <input style={inputStyle} value={taxForm} onChange={e => setTaxForm(e.target.value)} />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button onClick={onClose} style={btnStyle}>Cancel</button>
                    <button onClick={handleSave} style={{ ...btnStyle, background: '#2d5bff', border: '1px solid #2d5bff' }}>Save</button>
                </div>
            </div>
        </div>
    );
}

// ── Main tab ─────────────────────────────────────────────────────────────────
export function PortfolioTab({ onOpenChart }: Props) {
    const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
    const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [editing, setEditing] = useState<PortfolioHolding | null>(null);
    const [summarizing, setSummarizing] = useState<PortfolioHolding | null>(null);
    const [performanceOpen, setPerformanceOpen] = useState(false);
    const [dataEntryOpen, setDataEntryOpen] = useState(false);
    const addRef = useRef<HTMLDivElement>(null);

    function refresh() {
        setLoading(true);
        Promise.all([fetchPortfolioAccounts(), fetchPortfolioHoldings()]).then(([a, h]) => {
            setAccounts(a);
            setHoldings(h);
            setLoading(false);
        });
    }

    useEffect(() => { refresh(); }, []);

    useEffect(() => {
        if (!addOpen) return;
        const handler = (e: MouseEvent) => {
            if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [addOpen]);

    async function handleAddHolding(accountId: number, ticker: string) {
        try {
            const created = await addPortfolioHolding(accountId, ticker);
            setAddOpen(false);
            refresh();
            setEditing(created);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to add holding');
        }
    }

    async function handleSaveEdit(edits: PortfolioHoldingEdits) {
        if (!editing) return;
        await updatePortfolioHolding(editing.id, edits);
        setEditing(null);
        refresh();
    }

    async function handleDelete(holding: PortfolioHolding) {
        if (!confirm(`Remove ${holding.tickerSymbol} (${holding.accountName}) from your portfolio?`)) return;
        await deletePortfolioHolding(holding.id);
        refresh();
    }

    // Sort state is shared across accounts (one click-to-sort header for the whole tab),
    // but sorting is applied within each account group so accounts stay visually separated.
    const { sortKey, direction, requestSort, sortIndicator } = useSortableRows<PortfolioHolding, HoldingSortKey>(
        holdings,
        getHoldingSortValue,
    );

    type AccountGroup = { accountId: number; accountName: string; holdings: PortfolioHolding[] };
    const accountGroups: AccountGroup[] = useMemo(() => {
        const byAccount = new Map<number, PortfolioHolding[]>();
        for (const h of holdings) {
            const list = byAccount.get(h.accountId) ?? [];
            list.push(h);
            byAccount.set(h.accountId, list);
        }
        const comparator = buildComparator(getHoldingSortValue, sortKey, direction);
        const groups: AccountGroup[] = [];
        for (const acc of accounts) {
            const list = byAccount.get(acc.id);
            if (!list || list.length === 0) continue;
            groups.push({ accountId: acc.id, accountName: acc.name, holdings: [...list].sort(comparator) });
        }
        return groups;
    }, [holdings, accounts, sortKey, direction]);

    const thStyle: React.CSSProperties = {
        textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2a2a2a',
        color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#0b0b0b',
    };
    const tdStyle: React.CSSProperties = {
        padding: '5px 8px', borderBottom: '1px solid #1f1f1f', color: '#e2e8f0', whiteSpace: 'nowrap',
    };

    return (
        <div style={{ flex: 1, padding: 24, color: '#94a3b8', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ color: '#e2e8f0', margin: 0 }}>Portfolio</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setDataEntryOpen(true)} style={btnStyle}>+ Log Transaction</button>
                    <button onClick={() => setPerformanceOpen(true)} style={btnStyle}>Performance Tracker</button>
                <div style={{ position: 'relative' }} ref={addRef}>
                    <button onClick={() => setAddOpen(v => !v)} style={btnStyle}>+ Add Holding</button>
                    {addOpen && (
                        <AddHoldingForm
                            accounts={accounts}
                            onAdd={handleAddHolding}
                            onCreateAccount={async name => {
                                const created = await createPortfolioAccount(name);
                                setAccounts(prev => [...prev, created]);
                                return created;
                            }}
                            onClose={() => setAddOpen(false)}
                        />
                    )}
                </div>
                </div>
            </div>

            {loading && <div>Loading…</div>}

            {!loading && holdings.length === 0 && (
                <div style={{ color: '#555' }}>No holdings yet — press + Add Holding to get started.</div>
            )}

            {!loading && holdings.length > 0 && (
                <div style={{ overflowX: 'auto', border: '1px solid #2a2a2a', borderRadius: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>
                                {([
                                    ['ticker', 'Ticker'], ['company', 'Company'], ['account', 'Account'],
                                    ['alloc', 'Alloc %'], ['basisPrice', 'Basis Price'], ['currentPrice', 'Current Price'],
                                    ['currentShares', 'Current Shares'], ['sharesToHold', 'Shares To Hold'],
                                    ['investedBasis', 'Invested Basis'], ['holdingsCount', '# Holdings'],
                                    ['value', 'Value'], ['pctOfHoldings', '% of Holdings'], ['distPerYear', 'Dist/Yr'],
                                    ['yield', 'Yield %'], ['annualIncome', 'Annual Income'], ['status', 'Status'],
                                    ['taxForm', 'Tax Form'],
                                ] as [HoldingSortKey, string][]).map(([key, label]) => (
                                    <th
                                        key={key}
                                        style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
                                        onClick={() => requestSort(key)}
                                    >
                                        {label}{sortIndicator(key)}
                                    </th>
                                ))}
                                <th style={thStyle}></th>
                                <th style={thStyle}></th>
                            </tr>
                        </thead>
                        {accountGroups.map(group => {
                            const investedBasisSum = group.holdings.reduce((s, h) => s + (h.investedBasis ?? 0), 0);
                            const valueSum = group.holdings.reduce((s, h) => s + (h.value ?? 0), 0);
                            const annualIncomeSum = group.holdings.reduce((s, h) => s + (h.annualIncome ?? 0), 0);

                            return (
                                <tbody key={group.accountId}>
                                    {group.holdings.map(h => (
                                        <tr key={h.id} onClick={() => setEditing(h)} style={{ cursor: 'pointer' }}>
                                            <td
                                                style={{ ...tdStyle, color: '#93c5fd', fontWeight: 600, textDecoration: 'underline' }}
                                                onClick={e => { e.stopPropagation(); onOpenChart(h.tickerSymbol); }}
                                                title={`Open ${h.tickerSymbol} in Chart tab`}
                                            >
                                                {h.tickerSymbol}
                                            </td>
                                            <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={h.companyName}>{h.companyName}</td>
                                            <td style={tdStyle}>{h.accountName}</td>
                                            <td style={tdStyle}>{pct(h.allocationPct)}</td>
                                            <td style={tdStyle}>{money(h.basisPrice)}</td>
                                            <td style={tdStyle}>{money(h.currentPrice)}</td>
                                            <td style={tdStyle}>{num(h.currentShares)}</td>
                                            <td style={tdStyle}>{num(h.sharesToHold)}</td>
                                            <td style={tdStyle}>{money(h.investedBasis)}</td>
                                            <td style={tdStyle}>{h.holdingsCount ?? '—'}</td>
                                            <td style={tdStyle}>{money(h.value)}</td>
                                            <td style={tdStyle}>{pct(h.pctOfHoldings)}</td>
                                            <td style={tdStyle}>{money(h.distributionPerYear)}</td>
                                            <td style={tdStyle}>{pct(h.yieldPct)}</td>
                                            <td style={tdStyle}>{money(h.annualIncome)}</td>
                                            <td style={tdStyle}>{h.status ?? '—'}</td>
                                            <td style={tdStyle}>{h.taxForm ?? '—'}</td>
                                            <td style={tdStyle}>
                                                <button
                                                    onClick={e => { e.stopPropagation(); setSummarizing(h); }}
                                                    title="Ticker Summary"
                                                    style={{ ...btnStyle, padding: '2px 8px', fontSize: 11 }}
                                                >
                                                    z
                                                </button>
                                            </td>
                                            <td style={tdStyle}>
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleDelete(h); }}
                                                    title="Remove"
                                                    style={{ background: 'none', border: 'none', color: '#ef5350', cursor: 'pointer', fontSize: 13 }}
                                                >
                                                    ✕
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr style={{ background: '#161616' }}>
                                        <td style={{ ...tdStyle, fontWeight: 700, color: '#e2e8f0' }} colSpan={8}>
                                            {group.accountName} — Total
                                        </td>
                                        <td style={{ ...tdStyle, fontWeight: 700 }}>{money(investedBasisSum)}</td>
                                        <td style={tdStyle}></td>
                                        <td style={{ ...tdStyle, fontWeight: 700 }}>{money(valueSum)}</td>
                                        <td style={tdStyle}></td>
                                        <td style={tdStyle}></td>
                                        <td style={tdStyle}></td>
                                        <td style={{ ...tdStyle, fontWeight: 700 }}>{money(annualIncomeSum)}</td>
                                        <td style={tdStyle}></td>
                                        <td style={tdStyle}></td>
                                        <td style={tdStyle}></td>
                                        <td style={tdStyle}></td>
                                    </tr>
                                </tbody>
                            );
                        })}
                    </table>
                </div>
            )}

            {editing && (
                <EditHoldingModal
                    holding={editing}
                    onClose={() => setEditing(null)}
                    onSave={handleSaveEdit}
                />
            )}

            {summarizing && (
                <TickerSummaryModal
                    holding={summarizing}
                    onClose={() => setSummarizing(null)}
                />
            )}

            {performanceOpen && (
                <PerformanceTrackerModal onClose={() => setPerformanceOpen(false)} />
            )}

            {dataEntryOpen && (
                <TickerDataEntryModal
                    onClose={() => setDataEntryOpen(false)}
                    onSaved={refresh}
                />
            )}
        </div>
    );
}
