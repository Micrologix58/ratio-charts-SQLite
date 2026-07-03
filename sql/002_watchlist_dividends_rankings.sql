-- Watchlist tab additions: asset watchlists, dividend history, and precomputed rankings.
-- Applied once against data/CommoditiesStockAnalysis.db (see schema.sql for the base schema).
--
-- AssetWatchlists/AssetWatchlistEntries are a separate SQLite-backed store from
-- charts/watchlists.json (the Chart tab's file-based sidebar watchlists) -- the two
-- are intentionally not merged.
PRAGMA foreign_keys = ON;

-- ============================================================================
-- AssetWatchlists / AssetWatchlistEntries
-- ============================================================================
CREATE TABLE AssetWatchlists (
    WatchlistID     INTEGER PRIMARY KEY,
    Name            TEXT NOT NULL,
    CreatedAt       TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE AssetWatchlistEntries (
    EntryID         INTEGER PRIMARY KEY,
    WatchlistID     INTEGER NOT NULL REFERENCES AssetWatchlists(WatchlistID) ON DELETE CASCADE,
    TickerSymbol    TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    AddedAt         TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (WatchlistID, TickerSymbol)
);

CREATE INDEX IX_AssetWatchlistEntries_WatchlistID ON AssetWatchlistEntries (WatchlistID);
CREATE INDEX IX_AssetWatchlistEntries_TickerSymbol ON AssetWatchlistEntries (TickerSymbol);

-- ============================================================================
-- Dividends (new -- no dividend/distribution data existed before this)
-- ============================================================================
CREATE TABLE Dividends (
    DividendID          INTEGER PRIMARY KEY,
    TickerSymbol        TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    ExDividendDate      TEXT NOT NULL,
    PayDate             TEXT,
    RecordDate          TEXT,
    DeclarationDate     TEXT,
    CashAmount          REAL NOT NULL,
    Frequency           INTEGER,      -- Polygon convention: 0=irregular,1=annual,2=semi,4=quarterly,12=monthly
    DividendType        TEXT,
    Currency            TEXT DEFAULT 'USD',
    LastUpdated         TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (TickerSymbol, ExDividendDate, DividendType)
);

CREATE INDEX IX_Dividends_Ticker_ExDate ON Dividends (TickerSymbol, ExDividendDate DESC);

-- ============================================================================
-- AssetRankings -- precomputed nightly by backend/6-update_rankings.py.
-- Full-table replace each run (ranking is a whole-cohort relative computation,
-- so there's no meaningful "incremental" update).
-- ============================================================================
CREATE TABLE AssetRankings (
    TickerSymbol            TEXT PRIMARY KEY REFERENCES Companies(TickerSymbol),
    AssetType               TEXT NOT NULL,   -- normalized 'STOCK' or 'ETF'
    AsOfDate                TEXT NOT NULL,

    LatestClose             REAL,
    Close1yrAgo             REAL,
    Price1yrApprPct         REAL,

    TrailingAnnualDividend  REAL,
    DividendYieldPct        REAL,
    LastDividendAmount      REAL,
    LastDividendExDate      TEXT,

    FullDripReturnPct       REAL,
    ZeroDripReturnPct       REAL,
    AverageYieldPct         REAL,
    DripOpportunityPct      REAL,
    DripScore               REAL,
    OpportunityRank         INTEGER,   -- 1-5, 5=best (ETFs)

    StockCompositeRaw       REAL,
    StockRank               INTEGER,   -- 1-5, 5=best (stocks)

    ComputedAt              TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IX_AssetRankings_AssetType_StockRank ON AssetRankings (AssetType, StockRank DESC);
CREATE INDEX IX_AssetRankings_AssetType_OppRank   ON AssetRankings (AssetType, OpportunityRank DESC);
