import logging
import subprocess
import sys
import time
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
LOG_DIR = BACKEND_DIR / "logs"

# Raw data pulls first, then rankings (which read PriceHistory/Dividends), then
# fundamentals last. update_futures.py is deliberately excluded -- it only
# re-registers static rows from futures_watchlist.csv, it doesn't fetch prices,
# so running it nightly would be a no-op.
PIPELINE = [
    "1-update_prices.py",
    "update_index_data.py",
    "2-update_treasury_rates.py",
    "3-update_forex_macro.py",
    "5-update_dividends.py",
    "6-update_rankings.py",
    "7-update_fundamentals.py",
]


def setup_logging() -> logging.Logger:
    LOG_DIR.mkdir(exist_ok=True)
    logger = logging.getLogger("nightly_updates")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

    file_handler = TimedRotatingFileHandler(
        filename=str(LOG_DIR / "nightly_updates.log"),
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


def run_script(logger: logging.Logger, script: str) -> bool:
    logger.info("=" * 60)
    logger.info("Starting %s", script)
    start = time.monotonic()

    result = subprocess.run(
        [sys.executable, script],
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
    )

    elapsed = time.monotonic() - start
    if result.stdout:
        for line in result.stdout.splitlines():
            logger.info("  %s", line)
    if result.stderr:
        for line in result.stderr.splitlines():
            logger.warning("  %s", line)

    if result.returncode == 0:
        logger.info("Finished %s in %.1fs (OK)", script, elapsed)
        return True

    logger.error("Finished %s in %.1fs (FAILED, exit code %s)", script, elapsed, result.returncode)
    return False


def main() -> int:
    logger = setup_logging()
    logger.info("Nightly update run starting (%s scripts)", len(PIPELINE))

    results = {}
    for script in PIPELINE:
        results[script] = run_script(logger, script)

    logger.info("=" * 60)
    logger.info("Nightly update run summary:")
    all_ok = True
    for script, ok in results.items():
        logger.info("  %-30s %s", script, "OK" if ok else "FAILED")
        all_ok = all_ok and ok

    if all_ok:
        logger.info("All scripts completed successfully.")
        return 0

    logger.error("One or more scripts failed -- see above for details.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
