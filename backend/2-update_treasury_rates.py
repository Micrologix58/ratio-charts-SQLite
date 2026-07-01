import sys
from datetime import date, timedelta
from typing import Dict, List

import requests

import db

TIMEOUT = 30
API_URL = "https://api.massive.com/fed/v1/treasury-yields"

RATE_MAP = {
    "US2YR": "yield_2_year",
    "US10YR": "yield_10_year",
    "US30YR": "yield_30_year",
}


def fetch_treasury_yields(api_key: str, start_date: str, end_date: str) -> List[Dict]:
    params = {
        "limit": 50000,
        "sort": "date.asc",
        "apiKey": api_key,
    }

    rows: List[Dict] = []
    next_url = API_URL
    session = requests.Session()

    while next_url:
        if next_url == API_URL:
            resp = session.get(next_url, params=params, timeout=TIMEOUT)
        else:
            resp = session.get(next_url, params={"apiKey": api_key}, timeout=TIMEOUT)

        resp.raise_for_status()
        data = resp.json()

        for item in data.get("results", []):
            obs_date = item.get("date")
            if not obs_date:
                continue
            if start_date <= obs_date <= end_date:
                rows.append(item)

        next_url = data.get("next_url")

    return rows


def build_price_rows(yield_rows: List[Dict]) -> List[Dict]:
    rows: List[Dict] = []

    for item in yield_rows:
        price_date = item["date"]

        for ticker, field_name in RATE_MAP.items():
            value = item.get(field_name)
            if value is None:
                continue

            rows.append({
                "TickerSymbol": ticker,
                "PriceDate": price_date,
                "OpenPrice": value,
                "HighPrice": value,
                "LowPrice": value,
                "ClosePrice": value,
                "Volume": 0,
                "VWAP": None,
            })

    return rows


def main():
    api_key = db.get_env("MASSIVE_API_KEY")
    dry_run = "--dry-run" in sys.argv

    end_date = date.today().isoformat()
    start_date = (date.today() - timedelta(days=10)).isoformat()

    print(f"Fetching Treasury yields from {start_date} to {end_date}...")

    yield_rows = fetch_treasury_yields(api_key, start_date, end_date)
    print(f"Retrieved {len(yield_rows)} Treasury yield observations")

    rows = build_price_rows(yield_rows)
    print(f"Built {len(rows)} PriceHistory rows")

    if dry_run:
        for r in rows[:12]:
            print(r)
        return

    conn = db.get_connection()
    try:
        count = db.upsert_price_history(conn, rows)
    finally:
        conn.close()
    print(f"Upserted {count} Treasury yield rows into PriceHistory")


if __name__ == "__main__":
    main()
