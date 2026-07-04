-- Portfolio tab: accounts, holdings snapshot, and a transaction ledger.
-- Applied once against data/CommoditiesStockAnalysis.db (see schema.sql for the base schema,
-- and 002_watchlist_dividends_rankings.sql for Dividends/Companies/PriceHistory this joins against).
--
-- Design notes:
--   - PortfolioHoldings is the editable "current state" row backing the main Portfolio Tab
--     list (Basis Price, Current Shares, HoldingsCount, Distribution/Yr, Status, Tax Form are
--     all directly editable per the feature spec). Current Price, Value, % of Holdings,
--     Yield %, and Annual Income are NOT stored here -- they're computed at query time by
--     joining PriceHistory (latest close) and Dividends (trailing 12mo sum), same pattern as
--     AssetRankings' live joins in the Watchlist tab.
--   - HoldingsCount ("# of Holdings") is a plain user-entered integer describing how many
--     underlying positions the ticker itself represents -- 1 for an individual stock, or the
--     number of constituent holdings for an ETF (e.g. 25, 50). It is not a count of the user's
--     own purchase lots -- confirmed with user.
--   - PortfolioTransactions is a ledger of actual buy/sell/dividend events entered via the
--     "Ticker Data Entry" screen. It drives the Performance Tracker's monthly dividend totals;
--     it is intentionally separate from the Dividends table (market-wide ex-dividend schedule)
--     since it records what the user actually received/did, not the market schedule.
PRAGMA foreign_keys = ON;

-- ============================================================================
-- PortfolioAccounts
-- ============================================================================
CREATE TABLE PortfolioAccounts (
    AccountID       INTEGER PRIMARY KEY,
    Name            TEXT NOT NULL UNIQUE,
    CreatedAt       TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PortfolioHoldings -- one row per (Account, Ticker); backs the main Portfolio Tab list
-- ============================================================================
CREATE TABLE PortfolioHoldings (
    HoldingID           INTEGER PRIMARY KEY,
    AccountID           INTEGER NOT NULL REFERENCES PortfolioAccounts(AccountID) ON DELETE CASCADE,
    TickerSymbol        TEXT NOT NULL REFERENCES Companies(TickerSymbol),

    AllocationPct       REAL,       -- target allocation %
    BasisPrice          REAL,       -- blended average cost basis price
    CurrentShares       REAL NOT NULL DEFAULT 0,
    SharesToHold        REAL,       -- target share count
    HoldingsCount       INTEGER DEFAULT 1,   -- "# of Holdings" -- 1 for a stock, or # of constituent holdings for an ETF
    DistributionPerYear REAL,       -- manual override; UI defaults this from Dividends trailing-12mo sum
    Status              TEXT DEFAULT 'Active',   -- free text, e.g. Active / Watching / Closed
    TaxForm             TEXT,       -- free text, e.g. 1099-DIV, 1099-B, K-1

    CreatedAt           TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt           TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (AccountID, TickerSymbol)
);

CREATE INDEX IX_PortfolioHoldings_AccountID    ON PortfolioHoldings (AccountID);
CREATE INDEX IX_PortfolioHoldings_TickerSymbol ON PortfolioHoldings (TickerSymbol);

-- ============================================================================
-- PortfolioTransactions -- ledger entered via the Ticker Data Entry screen.
-- Feeds the Performance Tracker (monthly/annual dividend totals) and the
-- current/previous-month/YTD views on that same screen.
-- ============================================================================
CREATE TABLE PortfolioTransactions (
    TransactionID       INTEGER PRIMARY KEY,
    AccountID           INTEGER NOT NULL REFERENCES PortfolioAccounts(AccountID) ON DELETE CASCADE,
    TickerSymbol        TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    TransactionDate     TEXT NOT NULL,
    TransactionType     TEXT NOT NULL CHECK (TransactionType IN ('Bought', 'Sold', 'Dividend')),

    Shares              REAL,       -- Bought/Sold
    Price               REAL,       -- Bought/Sold
    DividendAmount      REAL,       -- Dividend

    CreatedAt           TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IX_PortfolioTransactions_Account_Ticker ON PortfolioTransactions (AccountID, TickerSymbol, TransactionDate DESC);
CREATE INDEX IX_PortfolioTransactions_Date           ON PortfolioTransactions (TransactionDate);
CREATE INDEX IX_PortfolioTransactions_Type_Date       ON PortfolioTransactions (TransactionType, TransactionDate);
