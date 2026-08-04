-- Chart tab fundamentals strip (Market Cap, EPS, P/E Ratio, 52-Week Range) shown
-- below each single-ticker chart. EAV-style table so new metrics can be added later
-- without another migration -- one row per (ticker, date, metric name).
--
-- Populated by 7-update_fundamentals.py:
--   - 52WeekHigh / 52WeekLow  <- marketdata.app quotes endpoint
--   - EPS_TTM / PE_Ratio      <- marketdata.app earnings endpoint (trailing 4 reported quarters)
--   - MarketCapUSD            <- finnhub.io (marketdata.app has no market cap / shares outstanding data)
PRAGMA foreign_keys = ON;

CREATE TABLE FundamentalMetrics (
    MetricID        INTEGER PRIMARY KEY,
    TickerSymbol    TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    MetricDate      TEXT NOT NULL,
    MetricName      TEXT NOT NULL,
    MetricValue     REAL,
    DataSource      TEXT,
    LastUpdated     TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (TickerSymbol, MetricDate, MetricName)
);

CREATE INDEX idx_FundamentalMetrics_MetricName ON FundamentalMetrics (MetricName);
CREATE INDEX idx_FundamentalMetrics_Ticker_Date ON FundamentalMetrics (TickerSymbol, MetricDate DESC);
