import React, { useEffect, useRef, useState } from 'react';
import { onboardAsset, fetchPriceStatus } from './services/assetWatchlistApi';

type Props = {
    onClose: () => void;
    onOnboarded: () => void;
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#111',
    color: '#e2e8f0',
    border: '1px solid #3a3a3a',
    borderRadius: 4,
    padding: '6px 8px',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#94a3b8',
    fontSize: 11,
    marginBottom: 4,
    marginTop: 10,
};

const btnStyle: React.CSSProperties = {
    background: '#1e1e1e',
    color: '#e2e8f0',
    border: '1px solid #3a3a3a',
    borderRadius: 4,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
};

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export function AssetOnboardingModal({ onClose, onOnboarded }: Props) {
    const [tickerSymbol, setTickerSymbol] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [assetType, setAssetType] = useState<'Stock' | 'ETF'>('Stock');
    const [databaseCategory, setDatabaseCategory] = useState('');
    const [exchangeListed, setExchangeListed] = useState('');
    const [websiteURL, setWebsiteURL] = useState('');

    const [status, setStatus] = useState<'form' | 'submitting' | 'backfilling' | 'done' | 'error'>('form');
    const [error, setError] = useState('');
    const [rowCount, setRowCount] = useState(0);

    const pollRef = useRef<{ cancelled: boolean }>({ cancelled: false });

    useEffect(() => () => { pollRef.current.cancelled = true; }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const ticker = tickerSymbol.toUpperCase().trim();
        if (!ticker || !companyName.trim()) return;

        setStatus('submitting');
        setError('');
        try {
            await onboardAsset({
                tickerSymbol: ticker,
                companyName: companyName.trim(),
                assetType,
                databaseCategory: databaseCategory.trim() || undefined,
                exchangeListed: exchangeListed.trim() || undefined,
                websiteURL: websiteURL.trim() || undefined,
            });
            onOnboarded();
            setStatus('backfilling');
            pollPriceStatus(ticker, Date.now());
        } catch (err) {
            setStatus('error');
            setError(err instanceof Error ? err.message : 'Failed to onboard asset');
        }
    }

    async function pollPriceStatus(ticker: string, startedAt: number) {
        if (pollRef.current.cancelled) return;
        try {
            const res = await fetchPriceStatus(ticker);
            setRowCount(res.rowCount);
            if (res.rowCount > 0) {
                setStatus('done');
                return;
            }
        } catch {
            // keep polling; the row may just not exist yet
        }
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            setStatus('done'); // give up waiting, backfill may still be running server-side
            return;
        }
        setTimeout(() => pollPriceStatus(ticker, startedAt), POLL_INTERVAL_MS);
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={status === 'form' ? onClose : undefined}>
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8,
                    width: 'min(420px, 92vw)', padding: '16px 18px',
                    fontFamily: 'Arial, sans-serif', fontSize: 13,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, color: '#e2e8f0' }}>Onboard New Asset</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                {status === 'form' || status === 'submitting' || status === 'error' ? (
                    <form onSubmit={handleSubmit}>
                        <label style={labelStyle}>Ticker Symbol</label>
                        <input style={inputStyle} value={tickerSymbol} onChange={e => setTickerSymbol(e.target.value)} placeholder="e.g. MSFT" required />

                        <label style={labelStyle}>Company / Fund Name</label>
                        <input style={inputStyle} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Microsoft Corporation" required />

                        <label style={labelStyle}>Asset Type</label>
                        <select style={inputStyle} value={assetType} onChange={e => setAssetType(e.target.value as 'Stock' | 'ETF')}>
                            <option value="Stock">Stock</option>
                            <option value="ETF">ETF</option>
                        </select>

                        <label style={labelStyle}>Sector / Category (optional)</label>
                        <input style={inputStyle} value={databaseCategory} onChange={e => setDatabaseCategory(e.target.value)} placeholder="e.g. Technology" />

                        <label style={labelStyle}>Exchange (optional)</label>
                        <input style={inputStyle} value={exchangeListed} onChange={e => setExchangeListed(e.target.value)} placeholder="e.g. NASDAQ" />

                        <label style={labelStyle}>Website (optional)</label>
                        <input style={inputStyle} value={websiteURL} onChange={e => setWebsiteURL(e.target.value)} placeholder="https://…" />

                        {status === 'error' && (
                            <div style={{ color: '#ef4444', fontSize: 12, marginTop: 10 }}>{error}</div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                            <button type="button" onClick={onClose} style={btnStyle}>Cancel</button>
                            <button type="submit" disabled={status === 'submitting'} style={{ ...btnStyle, color: '#93c5fd' }}>
                                {status === 'submitting' ? 'Adding…' : 'Add Asset'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div style={{ marginTop: 14 }}>
                        <div style={{ color: '#e2e8f0', marginBottom: 8 }}>
                            {tickerSymbol.toUpperCase()} added to Companies and price backfill triggered.
                        </div>
                        {status === 'backfilling' && (
                            <div style={{ color: '#94a3b8', fontSize: 12 }}>Waiting for initial price history… ({rowCount} rows so far)</div>
                        )}
                        {status === 'done' && (
                            <div style={{ color: '#4ade80', fontSize: 12 }}>
                                {rowCount > 0 ? `Price history loaded (${rowCount} rows).` : 'Onboarding complete — price backfill may still be running in the background.'}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                            <button onClick={onClose} style={{ ...btnStyle, color: '#93c5fd' }}>Close</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
