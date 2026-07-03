import logging
import os
import time
from logging.handlers import TimedRotatingFileHandler

import requests

import db

API_BASE_URL = os.getenv("MASSIVE_BASE_URL", "https://api.massive.com")
LOG_DIR = os.getenv("DIVIDEND_UPDATE_LOG_DIR", "logs")
REQUEST_DELAY_SECONDS = int(os.getenv("REQUEST_DELAY_SECONDS", "15"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
PAGE_LIMIT = int(os.getenv("DIVIDEND_PAGE_LIMIT", "1000"))
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))


def setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    logger = logging.getLogger("dividend_updater")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = TimedRotatingFileHandler(
        filename=os.path.join(LOG_DIR, "update_dividends.log"),
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


def load_stock_etf_tickers(conn):
    cur = conn.cursor()
    cur.execute("SELECT TickerSymbol FROM Companies WHERE UPPER(AssetType) IN ('STOCK', 'ETF')")
    return [row[0] for row in cur.fetchall()]


def get_last_ex_date(conn, ticker):
    cur = conn.cursor()
    cur.execute("SELECT MAX(ExDividendDate) FROM Dividends WHERE TickerSymbol = ?", (ticker,))
    row = cur.fetchone()
    return row[0] if row and row[0] else None


def get_with_backoff(session, url, params):
    attempt = 0
    while True:
        resp = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 429:
            resp.raise_for_status()
            return resp
        attempt += 1
        if attempt > MAX_RETRIES:
            resp.raise_for_status()
        retry_after = resp.headers.get("Retry-After")
        if retry_after:
            try:
                delay = max(REQUEST_DELAY_SECONDS, int(retry_after))
            except ValueError:
                delay = REQUEST_DELAY_SECONDS
        else:
            delay = REQUEST_DELAY_SECONDS + 5
        logger.warning("429 rate limit hit, sleeping %ss before retry %s/%s", delay, attempt, MAX_RETRIES)
        time.sleep(delay)


def fetch_dividends(session, api_key, ticker, since_ex_date=None):
    url = f"{API_BASE_URL}/v3/reference/dividends"
    params = {
        "ticker": ticker,
        "apiKey": api_key,
        "limit": PAGE_LIMIT,
        "order": "desc",
        "sort": "ex_dividend_date",
    }
    if since_ex_date:
        params["ex_dividend_date.gte"] = since_ex_date

    rows = []
    next_url = None
    next_params = params

    while True:
        if next_url:
            resp = get_with_backoff(session, next_url, {"apiKey": api_key})
        else:
            resp = get_with_backoff(session, url, next_params)

        data = resp.json()
        for r in data.get("results") or []:
            rows.append(
                {
                    "TickerSymbol": ticker,
                    "ExDividendDate": r.get("ex_dividend_date"),
                    "PayDate": r.get("pay_date"),
                    "RecordDate": r.get("record_date"),
                    "DeclarationDate": r.get("declaration_date"),
                    "CashAmount": r.get("cash_amount"),
                    "Frequency": r.get("frequency"),
                    "DividendType": r.get("dividend_type"),
                    "Currency": r.get("currency"),
                }
            )

        next_url = data.get("next_url")
        if not next_url:
            break

    return [r for r in rows if r["ExDividendDate"] and r["CashAmount"] is not None]


def main():
    api_key = db.get_env("MASSIVE_API_KEY")
    conn = db.get_connection()
    session = requests.Session()

    try:
        tickers = load_stock_etf_tickers(conn)
        logger.info("Starting dividend update for %s stock/ETF tickers", len(tickers))

        total_upserted = 0
        for idx, ticker in enumerate(tickers, start=1):
            last_ex_date = get_last_ex_date(conn, ticker)
            logger.info("%s/%s: %s (last_ex_date=%s)", idx, len(tickers), ticker, last_ex_date)

            try:
                rows = fetch_dividends(session, api_key, ticker, since_ex_date=last_ex_date)
            except requests.HTTPError as e:
                status = e.response.status_code if getattr(e, "response", None) is not None else "?"
                logger.exception("%s: HTTP error %s, skipping", ticker, status)
                continue
            except Exception:
                logger.exception("%s: unexpected error, skipping", ticker)
                continue

            count = db.upsert_dividends(conn, rows)
            total_upserted += count
            logger.info("%s: upserted %s dividend rows", ticker, count)

            if idx < len(tickers):
                time.sleep(REQUEST_DELAY_SECONDS)

        logger.info("Dividend update run complete, total upserted=%s", total_upserted)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
