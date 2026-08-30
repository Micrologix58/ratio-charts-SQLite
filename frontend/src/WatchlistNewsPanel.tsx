import { useEffect, useState } from "react";
import { fetchAssetWatchlists, type AssetWatchlist } from "./services/assetWatchlistApi";
import { NewsFeedPanel } from "./NewsFeedPanel";

export function WatchlistNewsPanel() {
    const [watchlists, setWatchlists] = useState<AssetWatchlist[]>([]);
    const [activeId, setActiveId] = useState<number | null>(null);

    useEffect(() => {
        fetchAssetWatchlists()
            .then(lists => {
                setWatchlists(lists);
                setActiveId(prev => prev ?? lists[0]?.id ?? null);
            })
            .catch(() => setWatchlists([]));
    }, []);

    const active = watchlists.find(w => w.id === activeId);
    const symbols = active ? Array.from(new Set(active.entries.map(e => e.tickerSymbol))) : [];

    const selector = (
        <select
            value={activeId ?? ""}
            onChange={e => setActiveId(Number(e.target.value))}
            style={{
                background: "#1e1e1e", color: "#e2e8f0", border: "1px solid #3a3a3a",
                borderRadius: 4, padding: "4px 8px", fontSize: 12,
            }}
        >
            {watchlists.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
            ))}
        </select>
    );

    return <NewsFeedPanel title="Watchlist News" symbols={symbols} headerRight={selector} />;
}
