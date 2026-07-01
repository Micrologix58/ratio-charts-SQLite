import os
import sqlite3
from pathlib import Path
from typing import Dict, Iterable, Optional

from dotenv import load_dotenv

load_dotenv()

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "CommoditiesStockAnalysis.db"
DB_PATH = os.getenv("SQLITE_DB_PATH") or str(DEFAULT_DB_PATH)


def get_env(name: str, required: bool = True, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name, default)
    if required and not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def upsert_companies(conn: sqlite3.Connection, rows: Iterable[Dict]) -> int:
    rows = list(rows)
    if not rows:
        return 0

    sql = """
    INSERT INTO Companies
        (TickerSymbol, CompanyName, Market, AssetType, Locale, Active, SourceFeed, Provider, CreatedAt, UpdatedAt)
    VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(TickerSymbol) DO UPDATE SET
        CompanyName = excluded.CompanyName,
        Market = excluded.Market,
        AssetType = excluded.AssetType,
        Locale = excluded.Locale,
        Active = excluded.Active,
        SourceFeed = excluded.SourceFeed,
        Provider = excluded.Provider,
        UpdatedAt = CURRENT_TIMESTAMP
    """

    cur = conn.cursor()
    for r in rows:
        cur.execute(
            sql,
            (
                r["TickerSymbol"],
                r["CompanyName"],
                r["Market"],
                r["AssetType"],
                r["Locale"],
                r["Active"],
                r["SourceFeed"],
                r["Provider"],
            ),
        )
    conn.commit()
    return len(rows)


def upsert_price_history(conn: sqlite3.Connection, rows: Iterable[Dict]) -> int:
    rows = list(rows)
    if not rows:
        return 0

    sql = """
    INSERT INTO PriceHistory
        (TickerSymbol, PriceDate, OpenPrice, HighPrice, LowPrice, ClosePrice, Volume, VWAP, LastUpdated)
    VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(TickerSymbol, PriceDate) DO UPDATE SET
        OpenPrice = excluded.OpenPrice,
        HighPrice = excluded.HighPrice,
        LowPrice = excluded.LowPrice,
        ClosePrice = excluded.ClosePrice,
        Volume = excluded.Volume,
        VWAP = excluded.VWAP,
        LastUpdated = CURRENT_TIMESTAMP
    """

    cur = conn.cursor()
    for r in rows:
        cur.execute(
            sql,
            (
                r["TickerSymbol"],
                r["PriceDate"],
                r.get("OpenPrice"),
                r.get("HighPrice"),
                r.get("LowPrice"),
                r["ClosePrice"],
                r.get("Volume"),
                r.get("VWAP"),
            ),
        )
    conn.commit()
    return len(rows)
