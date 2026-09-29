-- BuyList tab (between Watchlist and Dip Finder) -- a single flat list of tickers
-- you're watching as buy candidates, with a manually-entered target entry price.
-- Everything else (Mkt Cap, Current Price, 52-Week High) is auto-fetched at query
-- time from PriceHistory/FundamentalMetrics, same join pattern as
-- /api/fundamentals-page and /api/asset-rankings.
PRAGMA foreign_keys = ON;

CREATE TABLE BuyList (
    TickerSymbol    TEXT PRIMARY KEY REFERENCES Companies(TickerSymbol),
    EntryPrice      REAL,
    Notes           TEXT,
    CreatedAt       TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       TEXT DEFAULT CURRENT_TIMESTAMP
);
