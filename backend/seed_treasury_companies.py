"""
Seeds the synthetic Treasury yield tickers used by 2-update_treasury_rates.py
and backfill_treasury_rates.py (RATE_MAP) into Companies. These aren't real
tradable tickers on massive.com -- they're labels the treasury scripts invent
to store yield series in PriceHistory -- so nothing else populates Companies
for them, and PriceHistory's foreign key would otherwise reject every
treasury upsert.
"""
import sys

import db

TREASURY_TICKERS = [
    {"TickerSymbol": "US2YR", "CompanyName": "US 2 Year Treasury Yield"},
    {"TickerSymbol": "US10YR", "CompanyName": "US 10 Year Treasury Yield"},
    {"TickerSymbol": "US30YR", "CompanyName": "US 30 Year Treasury Yield"},
]


def main():
    rows = [
        {
            "TickerSymbol": t["TickerSymbol"],
            "CompanyName": t["CompanyName"],
            "Market": "bonds",
            "AssetType": "treasury_yield",
            "Locale": "us",
            "Active": 1,
            "SourceFeed": "fed_treasury_yields",
            "Provider": "massive",
        }
        for t in TREASURY_TICKERS
    ]

    if "--dry-run" in sys.argv:
        for r in rows:
            print(r)
        return

    conn = db.get_connection()
    try:
        count = db.upsert_companies(conn, rows)
    finally:
        conn.close()
    print(f"Upserted {count} Treasury ticker records into Companies")


if __name__ == "__main__":
    main()
