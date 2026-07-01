import csv
import os
import sys
import time
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional

import requests

import db

WATCHLIST_FILE = os.getenv("INDEX_WATCHLIST_FILE", "indexes.csv")
PREV_URL = "https://api.massive.com/v2/aggs/ticker/{ticker}/prev"
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


def fetch_prev_bar(api_key: str, ticker: str) -> Optional[Dict]:
    session = requests.Session()
    url = PREV_URL.format(ticker=ticker)
    params = {"adjusted": "true", "apiKey": api_key}

    try:
        resp = get_with_backoff(session, url, params)
    except requests.exceptions.HTTPError as e:
        # If Massive says 403 for this symbol, log and skip it
        resp = getattr(e, "response", None)
        status = resp.status_code if resp is not None else None
        if status == 403:
            print("  403 Forbidden for", ticker, "- not available on current plan, skipping.")
            return None
        # Re-raise other HTTP errors
        raise

    data = resp.json()

    results = data.get("results")
    if not results:
        return None

    if isinstance(results, list):
        bar = results[0] if results else None
    else:
        bar = results

    if not bar:
        return None

    ts = bar.get("t")
    trade_date = None
    if ts:
        trade_date = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).date()

    return {
        "TickerSymbol": ticker,
        "TradeDate": trade_date,
        "OpenPrice": bar.get("o"),
        "HighPrice": bar.get("h"),
        "LowPrice": bar.get("l"),
        "ClosePrice": bar.get("c"),
        "Volume": bar.get("v"),
        "VWAP": bar.get("vw"),
    }


def verify_companies_exist(conn, tickers: Iterable[str]) -> List[str]:
    tickers = list(tickers)
    if not tickers:
        return []
    cur = conn.cursor()
    placeholders = ",".join("?" for _ in tickers)
    sql = f"SELECT TickerSymbol FROM Companies WHERE TickerSymbol IN ({placeholders})"
    cur.execute(sql, tickers)
    found = {row[0] for row in cur.fetchall()}
    return [t for t in tickers if t in found]


def main():
    api_key = db.get_env("MASSIVE_API_KEY")
    tickers = load_watchlist(WATCHLIST_FILE)
    print(f"Loaded {len(tickers)} index tickers from {WATCHLIST_FILE}")

    conn = db.get_connection()
    try:
        existing = verify_companies_exist(conn, tickers)
        missing = [t for t in tickers if t not in existing]

        if missing:
            print("Skipping missing tickers not found in Companies:")
            for t in missing:
                print(f"  {t}")

        rows = []
        for idx, ticker in enumerate(existing, start=1):
            print(f"Fetching previous-day bar {idx}/{len(existing)} for {ticker}...")
            row = fetch_prev_bar(api_key, ticker)
            if row:
                rows.append(row)
            else:
                print(f"  No bar returned for {ticker}")
            if idx < len(existing):
                print(f"Sleeping {REQUEST_DELAY_SECONDS} seconds...")
                time.sleep(REQUEST_DELAY_SECONDS)

        print(f"Fetched {len(rows)} previous-day bars")

        if "--dry-run" in sys.argv:
            for r in rows:
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
            for r in rows
            if r.get("TradeDate")
        ]

        count = db.upsert_price_history(conn, price_rows)
        print(f"Upserted {count} rows into PriceHistory")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
