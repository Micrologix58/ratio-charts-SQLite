import { useState } from 'react';
import { AssetWatchlistPanel } from './AssetWatchlistPanel';
import { AssetRankingTable } from './AssetRankingTable';
import { AssetOnboardingModal } from './AssetOnboardingModal';
import { AssetWatchlistOverview } from './AssetWatchlistOverview';

type Props = {
    onOpenChart: (ticker: string) => void;
};

export function AssetWatchlistTab({ onOpenChart }: Props) {
    const [activeWatchlistId, setActiveWatchlistId] = useState<number | null>(null);
    const [rankingMode, setRankingMode] = useState<'ETF' | 'stock' | null>(null);
    const [onboardOpen, setOnboardOpen] = useState(false);
    const [refreshToken, setRefreshToken] = useState(0);

    return (
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ flex: 1, padding: 24, color: '#94a3b8', overflow: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ color: '#e2e8f0', margin: 0 }}>Watchlist</h3>
                    <button
                        onClick={() => setOnboardOpen(true)}
                        style={{
                            background: '#1e1e1e', color: '#93c5fd', border: '1px solid #3a3a3a',
                            borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontSize: 13,
                        }}
                    >
                        + Onboard New Asset
                    </button>
                </div>
                <AssetWatchlistOverview
                    activeWatchlistId={activeWatchlistId}
                    refreshToken={refreshToken}
                    onOpenChart={onOpenChart}
                />
            </div>

            <AssetWatchlistPanel
                activeWatchlistId={activeWatchlistId}
                onActiveWatchlistChange={setActiveWatchlistId}
                onOpenRanking={setRankingMode}
                onOpenChart={onOpenChart}
                refreshToken={refreshToken}
                onWatchlistDataChanged={() => setRefreshToken(t => t + 1)}
            />

            {rankingMode && (
                <AssetRankingTable
                    mode={rankingMode}
                    activeWatchlistId={activeWatchlistId}
                    onClose={() => setRankingMode(null)}
                    onAdded={() => setRefreshToken(t => t + 1)}
                    onOpenChart={onOpenChart}
                />
            )}

            {onboardOpen && (
                <AssetOnboardingModal
                    onClose={() => setOnboardOpen(false)}
                    onOnboarded={() => setRefreshToken(t => t + 1)}
                />
            )}
        </div>
    );
}
