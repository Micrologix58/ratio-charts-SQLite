-- Fundamentals tab (between Allocation and Watchlist) -- a single-ticker research
-- worksheet. The left-side summary strip is auto-fetched (PriceHistory +
-- FundamentalMetrics + AssetRankings, see 004_fundamental_metrics.sql /
-- 002_watchlist_dividends_rankings.sql); everything below is manually entered
-- from analyst reports and persisted here, one row per ticker.
PRAGMA foreign_keys = ON;

CREATE TABLE CompanyResearch (
    TickerSymbol        TEXT PRIMARY KEY REFERENCES Companies(TickerSymbol),
    Recommendation       TEXT,       -- 'Buy' | 'Hold' | 'Sell'
    Score                REAL,       -- 0-10
    Debt                 REAL,
    NetDebt              REAL,
    ProductionCost       REAL,       -- $/BOE
    OneP                 REAL,       -- 1P reserves, MMBoe
    TwoP                 REAL,       -- 2P reserves, MMBoe
    Boepd2025            REAL,       -- 2025 production, BOE/d
    ProdLightPct         REAL,       -- production mix, % of total
    ProdMedHeavyPct      REAL,
    ProdNGLsPct          REAL,
    ProdGasPct           REAL,
    Growth60             TEXT,       -- estimated share price growth at $60 BOE, e.g. "+10%"
    Growth70             TEXT,
    Growth80             TEXT,
    Growth90             TEXT,
    Growth100            TEXT,
    EntryPriceBase       REAL,       -- 2-3yr base case entry price
    EntryPriceBull       REAL,       -- 2-3yr bull case entry price
    EntryPriceBagger     REAL,       -- "bagger" (multi-bagger) entry price
    CreatedAt            TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt            TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (Recommendation IS NULL OR Recommendation IN ('Buy', 'Hold', 'Sell')),
    CHECK (Score IS NULL OR (Score >= 0 AND Score <= 10))
);

-- Manually entered year-end figures behind the three 5-year bar charts
-- (Common Shares Outstanding, P/E, P/B). Not derived from FundamentalMetrics
-- since that table only ever holds the current snapshot per metric.
CREATE TABLE CompanyHistoricalFinancials (
    TickerSymbol         TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    FiscalYear           INTEGER NOT NULL,
    SharesOutstanding    REAL,
    PERatio              REAL,
    PBRatio              REAL,
    UpdatedAt            TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (TickerSymbol, FiscalYear)
);
