import type React from 'react';
import type { PortfolioHolding } from './services/portfolioApi';

type Props = {
    holding: PortfolioHolding;
    onClose: () => void;
};

function money(v: number | null | undefined): string {
    return v == null ? '—' : `$${v.toFixed(2)}`;
}

function pct(v: number | null | undefined): string {
    return v == null ? '—' : `${v.toFixed(2)}%`;
}

export function TickerSummaryModal({ holding, onClose }: Props) {
    const monthlyDiv = holding.distributionPerYear != null ? holding.distributionPerYear / 12 : null;

    const rowStyle: React.CSSProperties = {
        display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #1f1f1f',
    };
    const labelStyle: React.CSSProperties = { color: '#94a3b8' };
    const valueStyle: React.CSSProperties = { color: '#e2e8f0', fontWeight: 600 };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8,
                width: 320, padding: 16, fontFamily: 'Arial, sans-serif', fontSize: 13,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h3 style={{ margin: 0, color: '#e2e8f0' }}>Ticker Summary</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                <div style={rowStyle}><span style={labelStyle}>Account</span><span style={valueStyle}>{holding.accountName}</span></div>
                <div style={rowStyle}><span style={labelStyle}>Ticker</span><span style={{ ...valueStyle, color: '#93c5fd' }}>{holding.tickerSymbol}</span></div>
                <div style={rowStyle}><span style={labelStyle}># of Shares</span><span style={valueStyle}>{holding.currentShares}</span></div>
                <div style={rowStyle}><span style={labelStyle}>Last Price</span><span style={valueStyle}>{money(holding.currentPrice)}</span></div>
                <div style={rowStyle}><span style={labelStyle}>Annual Dividend</span><span style={valueStyle}>{money(holding.distributionPerYear)}</span></div>
                <div style={rowStyle}><span style={labelStyle}>Monthly Div</span><span style={valueStyle}>{money(monthlyDiv)}</span></div>
                <div style={rowStyle}><span style={labelStyle}>Total Value</span><span style={valueStyle}>{money(holding.value)}</span></div>
                <div style={{ ...rowStyle, borderBottom: 'none' }}><span style={labelStyle}>% of Portfolio</span><span style={valueStyle}>{pct(holding.pctOfHoldings)}</span></div>
            </div>
        </div>
    );
}
