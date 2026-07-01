from typing import Dict, List, Optional

import requests

import db

API_BASE = "https://api.massive.com/v3/reference/tickers"
TIMEOUT = 30

FOREX_MACRO_TICKERS = [
    "C:XAUUSD",
    "C:XAGUSD",
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
    rows: List[Dict] = []

    for ticker in FOREX_MACRO_TICKERS:
        print(f"Fetching metadata for {ticker}...")
        meta = fetch_ticker_metadata(api_key, ticker)
        if not meta:
            continue

        name = (meta.get("name") or ticker)[:255]
        market = (meta.get("market") or "forex")[:20]
        locale = (meta.get("locale") or "")[:10] or None
        active = 1 if meta.get("active") else 0
        source_feed = (meta.get("source_feed") or "")[:50] or None

        rows.append(
            {
                "TickerSymbol": ticker,
                "CompanyName": name,
                "Market": market,
                "AssetType": "forex",
                "Locale": locale,
                "Active": active,
                "SourceFeed": source_feed,
                "Provider": "massive",
            }
        )

    if not rows:
        print("No forex macro companies to upsert.")
        return

    conn = db.get_connection()
    try:
        count = db.upsert_companies(conn, rows)
    finally:
        conn.close()
    print(f"Upserted {count} forex macro records into Companies")


if __name__ == "__main__":
    main()
