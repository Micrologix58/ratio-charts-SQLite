import React, { useEffect, useState } from "react";
import { fetchNews, type NewsItem } from "./services/newsApi";

function formatRelativeTime(iso: string | null): string {
    if (!iso) return "";
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

function domainOf(url: string | null): string {
    if (!url) return "";
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

type Props = {
    title: string;
    symbols: string[];
    headerRight?: React.ReactNode;
};

export function NewsFeedPanel({ title, symbols, headerRight }: Props) {
    const [items, setItems] = useState<NewsItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const symbolsKey = symbols.join(",");

    useEffect(() => {
        if (symbols.length === 0) { setItems([]); setError(null); return; }
        let cancelled = false;
        setItems(null);
        setError(null);
        fetchNews(symbols)
            .then(data => { if (!cancelled) setItems(data); })
            .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load news"); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbolsKey]);

    return (
        <div style={{ padding: 24, color: "#94a3b8" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ color: "#e2e8f0", margin: 0 }}>{title}</h3>
                {headerRight}
            </div>

            {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
            {!error && symbols.length === 0 && <div style={{ fontSize: 12 }}>No symbols to show news for.</div>}
            {!error && symbols.length > 0 && items == null && <div style={{ fontSize: 12 }}>Loading…</div>}
            {!error && items != null && items.length === 0 && symbols.length > 0 && (
                <div style={{ fontSize: 12 }}>No recent news.</div>
            )}

            {items != null && items.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {items.map((item, i) => (
                        <a
                            key={`${item.symbol}-${i}`}
                            href={item.url ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: "block", textDecoration: "none",
                                borderBottom: "1px solid #1f1f1f", paddingBottom: 10,
                                cursor: item.url ? "pointer" : "default",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                                <span style={{ color: "#93c5fd", fontWeight: 600, fontSize: 12 }}>{item.symbol}</span>
                                <span style={{ color: "#555", fontSize: 11 }}>{domainOf(item.url)}</span>
                                <span style={{ color: "#555", fontSize: 11, marginLeft: "auto" }}>{formatRelativeTime(item.publicationDate)}</span>
                            </div>
                            <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.4 }}>{item.headline}</div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
