import datetime as dt
import logging
import os
import time
from logging.handlers import TimedRotatingFileHandler

import requests

import db

MARKETDATA_BASE_URL = os.getenv("MARKETDATA_BASE_URL", "https://api.marketdata.app")
MARKETDATA_API_KEY = os.getenv("MARKETDATA_API_KEY", os.getenv("API_KEY", ""))
FINNHUB_BASE_URL = os.getenv("FINNHUB_BASE_URL", "https://finnhub.io/api/v1")
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "")

LOG_DIR = os.getenv("FUNDAMENTALS_UPDATE_LOG_DIR", "logs")
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "4"))
REQUEST_DELAY_SECONDS = float(os.getenv("FUNDAMENTALS_REQUEST_DELAY_SECONDS", "1.1"))

METRIC_NAMES = ("MarketCapUSD", "EPS_TTM", "PE_Ratio", "52WeekHigh", "52WeekLow")


def setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    logger = logging.getLogger("fundamentals_updater")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = TimedRotatingFileHandler(
        filename=os.path.join(LOG_DIR, "update_fundamentals.log"),
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


def marketdata_headers():
    if not MARKETDATA_API_KEY:
        raise RuntimeError("MARKETDATA_API_KEY (or API_KEY) is not set")
    return {"Authorization": f"Bearer {MARKETDATA_API_KEY}"}


def get_with_backoff(session, url, params=None, headers=None):
    attempt = 0
    while True:
        resp = session.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 429:
            return resp
        attempt += 1
        if attempt > MAX_RETRIES:
            resp.raise_for_status()
        retry_after = resp.headers.get("Retry-After")
        try:
            delay = max(1, int(float(retry_after))) if retry_after else 15 * attempt
        except ValueError:
            delay = 15 * attempt
        logger.warning("429 rate limit hit, sleeping %ss before retry %s/%s", delay, attempt, MAX_RETRIES)
        time.sleep(delay)


def fetch_quote_52week(session, ticker):
    """Returns {"last": float|None, "high52": float|None, "low52": float|None} or None."""
    url = f"{MARKETDATA_BASE_URL}/v1/stocks/quotes/{ticker}/"
    resp = get_with_backoff(session, url, params={"52week": "true"}, headers=marketdata_headers())
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    data = resp.json()
    if data.get("s") != "ok":
        return None

    def first(key):
        arr = data.get(key) or []
        return arr[0] if arr else None

    return {"last": first("last"), "high52": first("52weekHigh"), "low52": first("52weekLow")}


def fetch_ttm_eps(session, ticker, as_of_date):
    """Sum of the last 4 already-reported quarterly EPS figures (trailing twelve months)."""
    url = f"{MARKETDATA_BASE_URL}/v1/stocks/earnings/{ticker}/"
    resp = get_with_backoff(
        session, url, params={"countback": 4, "to": as_of_date}, headers=marketdata_headers()
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    data = resp.json()
    if data.get("s") != "ok":
        return None

    reported = [v for v in (data.get("reportedEPS") or []) if v is not None]
    if len(reported) < 4:
        return None
    return sum(reported[-4:])


def fetch_market_cap_usd(session, ticker):
    if not FINNHUB_API_KEY:
        return None
    url = f"{FINNHUB_BASE_URL}/stock/profile2"
    resp = session.get(url, params={"symbol": ticker, "token": FINNHUB_API_KEY}, timeout=REQUEST_TIMEOUT)
    if resp.status_code != 200:
        return None
    data = resp.json() or {}
    cap_millions = data.get("marketCapitalization")
    if not cap_millions:
        return None
    return float(cap_millions) * 1_000_000


def collect_metrics(session, ticker, as_of_date):
    metrics = []
    last_price = None

    try:
        quote = fetch_quote_52week(session, ticker)
        if quote:
            last_price = quote["last"]
            if quote["high52"] is not None:
                metrics.append(("52WeekHigh", quote["high52"], "marketdata.app"))
            if quote["low52"] is not None:
                metrics.append(("52WeekLow", quote["low52"], "marketdata.app"))
    except Exception:
        logger.exception("%s: quote fetch failed", ticker)

    try:
        eps_ttm = fetch_ttm_eps(session, ticker, as_of_date)
        if eps_ttm is not None:
            metrics.append(("EPS_TTM", eps_ttm, "marketdata.app"))
            if last_price is not None and eps_ttm > 0:
                metrics.append(("PE_Ratio", last_price / eps_ttm, "marketdata.app"))
    except Exception:
        logger.exception("%s: earnings fetch failed", ticker)

    try:
        market_cap = fetch_market_cap_usd(session, ticker)
        if market_cap is not None:
            metrics.append(("MarketCapUSD", market_cap, "finnhub"))
    except Exception:
        logger.exception("%s: market cap fetch failed", ticker)

    return metrics


def main():
    conn = db.get_connection()
    session = requests.Session()
    today = dt.date.today().isoformat()

    try:
        tickers = load_stock_etf_tickers(conn)
        logger.info("Starting fundamentals update for %s stock/ETF tickers", len(tickers))

        total_upserted = 0
        for idx, ticker in enumerate(tickers, start=1):
            logger.info("%s/%s: %s", idx, len(tickers), ticker)
            metrics = collect_metrics(session, ticker, today)

            if metrics:
                rows = [
                    {
                        "TickerSymbol": ticker,
                        "MetricDate": today,
                        "MetricName": name,
                        "MetricValue": value,
                        "DataSource": source,
                    }
                    for name, value, source in metrics
                ]
                count = db.upsert_fundamental_metrics(conn, rows)
                total_upserted += count
                logger.info("%s: upserted %s fundamental metrics", ticker, count)
            else:
                logger.warning("%s: no fundamentals data available, skipping", ticker)

            if idx < len(tickers):
                time.sleep(REQUEST_DELAY_SECONDS)

        logger.info("Fundamentals update run complete, total upserted=%s", total_upserted)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
