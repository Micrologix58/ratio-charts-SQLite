import React, { useEffect, useRef, useState } from 'react';
import { onboardAsset, fetchPriceStatus, fetchCompanyDetail, updateCompany } from './services/assetWatchlistApi';

type Props = {
    onClose: () => void;
    onOnboarded: () => void;
    /** When set, the modal edits this existing ticker instead of onboarding a new one. */
    editTicker?: string;
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

export function AssetOnboardingModal({ onClose, onOnboarded, editTicker }: Props) {
    const isEdit = !!editTicker;

    const [tickerSymbol, setTickerSymbol] = useState(editTicker ?? '');
    const [companyName, setCompanyName] = useState('');
    const [assetType, setAssetType] = useState<'Stock' | 'ETF'>('Stock');
    const [databaseCategory, setDatabaseCategory] = useState('');
    const [industryClassification, setIndustryClassification] = useState('');
    const [exchangeListed, setExchangeListed] = useState('');
    const [websiteURL, setWebsiteURL] = useState('');

    const [status, setStatus] = useState<'loading' | 'loadError' | 'form' | 'submitting' | 'backfilling' | 'done' | 'error'>(
        isEdit ? 'loading' : 'form'
    );
    const [error, setError] = useState('');
    const [rowCount, setRowCount] = useState(0);

    const pollRef = useRef<{ cancelled: boolean }>({ cancelled: false });

    useEffect(() => () => { pollRef.current.cancelled = true; }, []);

    useEffect(() => {
        if (!editTicker) return;
        let cancelled = false;
        fetchCompanyDetail(editTicker).then(detail => {
            if (cancelled) return;
            setCompanyName(detail.companyName);
            setAssetType(detail.assetType?.toUpperCase() === 'ETF' ? 'ETF' : 'Stock');
            setDatabaseCategory(detail.sector ?? '');
            setIndustryClassification(detail.industry ?? '');
            setExchangeListed(detail.exchangeListed ?? '');
            setWebsiteURL(detail.websiteURL ?? '');
            setStatus('form');
        }).catch(err => {
            if (cancelled) return;
            setStatus('loadError');
            setError(err instanceof Error ? err.message : 'Failed to load company');
        });
        return () => { cancelled = true; };
    }, [editTicker]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const ticker = tickerSymbol.toUpperCase().trim();
        if (!ticker || !companyName.trim()) return;

        setStatus('submitting');
        setError('');

        if (isEdit) {
            try {
                await updateCompany(ticker, {
                    companyName: companyName.trim(),
                    databaseCategory: databaseCategory.trim() || undefined,
                    industryClassification: industryClassification.trim() || undefined,
                    exchangeListed: exchangeListed.trim() || undefined,
                    websiteURL: websiteURL.trim() || undefined,
                });
                onOnboarded();
                setStatus('done');
            } catch (err) {
                setStatus('error');
                setError(err instanceof Error ? err.message : 'Failed to save changes');
            }
            return;
        }

        try {
            await onboardAsset({
                tickerSymbol: ticker,
                companyName: companyName.trim(),
                assetType,
                databaseCategory: databaseCategory.trim() || undefined,
                industryClassification: industryClassification.trim() || undefined,
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
                    <h3 style={{ margin: 0, color: '#e2e8f0' }}>{isEdit ? `Edit ${editTicker}` : 'Onboard New Asset'}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                {status === 'loading' && (
                    <div style={{ color: '#94a3b8', marginTop: 14 }}>Loading…</div>
                )}

                {status === 'loadError' && (
                    <div style={{ marginTop: 14 }}>
                        <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                            <button onClick={onClose} style={{ ...btnStyle, color: '#93c5fd' }}>Close</button>
                        </div>
                    </div>
                )}

                {(status === 'form' || status === 'submitting' || status === 'error') ? (
                    <form onSubmit={handleSubmit}>
                        <label style={labelStyle}>Ticker Symbol</label>
                        <input style={inputStyle} value={tickerSymbol} onChange={e => setTickerSymbol(e.target.value)} placeholder="e.g. MSFT" required disabled={isEdit} />

                        <label style={labelStyle}>Company / Fund Name</label>
                        <input style={inputStyle} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Microsoft Corporation" required />

                        <label style={labelStyle}>Asset Type</label>
                        <select style={inputStyle} value={assetType} onChange={e => setAssetType(e.target.value as 'Stock' | 'ETF')} disabled={isEdit}>
                            <option value="Stock">Stock</option>
                            <option value="ETF">ETF</option>
                        </select>

                        <label style={labelStyle}>Sector / Category (optional)</label>
                        <input style={inputStyle} value={databaseCategory} onChange={e => setDatabaseCategory(e.target.value)} placeholder="e.g. Technology" />

                        <label style={labelStyle}>Industry (optional)</label>
                        <input style={inputStyle} value={industryClassification} onChange={e => setIndustryClassification(e.target.value)} placeholder="e.g. Semiconductors" />

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
                                {status === 'submitting' ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Asset'}
                            </button>
                        </div>
                    </form>
                ) : isEdit ? (
                    <div style={{ marginTop: 14 }}>
                        <div style={{ color: '#4ade80', fontSize: 12, marginBottom: 8 }}>
                            {editTicker} updated.
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                            <button onClick={onClose} style={{ ...btnStyle, color: '#93c5fd' }}>Close</button>
                        </div>
                    </div>
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
