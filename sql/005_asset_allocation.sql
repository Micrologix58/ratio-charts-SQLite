-- Home tab right pane: net-worth Asset Allocation (Stocks/Metals/Real Estate/
-- Annuities/Cash/Bitcoin/Collectibles), collected monthly so trend/history
-- builds up over time. One row per (month, category); % and Net Worth total
-- are computed at query time, not stored.
--
-- The "current" snapshot shown on the Home tab is NOT simply "the latest
-- AsOfMonth's rows" -- it's each category's most recent value independently
-- (see the API query), so editing only one category mid-month doesn't drop
-- the others from the display while they wait for their own next update.
PRAGMA foreign_keys = ON;

CREATE TABLE AssetAllocationHistory (
    AllocationID    INTEGER PRIMARY KEY,
    AsOfMonth       TEXT NOT NULL,      -- 'YYYY-MM-01'
    CategoryName    TEXT NOT NULL,
    AmountUSD       REAL NOT NULL DEFAULT 0,
    SortOrder       INTEGER NOT NULL,
    CreatedAt       TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (AsOfMonth, CategoryName)
);

CREATE INDEX idx_AssetAllocationHistory_Category_Month ON AssetAllocationHistory (CategoryName, AsOfMonth DESC);

INSERT INTO AssetAllocationHistory (AsOfMonth, CategoryName, AmountUSD, SortOrder) VALUES
    ('2026-07-01', 'Stocks',       1946000, 1),
    ('2026-07-01', 'Metals',        800000, 2),
    ('2026-07-01', 'Real Estate',   650000, 3),
    ('2026-07-01', 'Annuities',     594000, 4),
    ('2026-07-01', 'Cash',          350000, 5),
    ('2026-07-01', 'Bitcoin',         2000, 6),
    ('2026-07-01', 'Collectibles',   10000, 7);
