import sys
import datetime as dt

import requests

import db

API_BASE_URL = db.get_env("MARKETDATA_BASE_URL", required=False, default="https://api.marketdata.app")
API_KEY = db.get_env("MARKETDATA_API_KEY", required=False, default="") or db.get_env("API_KEY", required=False, default="")


def fetch_prices_from_api(ticker, start_date, end_date):
    """
    Fetch daily candles from Marketdata.app and map them into a list of
    dicts for PriceHistory.
    """
    if not API_KEY:
        raise ValueError("MARKETDATA_API_KEY (or API_KEY) is not set")

    headers = {"Authorization": f"Bearer {API_KEY}"}
    url = f"{API_BASE_URL}/v1/stocks/candles/D/{ticker}/"
    params = {
        "from": start_date.isoformat(),
        "to": end_date.isoformat(),
    }

    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    if data.get("s") != "ok":
        return []

    t_arr = data.get("t") or []
    o_arr = data.get("o") or []
    h_arr = data.get("h") or []
    l_arr = data.get("l") or []
    c_arr = data.get("c") or []
    v_arr = data.get("v") or []

    n = min(len(t_arr), len(o_arr), len(h_arr), len(l_arr), len(c_arr), len(v_arr))
    bars = []

    for i in range(n):
        ts = t_arr[i]
        price_date = dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).date()

        bars.append({
            "date": price_date,
            "open": float(o_arr[i]) if o_arr[i] is not None else None,
            "high": float(h_arr[i]) if h_arr[i] is not None else None,
            "low": float(l_arr[i]) if l_arr[i] is not None else None,
            "close": float(c_arr[i]) if c_arr[i] is not None else None,
            "volume": int(v_arr[i]) if v_arr[i] is not None else None,
        })

    return bars


def main():
    tickers = sys.argv[1:] or ["BLOX"]
    print(f"Updating {len(tickers)} tickers: {', '.join(tickers)}")

    conn = db.get_connection()
    try:
        for ticker in tickers:
            try:
                bars = fetch_prices_from_api(ticker, dt.date(2000, 1, 1), dt.date.today())

                rows = [
                    {
                        "TickerSymbol": ticker,
                        "PriceDate": b["date"].isoformat(),
                        "OpenPrice": b["open"],
                        "HighPrice": b["high"],
                        "LowPrice": b["low"],
                        "ClosePrice": b["close"],
                        "Volume": b["volume"],
                        "VWAP": None,
                    }
                    for b in bars
                ]

                count = db.upsert_price_history(conn, rows)
                print(f"{ticker}: upserted {count} daily rows")
            except requests.HTTPError as e:
                status = e.response.status_code if e.response is not None else "?"
                print(f"{ticker}: HTTP error {status}, skipping")
            except Exception as e:
                print(f"{ticker}: unexpected error {e}, skipping")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
