import React, { useEffect, useMemo, useState } from 'react';
import {
    type PortfolioAccount,
    type PortfolioTransaction,
    fetchPortfolioAccounts,
    fetchPortfolioTransactions,
    addPortfolioTransaction,
} from './services/portfolioApi';

type Props = {
    onClose: () => void;
    onSaved: () => void;
};

type RangeKey = 'current' | 'previous' | 'ytd';

const inputStyle: React.CSSProperties = {
    background: '#111', color: '#e2e8f0', border: '1px solid #3a3a3a',
    borderRadius: 4, padding: '5px 8px', fontSize: 13, outline: 'none',
};
const btnStyle: React.CSSProperties = {
    background: '#1e1e1e', color: '#e2e8f0', border: '1px solid #3a3a3a',
    borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontSize: 13,
};

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function inRange(dateStr: string, range: RangeKey): boolean {
    const d = new Date(dateStr);
    const now = new Date();
    if (range === 'ytd') {
        return d.getFullYear() === now.getFullYear();
    }
    const targetMonth = range === 'current' ? now.getMonth() : (now.getMonth() + 11) % 12;
    const targetYear = range === 'current' ? now.getFullYear() : (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
    return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
}

export function TickerDataEntryModal({ onClose, onSaved }: Props) {
    const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
    const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
    const [range, setRange] = useState<RangeKey>('current');

    const [date, setDate] = useState(todayIso());
    const [accountId, setAccountId] = useState<number | ''>('');
    const [ticker, setTicker] = useState('');
    const [type, setType] = useState<'Bought' | 'Sold' | 'Dividend'>('Bought');
    const [shares, setShares] = useState('');
    const [price, setPrice] = useState('');
    const [dividendAmount, setDividendAmount] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function refresh() {
        fetchPortfolioTransactions({ limit: 1000 }).then(setTransactions);
    }

    useEffect(() => {
        fetchPortfolioAccounts().then(a => { setAccounts(a); if (a.length) setAccountId(a[0].id); });
        refresh();
    }, []);

    const filtered = useMemo(() => transactions.filter(t => inRange(t.transactionDate, range)), [transactions, range]);

    async function handleSave() {
        setError(null);
        const tickerUpper = ticker.toUpperCase().trim();
        if (!accountId || !tickerUpper || !date) {
            setError('Account, Ticker, and Date are required');
            return;
        }
        setSaving(true);
        try {
            await addPortfolioTransaction({
                accountId: Number(accountId),
                tickerSymbol: tickerUpper,
                transactionDate: date,
                transactionType: type,
                shares: type !== 'Dividend' && shares ? Number(shares) : undefined,
                price: type !== 'Dividend' && price ? Number(price) : undefined,
                dividendAmount: type === 'Dividend' && dividendAmount ? Number(dividendAmount) : undefined,
            });
            setShares('');
            setPrice('');
            setDividendAmount('');
            refresh();
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save transaction');
        } finally {
            setSaving(false);
        }
    }

    const thStyle: React.CSSProperties = {
        textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid #2a2a2a',
        color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap',
    };
    const tdStyle: React.CSSProperties = {
        padding: '4px 8px', borderBottom: '1px solid #1f1f1f', color: '#e2e8f0', whiteSpace: 'nowrap',
    };
    const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
    const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 12 };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8,
                width: 'min(700px, 96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
                fontFamily: 'Arial, sans-serif', fontSize: 13,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #2a2a2a' }}>
                    <h3 style={{ margin: 0, color: '#e2e8f0' }}>Ticker Data Entry</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ padding: 14, borderBottom: '1px solid #2a2a2a' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Date</label>
                            <input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Account</label>
                            <select style={inputStyle} value={accountId} onChange={e => setAccountId(Number(e.target.value))}>
                                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                {accounts.length === 0 && <option value="">No accounts yet</option>}
                            </select>
                        </div>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Ticker</label>
                            <input style={inputStyle} value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Type</label>
                            <select style={inputStyle} value={type} onChange={e => setType(e.target.value as typeof type)}>
                                <option value="Bought">Bought</option>
                                <option value="Sold">Sold</option>
                                <option value="Dividend">Dividend</option>
                            </select>
                        </div>
                        {type !== 'Dividend' ? (
                            <>
                                <div style={fieldStyle}>
                                    <label style={labelStyle}>Shares</label>
                                    <input style={inputStyle} value={shares} onChange={e => setShares(e.target.value)} />
                                </div>
                                <div style={fieldStyle}>
                                    <label style={labelStyle}>Price</label>
                                    <input style={inputStyle} value={price} onChange={e => setPrice(e.target.value)} />
                                </div>
                            </>
                        ) : (
                            <div style={fieldStyle}>
                                <label style={labelStyle}>Dividend Amount</label>
                                <input style={inputStyle} value={dividendAmount} onChange={e => setDividendAmount(e.target.value)} />
                            </div>
                        )}
                    </div>

                    {error && <div style={{ color: '#ef5350', fontSize: 12, marginTop: 8 }}>{error}</div>}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, background: '#2d5bff', border: '1px solid #2d5bff' }}>
                            {saving ? 'Saving…' : 'Save Transaction'}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 4, padding: '10px 14px 0' }}>
                    {(['current', 'previous', 'ytd'] as RangeKey[]).map(r => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            style={{ ...btnStyle, fontSize: 12, background: range === r ? '#2a3a4a' : '#1e1e1e' }}
                        >
                            {r === 'current' ? 'Current Month' : r === 'previous' ? 'Previous Month' : 'YTD'}
                        </button>
                    ))}
                </div>

                <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px 14px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Date</th>
                                <th style={thStyle}>Account</th>
                                <th style={thStyle}>Ticker</th>
                                <th style={thStyle}>Type</th>
                                <th style={thStyle}>Shares</th>
                                <th style={thStyle}>Price</th>
                                <th style={thStyle}>Dividend Amt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(t => (
                                <tr key={t.id}>
                                    <td style={tdStyle}>{t.transactionDate}</td>
                                    <td style={tdStyle}>{t.accountName}</td>
                                    <td style={{ ...tdStyle, color: '#93c5fd' }}>{t.tickerSymbol}</td>
                                    <td style={tdStyle}>{t.transactionType}</td>
                                    <td style={tdStyle}>{t.shares ?? '—'}</td>
                                    <td style={tdStyle}>{t.price ?? '—'}</td>
                                    <td style={tdStyle}>{t.dividendAmount ?? '—'}</td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr><td style={tdStyle} colSpan={7}>No transactions in this range.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
