"""爆量長紅K / 爆量長黑K screener.

For each stock on the target date, compares today's volume against the
average volume of the preceding trading days. If volume has surged and the
day's candle body (close vs open) dominates its trading range with a large
enough move, the stock is classified as either a volume-surge long-bullish
("長紅K") or long-bearish ("長黑K") candle.

Consumes ``docs/data/{market}/daily_price/{date}.json`` (today + preceding
``LOOKBACK_DAYS`` files) and writes:

- ``docs/data/{market}/vol_candle_red/{date}.json``   (長紅K)
- ``docs/data/{market}/vol_candle_black/{date}.json`` (長黑K)
"""

import os
import json
import argparse

# How many preceding trading days to average volume over.
LOOKBACK_DAYS = 5
# Need at least this many preceding days of data before a stock is scored.
MIN_LOOKBACK = 3
# Today's volume must be at least this many times the lookback average.
VOL_RATIO_MIN = 2.0
# Ignore illiquid stocks below this share volume.
MIN_VOLUME = 500_000
# Minimum |change_percent| to count as a "long" candle.
BODY_PCT_MIN = 4.0
# Candle body (|close-open|) must be at least this fraction of the day's
# high-low range, so long-wick/doji days don't get flagged.
BODY_RANGE_MIN = 0.6


def run_strategy_for_market(market_type, date_str=None):
    # Base directory is one level up from this script (in the project root)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "docs", "data")
    market_dir = os.path.join(data_dir, market_type)

    price_dir = os.path.join(market_dir, "daily_price")
    if not os.path.exists(price_dir):
        print(f"Price directory not found: {price_dir}")
        return

    daily_price_dates = sorted(
        [f.replace(".json", "") for f in os.listdir(price_dir) if f.endswith(".json")],
        reverse=True,
    )

    if not daily_price_dates:
        print(f"No daily price data available for {market_type}.")
        return

    today_date = date_str or daily_price_dates[0]

    if today_date not in daily_price_dates:
        print(f"Data for {today_date} not found in {market_type} price data.")
        return

    idx = daily_price_dates.index(today_date)
    prev_dates = daily_price_dates[idx + 1 : idx + 1 + LOOKBACK_DAYS]

    if len(prev_dates) < MIN_LOOKBACK:
        print(
            f"[{market_type}] Not enough history before {today_date} "
            f"({len(prev_dates)} day(s), need {MIN_LOOKBACK}). Skipping."
        )
        return

    print(f"Running volume/candle strategy for {market_type}: {today_date} vs {prev_dates}")

    with open(os.path.join(price_dir, f"{today_date}.json"), "r", encoding="utf-8") as f:
        today_data = json.load(f)

    prev_volumes = {}
    for d in prev_dates:
        with open(os.path.join(price_dir, f"{d}.json"), "r", encoding="utf-8") as f:
            for stock in json.load(f):
                prev_volumes.setdefault(stock["id"], []).append(stock.get("volume") or 0)

    red_results = []
    black_results = []

    for stock in today_data:
        stock_id = stock["id"]
        vol = stock.get("volume") or 0
        o, h, l, c = stock.get("open"), stock.get("high"), stock.get("low"), stock.get("close")

        if not all(isinstance(x, (int, float)) for x in (o, h, l, c)):
            continue
        if vol < MIN_VOLUME:
            continue

        vols = prev_volumes.get(stock_id)
        if not vols:
            continue
        avg_vol = sum(vols) / len(vols)
        if avg_vol <= 0:
            continue

        vol_ratio = vol / avg_vol
        if vol_ratio < VOL_RATIO_MIN:
            continue

        day_range = h - l
        body = abs(c - o)
        body_ratio = (body / day_range) if day_range > 0 else 1.0
        chg_pct = stock.get("change_percent") or 0

        if abs(chg_pct) < BODY_PCT_MIN or body_ratio < BODY_RANGE_MIN:
            continue

        row = {
            "id": stock_id,
            "name": stock["name"],
            "close": c,
            "open": o,
            "high": h,
            "low": l,
            "diff": stock.get("change", 0),
            "change_percent": chg_pct,
            "volume": vol,
            "avg_volume": round(avg_vol),
            "vol_ratio": round(vol_ratio, 2),
            "body_ratio": round(body_ratio, 2),
        }

        if c > o:
            red_results.append(row)
        elif c < o:
            black_results.append(row)

    red_results.sort(key=lambda r: -r["vol_ratio"])
    black_results.sort(key=lambda r: -r["vol_ratio"])

    red_dir = os.path.join(market_dir, "vol_candle_red")
    os.makedirs(red_dir, exist_ok=True)
    with open(os.path.join(red_dir, f"{today_date}.json"), "w", encoding="utf-8") as f:
        json.dump(red_results, f, ensure_ascii=False, indent=4)
    print(f"[{market_type}] Found {len(red_results)} stocks for 爆量長紅K.")

    black_dir = os.path.join(market_dir, "vol_candle_black")
    os.makedirs(black_dir, exist_ok=True)
    with open(os.path.join(black_dir, f"{today_date}.json"), "w", encoding="utf-8") as f:
        json.dump(black_results, f, ensure_ascii=False, indent=4)
    print(f"[{market_type}] Found {len(black_results)} stocks for 爆量長黑K.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run volume-surge long-candle strategy.")
    parser.add_argument(
        "--date_str",
        type=str,
        help="Date string in YYYY-MM-DD format",
    )
    args = parser.parse_args()

    run_strategy_for_market("twse", args.date_str)
    run_strategy_for_market("tpex", args.date_str)
