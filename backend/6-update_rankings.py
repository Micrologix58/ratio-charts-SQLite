import bisect
import datetime as dt
import logging
import os
from logging.handlers import TimedRotatingFileHandler

import db

LOG_DIR = os.getenv("RANKING_UPDATE_LOG_DIR", "logs")

STOCK_WEIGHT_PRICE = 0.6
STOCK_WEIGHT_YIELD = 0.4

ETF_WEIGHT_FULL_DRIP = 0.5
ETF_WEIGHT_YIELD = 0.3
ETF_WEIGHT_OPPORTUNITY = 0.2


def setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    logger = logging.getLogger("ranking_updater")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = TimedRotatingFileHandler(
        filename=os.path.join(LOG_DIR, "update_rankings.log"),
        when="midnight",
        interval=1,
        backupCount=30,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    return logger


logger = setup_logging()


def get_as_of_date(conn):
    cur = conn.cursor()
    cur.execute("SELECT MAX(PriceDate) FROM PriceHistory")
    return cur.fetchone()[0]


def get_eligible_tickers(conn):
    cur = conn.cursor()
    cur.execute(
        "SELECT TickerSymbol, UPPER(AssetType) FROM Companies WHERE UPPER(AssetType) IN ('STOCK', 'ETF')"
    )
    return cur.fetchall()


def get_price_on_or_before(conn, ticker, as_of):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT PriceDate, ClosePrice FROM PriceHistory
        WHERE TickerSymbol = ? AND PriceDate <= ? AND ClosePrice IS NOT NULL
        ORDER BY PriceDate DESC LIMIT 1
        """,
        (ticker, as_of),
    )
    row = cur.fetchone()
    return (row[0], row[1]) if row else (None, None)


def get_price_series(conn, ticker, start_date, end_date):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT PriceDate, ClosePrice FROM PriceHistory
        WHERE TickerSymbol = ? AND PriceDate >= ? AND PriceDate <= ? AND ClosePrice IS NOT NULL
        ORDER BY PriceDate ASC
        """,
        (ticker, start_date, end_date),
    )
    rows = cur.fetchall()
    return [r[0] for r in rows], {r[0]: r[1] for r in rows}


def get_trailing_dividends(conn, ticker, start_date, end_date):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT ExDividendDate, CashAmount FROM Dividends
        WHERE TickerSymbol = ? AND ExDividendDate > ? AND ExDividendDate <= ?
        ORDER BY ExDividendDate ASC
        """,
        (ticker, start_date, end_date),
    )
    return cur.fetchall()


def get_last_dividend(conn, ticker, as_of):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT ExDividendDate, CashAmount FROM Dividends
        WHERE TickerSymbol = ? AND ExDividendDate <= ?
        ORDER BY ExDividendDate DESC LIMIT 1
        """,
        (ticker, as_of),
    )
    row = cur.fetchone()
    return (row[0], row[1]) if row else (None, None)


def nearest_price_on_or_before(sorted_dates, price_by_date, target_date):
    idx = bisect.bisect_right(sorted_dates, target_date) - 1
    if idx < 0:
        return None
    return price_by_date[sorted_dates[idx]]


def compute_drip_returns(sorted_dates, price_by_date, start_price, end_price, dividend_events):
    total_cash_divs = sum(amt for _, amt in dividend_events)
    zero_drip_pct = ((end_price - start_price) + total_cash_divs) / start_price * 100

    shares = 1.0
    for ex_date, cash_amount in dividend_events:
        px_on_ex = nearest_price_on_or_before(sorted_dates, price_by_date, ex_date)
        if px_on_ex is None:
            continue
        cash_received = shares * cash_amount
        shares += cash_received / px_on_ex
    full_drip_pct = (shares * end_price - start_price) / start_price * 100

    return full_drip_pct, zero_drip_pct, total_cash_divs


def percentile_ranks(values):
    n = len(values)
    if n == 0:
        return []
    order = sorted(range(n), key=lambda i: values[i])
    ranks = [0.0] * n
    for pos, i in enumerate(order):
        ranks[i] = pos / (n - 1) if n > 1 else 1.0
    return ranks


def quintile_ranks(values):
    n = len(values)
    if n == 0:
        return []
    order = sorted(range(n), key=lambda i: values[i])
    ranks = [1] * n
    for pos, i in enumerate(order):
        bucket = int(pos * 5 / n) + 1
        ranks[i] = min(bucket, 5)
    return ranks


