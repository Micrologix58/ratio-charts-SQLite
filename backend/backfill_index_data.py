import csv
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List

import requests

import db

WATCHLIST_FILE = os.getenv("INDEX_WATCHLIST_FILE", "indexes.csv")
RANGE_URL = "https://api.massive.com/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{start}/{end}"
TIMEOUT = 30
REQUEST_DELAY_SECONDS = 15
MAX_RETRIES = 3


def load_watchlist(path: str) -> List[str]:
    tickers: List[str] = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ticker = (row.get("TickerSymbol") or "").strip()
            if ticker:
                tickers.append(ticker)
    return tickers


def get_with_backoff(session: requests.Session, url: str, params: Dict, max_retries: int = MAX_RETRIES):
    attempt = 0
    while True:
        resp = session.get(url, params=params, timeout=TIMEOUT)
        if resp.status_code != 429:
            resp.raise_for_status()
            return resp
        attempt += 1
        if attempt > max_retries:
            resp.raise_for_status()
        retry_after = resp.headers.get("Retry-After")
        if retry_after:
            try:
                delay = max(REQUEST_DELAY_SECONDS, int(retry_after))
            except ValueError:
                delay = REQUEST_DELAY_SECONDS
        else:
            delay = REQUEST_DELAY_SECONDS + 5
        print(f"429 rate limit hit. Sleeping {delay} seconds before retry {attempt}/{max_retries}...")
        time.sleep(delay)


def fetch_range_bars(api_key: str, ticker: str, start: date, end: date) -> List[Dict]:
    session = requests.Session()
    url = RANGE_URL.format(
        ticker=ticker,
        multiplier=1,
        timespan="day",
        start=start.isoformat(),
        end=end.isoformat(),
    )
    params = {
        "market": "indices",
        "adjusted": "true",
        "apiKey": api_key,
    }

    try:
        resp = get_with_backoff(session, url, params)
    except requests.exceptions.HTTPError as e:
        resp = getattr(e, "response", None)
        status = resp.status_code if resp is not None else None
        if status == 403:
            print(f"  403 Forbidden for {ticker} - range bars not available on current plan, skipping.")
            return []
        raise

    data = resp.json()
    results = data.get("results") or []
    bars: List[Dict] = []

    for bar in results:
        ts = bar.get("t")
        trade_date = None
        if ts:
            trade_date = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).date()

        bars.append(
            {
                "TickerSymbol": ticker,
                "TradeDate": trade_date,
                "OpenPrice": bar.get("o"),
                "HighPrice": bar.get("h"),
                "LowPrice": bar.get("l"),
                "ClosePrice": bar.get("c"),
                "Volume": bar.get("v"),
                "VWAP": bar.get("vw"),
            }
        )

    return bars


def main():
    api_key = db.get_env("MASSIVE_API_KEY")
    tickers = load_watchlist(WATCHLIST_FILE)
    print(f"Loaded {len(tickers)} index tickers from {WATCHLIST_FILE}")

    # Last 365 days: from (today - 365) to today
    end_date = date.today()
    start_date = end_date - timedelta(days=365)
    print(f"Backfilling from {start_date} to {end_date}")

    all_rows: List[Dict] = []

    for idx, ticker in enumerate(tickers, start=1):
        print(f"Fetching range bars {idx}/{len(tickers)} for {ticker}...")
        bars = fetch_range_bars(api_key, ticker, start_date, end_date)
        print(f"  Retrieved {len(bars)} bars for {ticker}")
        all_rows.extend(bars)
        if idx < len(tickers):
            print(f"Sleeping {REQUEST_DELAY_SECONDS} seconds before next ticker...")
            time.sleep(REQUEST_DELAY_SECONDS)

    print(f"Total bars fetched: {len(all_rows)}")

    if "--dry-run" in sys.argv:
        for r in all_rows[:10]:
            print(r)
        return

    price_rows = [
        {
            "TickerSymbol": r["TickerSymbol"],
            "PriceDate": r["TradeDate"].isoformat(),
            "OpenPrice": r["OpenPrice"],
            "HighPrice": r["HighPrice"],
            "LowPrice": r["LowPrice"],
            "ClosePrice": r["ClosePrice"],
            "Volume": r["Volume"],
            "VWAP": r["VWAP"],
        }
        for r in all_rows
        if r.get("TradeDate")
    ]

    conn = db.get_connection()
    try:
        count = db.upsert_price_history(conn, price_rows)
    finally:
        conn.close()
    print(f"Upserted {count} rows into PriceHistory")


if __name__ == "__main__":
    main()
