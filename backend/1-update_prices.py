import os
import time
import math
import logging
import datetime as dt
from logging.handlers import TimedRotatingFileHandler

import requests

import db

API_BASE_URL = os.getenv("MARKETDATA_BASE_URL", "https://api.marketdata.app")
API_KEY = os.getenv("MARKETDATA_API_KEY", os.getenv("API_KEY", ""))
TICKERS_FILE = os.getenv("TICKERS_FILE", "tickers.txt")
LOG_DIR = os.getenv("PRICE_UPDATE_LOG_DIR", "logs")

BACKFILL_START = dt.date(2000, 1, 1)
BASE_OVERLAP_DAYS = int(os.getenv("BASE_OVERLAP_DAYS", "7"))
SAFETY_DAYS = int(os.getenv("SAFETY_DAYS", "3"))
MAX_OVERLAP_DAYS = int(os.getenv("MAX_OVERLAP_DAYS", "60"))
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "5"))
BATCH_DELAY_SECONDS = int(os.getenv("BATCH_DELAY_SECONDS", "20"))
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "4"))


def setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    logger = logging.getLogger("price_updater")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = TimedRotatingFileHandler(
        filename=os.path.join(LOG_DIR, "update_prices.log"),
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


def load_tickers(path=TICKERS_FILE):
    if not os.path.exists(path):
        raise FileNotFoundError(f"Ticker file not found: {path}")

    tickers = []
    seen = set()

    with open(path, "r", encoding="utf-8") as f:
        for line_number, raw_line in enumerate(f, start=1):
            symbol = raw_line.strip().upper()
            if not symbol or symbol.startswith("#"):
                continue
            if len(symbol) > 10:
                logger.warning("Skipping invalid ticker on line %s: %s", line_number, symbol)
                continue
            if symbol not in seen:
                seen.add(symbol)
                tickers.append(symbol)

    return tickers


def get_last_date(conn, ticker):
    cur = conn.cursor()
    cur.execute(
        "SELECT MAX(PriceDate) FROM PriceHistory WHERE TickerSymbol = ?",
        (ticker,),
    )
    row = cur.fetchone()
    return dt.date.fromisoformat(row[0]) if row and row[0] else None


def get_fetch_window(last_date, today=None):
    today = today or dt.date.today()
    end_date = today + dt.timedelta(days=1)

    if last_date is None:
        return BACKFILL_START, end_date, None, None

    gap_days = max(0, (today - last_date).days)
    effective_overlap = min(
        MAX_OVERLAP_DAYS,
        max(BASE_OVERLAP_DAYS, gap_days + SAFETY_DAYS),
    )
    start_date = max(BACKFILL_START, last_date - dt.timedelta(days=effective_overlap))
    return start_date, end_date, gap_days, effective_overlap


def build_headers():
    if not API_KEY:
        raise ValueError("MARKETDATA_API_KEY (or API_KEY) is not set")
    return {"Authorization": f"Bearer {API_KEY}"}


def fetch_prices_from_api(ticker, start_date, end_date):
    headers = build_headers()
    url = f"{API_BASE_URL}/v1/stocks/candles/D/{ticker}"
    params = {
        "from": start_date.isoformat(),
        "to": end_date.isoformat(),
    }

    for attempt in range(1, MAX_RETRIES + 1):
        resp = requests.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)

        if resp.status_code == 429:
            reset_epoch = resp.headers.get("X-Api-Ratelimit-Reset")
            retry_after = resp.headers.get("Retry-After")
            wait_seconds = None

            if retry_after:
                try:
                    wait_seconds = max(1, int(float(retry_after)))
                except ValueError:
                    wait_seconds = None

            if wait_seconds is None and reset_epoch:
                try:
                    wait_seconds = max(1, int(reset_epoch) - int(time.time()))
                except ValueError:
                    wait_seconds = None

            if wait_seconds is None:
                wait_seconds = min(60 * attempt, 300)

            logger.warning(
                "%s: rate limited on attempt %s/%s, waiting %ss",
                ticker,
                attempt,
                MAX_RETRIES,
                wait_seconds,
            )
            time.sleep(wait_seconds)
            continue

        resp.raise_for_status()
        data = resp.json()

        if data.get("s") != "ok":
            logger.warning("%s: API returned non-ok status: %s", ticker, data.get("s"))
            return [], resp.headers

        t_arr = data.get("t") or []
        o_arr = data.get("o") or []
        h_arr = data.get("h") or []
        l_arr = data.get("l") or []
        c_arr = data.get("c") or []
        v_arr = data.get("v") or []
        vw_arr = data.get("vw") or data.get("vwap") or []

        n = min(len(t_arr), len(o_arr), len(h_arr), len(l_arr), len(c_arr), len(v_arr))
        bars = []

        for i in range(n):
            ts = t_arr[i]
            price_date = dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).date()
            volume_val = v_arr[i]
            vwap_val = vw_arr[i] if i < len(vw_arr) else None

            bars.append(
                {
                    "date": price_date,
                    "open": float(o_arr[i]) if o_arr[i] is not None else None,
                    "high": float(h_arr[i]) if h_arr[i] is not None else None,
                    "low": float(l_arr[i]) if l_arr[i] is not None else None,
                    "close": float(c_arr[i]) if c_arr[i] is not None else None,
                    "volume": int(volume_val) if volume_val is not None and not (isinstance(volume_val, float) and math.isnan(volume_val)) else None,
                    "vwap": float(vwap_val) if vwap_val is not None and not (isinstance(vwap_val, float) and math.isnan(vwap_val)) else None,
                }
            )

        return bars, resp.headers

    raise requests.HTTPError(f"{ticker}: exceeded max retries after repeated 429 responses")


