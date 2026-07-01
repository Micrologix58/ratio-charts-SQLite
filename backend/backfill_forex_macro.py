import csv
import sys
import time
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List

import requests

import db

TIMEOUT = 30
SLEEP_BETWEEN_TICKERS = 15
MAX_RETRIES = 3
FOREX_MACRO_CSV = "forex_macro.csv"


def get_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": "ratio-charts-backend/1.0"})
    return session


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
                delay = max(SLEEP_BETWEEN_TICKERS, int(retry_after))
            except ValueError:
                delay = SLEEP_BETWEEN_TICKERS
        else:
            delay = SLEEP_BETWEEN_TICKERS + 5

        print(f"429 rate limit hit. Sleeping {delay} seconds before retry {attempt}/{max_retries}...")
        time.sleep(delay)


def load_enabled_tickers(csv_path: str) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    with open(csv_path, "r", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ticker = (row.get("ticker") or "").strip()
            name = (row.get("name") or ticker).strip()
            enabled = (row.get("enabled") or "true").strip().lower()

            if not ticker:
                continue
            if enabled not in ("true", "1", "yes", "y"):
                continue

            rows.append({
                "ticker": ticker,
                "name": name
            })
    return rows


def fetch_daily_bars(session: requests.Session, api_key: str, ticker: str, start_date: str, end_date: str) -> List[Dict]:
    url = f"https://api.massive.com/v2/aggs/ticker/{ticker}/range/1/day/{start_date}/{end_date}"
    params = {
        "adjusted": "true",
        "sort": "asc",
        "limit": 5000,
        "apiKey": api_key,
    }

    resp = get_with_backoff(session, url, params)
    data = resp.json()
    return data.get("results", [])


def ms_to_date_str(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date().isoformat()


def build_price_rows(ticker: str, bars: List[Dict]) -> List[Dict]:
    rows: List[Dict] = []

    for bar in bars:
        price_date = ms_to_date_str(bar["t"])
        rows.append({
            "TickerSymbol": ticker,
            "PriceDate": price_date,
            "OpenPrice": bar.get("o"),
            "HighPrice": bar.get("h"),
            "LowPrice": bar.get("l"),
            "ClosePrice": bar.get("c"),
            "Volume": bar.get("v", 0),
            "VWAP": bar.get("vw"),
        })

    return rows


def main():
    api_key = db.get_env("MASSIVE_API_KEY")
    tickers = load_enabled_tickers(FOREX_MACRO_CSV)

    if not tickers:
        print("No enabled forex macro tickers found.")
        return

    print(f"Loaded {len(tickers)} forex macro tickers from {FOREX_MACRO_CSV}")

    # 1-year window (365 days back from today)
    end_date = date.today().isoformat()
    start_date = (date.today() - timedelta(days=365)).isoformat()
    dry_run = "--dry-run" in sys.argv

    print(f"Backfilling from {start_date} to {end_date}")

    session = get_session()
    total_rows = 0
    conn = None if dry_run else db.get_connection()

    try:
        for i, item in enumerate(tickers, start=1):
            ticker = item["ticker"]
            name = item["name"]

            print(f"Fetching daily bars {i}/{len(tickers)} for {ticker} ({name})...")

            try:
                bars = fetch_daily_bars(session, api_key, ticker, start_date, end_date)
                print(f"  Retrieved {len(bars)} bars for {ticker}")

                rows = build_price_rows(ticker, bars)

                if dry_run:
                    for sample in rows[:3]:
                        print("  ", sample)
                else:
                    inserted = db.upsert_price_history(conn, rows)
                    print(f"  Upserted {inserted} rows for {ticker}")
                    total_rows += inserted

            except requests.HTTPError as e:
                status = e.response.status_code if e.response is not None else "?"
                body = e.response.text[:500] if e.response is not None else ""
                print(f"  ERROR for {ticker}: HTTP {status} - {body}")
            except Exception as e:
                print(f"  ERROR for {ticker}: {e}")

            if i < len(tickers):
                print(f"Sleeping {SLEEP_BETWEEN_TICKERS} seconds before next ticker...")
                time.sleep(SLEEP_BETWEEN_TICKERS)
    finally:
        if conn is not None:
            conn.close()

    if not dry_run:
        print(f"Total rows upserted: {total_rows}")


if __name__ == "__main__":
    main()