def main():
    conn = db.get_connection()
    try:
        as_of = get_as_of_date(conn)
        if not as_of:
            logger.warning("No PriceHistory data found, aborting")
            return
        as_of_date = dt.date.fromisoformat(as_of)
        year_ago_date = (as_of_date - dt.timedelta(days=365)).isoformat()
        logger.info("Computing rankings as of %s (1yr ago = %s)", as_of, year_ago_date)

        tickers = get_eligible_tickers(conn)
        logger.info("Eligible stock/ETF tickers: %s", len(tickers))

        metrics = {}
        for ticker, asset_type in tickers:
            latest_date, latest_close = get_price_on_or_before(conn, ticker, as_of)
            year_ago_close_date, year_ago_close = get_price_on_or_before(conn, ticker, year_ago_date)

            if latest_close is None or year_ago_close is None or year_ago_close == 0:
                logger.info("%s: insufficient price history, excluding from rankings", ticker)
                continue

            price_appr_pct = (latest_close - year_ago_close) / year_ago_close * 100

            dividend_events = get_trailing_dividends(conn, ticker, year_ago_date, as_of)
            trailing_annual_dividend = sum(amt for _, amt in dividend_events)
            dividend_yield_pct = (trailing_annual_dividend / latest_close * 100) if latest_close else 0.0
            last_div_date, last_div_amount = get_last_dividend(conn, ticker, as_of)

            row = {
                "TickerSymbol": ticker,
                "AssetType": asset_type,
                "AsOfDate": as_of,
                "LatestClose": latest_close,
                "Close1yrAgo": year_ago_close,
                "Price1yrApprPct": price_appr_pct,
                "TrailingAnnualDividend": trailing_annual_dividend,
                "DividendYieldPct": dividend_yield_pct,
                "LastDividendAmount": last_div_amount,
                "LastDividendExDate": last_div_date,
                "FullDripReturnPct": None,
                "ZeroDripReturnPct": None,
                "AverageYieldPct": None,
                "DripOpportunityPct": None,
                "DripScore": None,
                "OpportunityRank": None,
                "StockCompositeRaw": None,
                "StockRank": None,
            }

            if asset_type == "ETF":
                sorted_dates, price_by_date = get_price_series(conn, ticker, year_ago_date, as_of)
                if sorted_dates:
                    full_drip, zero_drip, _ = compute_drip_returns(
                        sorted_dates, price_by_date, year_ago_close, latest_close, dividend_events
                    )
                    row["FullDripReturnPct"] = full_drip
                    row["ZeroDripReturnPct"] = zero_drip
                    row["AverageYieldPct"] = dividend_yield_pct
                    row["DripOpportunityPct"] = full_drip - zero_drip

            metrics[ticker] = row

        stock_tickers = [t for t, r in metrics.items() if r["AssetType"] == "STOCK"]
        etf_tickers = [t for t, r in metrics.items() if r["AssetType"] == "ETF" and r["FullDripReturnPct"] is not None]

        if stock_tickers:
            price_vals = [metrics[t]["Price1yrApprPct"] for t in stock_tickers]
            yield_vals = [metrics[t]["DividendYieldPct"] for t in stock_tickers]
            pr_price = percentile_ranks(price_vals)
            pr_yield = percentile_ranks(yield_vals)
            composites = [
                STOCK_WEIGHT_PRICE * pr_price[i] + STOCK_WEIGHT_YIELD * pr_yield[i]
                for i in range(len(stock_tickers))
            ]
            ranks = quintile_ranks(composites)
            for i, t in enumerate(stock_tickers):
                metrics[t]["StockCompositeRaw"] = composites[i]
                metrics[t]["StockRank"] = ranks[i]

        if etf_tickers:
            full_vals = [metrics[t]["FullDripReturnPct"] for t in etf_tickers]
            yield_vals = [metrics[t]["AverageYieldPct"] for t in etf_tickers]
            opp_vals = [metrics[t]["DripOpportunityPct"] for t in etf_tickers]
            pr_full = percentile_ranks(full_vals)
            pr_yield = percentile_ranks(yield_vals)
            pr_opp = percentile_ranks(opp_vals)
            scores = [
                ETF_WEIGHT_FULL_DRIP * pr_full[i]
                + ETF_WEIGHT_YIELD * pr_yield[i]
                + ETF_WEIGHT_OPPORTUNITY * pr_opp[i]
                for i in range(len(etf_tickers))
            ]
            ranks = quintile_ranks(scores)
            for i, t in enumerate(etf_tickers):
                metrics[t]["DripScore"] = scores[i]
                metrics[t]["OpportunityRank"] = ranks[i]

        rows = list(metrics.values())
        logger.info(
            "Computed metrics for %s tickers (%s stocks ranked, %s ETFs ranked)",
            len(rows),
            len(stock_tickers),
            len(etf_tickers),
        )

        cur = conn.cursor()
        cur.execute("DELETE FROM AssetRankings")
        cur.executemany(
            """
            INSERT INTO AssetRankings (
                TickerSymbol, AssetType, AsOfDate,
                LatestClose, Close1yrAgo, Price1yrApprPct,
                TrailingAnnualDividend, DividendYieldPct, LastDividendAmount, LastDividendExDate,
                FullDripReturnPct, ZeroDripReturnPct, AverageYieldPct, DripOpportunityPct, DripScore, OpportunityRank,
                StockCompositeRaw, StockRank
            ) VALUES (
                :TickerSymbol, :AssetType, :AsOfDate,
                :LatestClose, :Close1yrAgo, :Price1yrApprPct,
                :TrailingAnnualDividend, :DividendYieldPct, :LastDividendAmount, :LastDividendExDate,
                :FullDripReturnPct, :ZeroDripReturnPct, :AverageYieldPct, :DripOpportunityPct, :DripScore, :OpportunityRank,
                :StockCompositeRaw, :StockRank
            )
            """,
            rows,
        )
        conn.commit()
        logger.info("AssetRankings replaced with %s rows", len(rows))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