def delete_price_range(conn, ticker, start_date, end_date):
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM PriceHistory WHERE TickerSymbol = ? AND PriceDate >= ? AND PriceDate < ?",
        (ticker, start_date.isoformat(), end_date.isoformat()),
    )
    deleted = cur.rowcount if cur.rowcount != -1 else 0
    conn.commit()
    return deleted


def insert_prices(conn, ticker, bars):
    if not bars:
        return 0

    rows = [
        {
            "TickerSymbol": ticker,
            "PriceDate": b["date"].isoformat(),
            "OpenPrice": b["open"],
            "HighPrice": b["high"],
            "LowPrice": b["low"],
            "ClosePrice": b["close"],
            "Volume": b["volume"],
            "VWAP": b["vwap"],
        }
        for b in bars
    ]

    return db.upsert_price_history(conn, rows)


def process_ticker(conn, ticker):
    last_date = get_last_date(conn, ticker)
    start_date, end_date, gap_days, effective_overlap = get_fetch_window(last_date)

    logger.info(
        "%s: last_date=%s start=%s end=%s gap_days=%s overlap=%s",
        ticker,
        last_date,
        start_date,
        end_date,
        gap_days,
        effective_overlap,
    )

    bars, headers = fetch_prices_from_api(ticker, start_date, end_date)

    if not bars:
        logger.info("%s: no bars returned for requested window", ticker)
        return

    returned_start = min(bar["date"] for bar in bars)
    returned_end_exclusive = max(bar["date"] for bar in bars) + dt.timedelta(days=1)

    deleted = delete_price_range(conn, ticker, returned_start, returned_end_exclusive)
    inserted = insert_prices(conn, ticker, bars)
    new_last_date = get_last_date(conn, ticker)

    remaining = headers.get("X-Api-Ratelimit-Remaining") if headers else None
    consumed = headers.get("X-Api-Ratelimit-Consumed") if headers else None
    reset_epoch = headers.get("X-Api-Ratelimit-Reset") if headers else None

    logger.info(
        "%s: fetched=%s deleted=%s inserted=%s new_last_date=%s remaining=%s consumed=%s reset=%s",
        ticker,
        len(bars),
        deleted,
        inserted,
        new_last_date,
        remaining,
        consumed,
        reset_epoch,
    )


def batched(iterable, batch_size):
    for i in range(0, len(iterable), batch_size):
        yield iterable[i:i + batch_size]


def main():
    tickers = load_tickers()
    if not tickers:
        logger.warning("No tickers found in %s", TICKERS_FILE)
        return

    logger.info(
        "Starting price update for %s tickers using %s",
        len(tickers),
        TICKERS_FILE,
    )

    conn = db.get_connection()
    try:
        batches = list(batched(tickers, BATCH_SIZE))
        for batch_index, batch in enumerate(batches, start=1):
            logger.info("Processing batch %s/%s: %s", batch_index, len(batches), ", ".join(batch))

            for ticker in batch:
                try:
                    process_ticker(conn, ticker)
                except requests.HTTPError as e:
                    status = e.response.status_code if getattr(e, "response", None) is not None else "?"
                    logger.exception("%s: HTTP error %s", ticker, status)
                except Exception:
                    logger.exception("%s: unexpected error", ticker)

            if batch_index < len(batches):
                logger.info("Sleeping %ss before next batch", BATCH_DELAY_SECONDS)
                time.sleep(BATCH_DELAY_SECONDS)
    finally:
        conn.close()

    logger.info("Price update run complete")


if __name__ == "__main__":
    main()
