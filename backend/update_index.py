import csv
import os
import sys
from typing import Dict, List

import db

WATCHLIST_FILE = os.getenv("INDEX_WATCHLIST_FILE", "indexes.csv")


def load_watchlist(path: str) -> List[Dict]:
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ticker = (row.get("TickerSymbol") or "").strip()
            if not ticker:
                continue
            if len(ticker) > 10:
                continue
            rows.append(
                {
                    "TickerSymbol": ticker,
                    "CompanyName": ((row.get("CompanyName") or ticker).strip())[:255],
                    "Market": "index",
                    "AssetType": "index",
                    "Locale": ((row.get("Locale") or "global").strip())[:10],
                    "Active": 1,
                    "SourceFeed": ((row.get("SourceFeed") or "manual_watchlist").strip())[:50],
                    "Provider": ((row.get("Provider") or "massive").strip())[:20],
                }
            )
    return rows


def main():
    path = WATCHLIST_FILE
    rows = load_watchlist(path)
    print(f"Loaded {len(rows)} curated index rows from {path}")
    if "--dry-run" in sys.argv:
        for r in rows:
            print(r)
        return

    conn = db.get_connection()
    try:
        count = db.upsert_companies(conn, rows)
    finally:
        conn.close()
    print(f"Upserted {count} index records into Companies")


if __name__ == "__main__":
    main()
