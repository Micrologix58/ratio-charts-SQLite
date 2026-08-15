import time
from typing import Dict, List, Optional

import requests

import db

API_BASE = "https://api.massive.com/v3/reference/tickers"
TIMEOUT = 30
SLEEP_BETWEEN_TICKERS = 15

FOREX_MACRO_TICKERS = [
    "C:XAUUSD",
    "C:XAGUSD",
    "C:EURUSD",
    "C:GBPUSD",
    "C:USDJPY",
    "C:USDCAD",
    "C:AUDUSD",
]


def fetch_ticker_metadata(api_key: str, ticker: str) -> Optional[Dict]:
    params = {
        "ticker": ticker,
        "apiKey": api_key,
        "limit": 1,
    }
    resp = requests.get(API_BASE, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    results = data.get("results", [])
    if not results:
        print(f"No metadata found for {ticker}")
        return None
    return results[0]


def main():
    api_key = db.get_env("MASSIVE_API_KEY")
    conn = db.get_connection()
    total = 0

    try:
        for i, ticker in enumerate(FOREX_MACRO_TICKERS, start=1):
            print(f"Fetching metadata for {ticker}...")
            try:
                meta = fetch_ticker_metadata(api_key, ticker)
            except requests.HTTPError as e:
                status = e.response.status_code if e.response is not None else "?"
                print(f"  ERROR for {ticker}: HTTP {status}, skipping")
                meta = None

            if meta:
                name = (meta.get("name") or ticker)[:255]
                market = (meta.get("market") or "forex")[:20]
                locale = (meta.get("locale") or "")[:10] or None
                active = 1 if meta.get("active") else 0
                source_feed = (meta.get("source_feed") or "")[:50] or None

                total += db.upsert_companies(conn, [{
                    "TickerSymbol": ticker,
                    "CompanyName": name,
                    "Market": market,
                    "AssetType": "forex",
                    "Locale": locale,
                    "Active": active,
                    "SourceFeed": source_feed,
                    "Provider": "massive",
                }])

            if i < len(FOREX_MACRO_TICKERS):
                time.sleep(SLEEP_BETWEEN_TICKERS)
    finally:
        conn.close()

    print(f"Upserted {total} forex macro records into Companies")


if __name__ == "__main__":
    main()
