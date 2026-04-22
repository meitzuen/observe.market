import os
import json
import argparse


def run_strategy_for_market(market_type, date_str=None):
    # Base directory is one level up from this script (in the project root)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "docs", "data")
    market_dir = os.path.join(data_dir, market_type)

    manifest_path = os.path.join(data_dir, "manifest.json")

    if not os.path.exists(manifest_path):
        print(f"Manifest not found at {manifest_path}.")
        return

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

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

    if not date_str:
        today_date = daily_price_dates[0]
    else:
        today_date = date_str

    if today_date not in daily_price_dates:
        print(f"Data for {today_date} not found in {market_type} price data.")
        return

    idx = daily_price_dates.index(today_date)
    if idx + 1 >= len(daily_price_dates):
        print(f"No previous date data available for {today_date} in {market_type}.")
        return

    prev_date = daily_price_dates[idx + 1]

    print(f"Running strategy for {market_type}: {today_date} vs {prev_date}")

    # Load data
    with open(
        os.path.join(price_dir, f"{today_date}.json"), "r", encoding="utf-8"
    ) as f:
        today_data = json.load(f)
    with open(os.path.join(price_dir, f"{prev_date}.json"), "r", encoding="utf-8") as f:
        prev_data = json.load(f)

    prev_lookup = {stock["id"]: stock for stock in prev_data}

    jump_results = []
    drop_results = []

    for stock in today_data:
        stock_id = stock["id"]
        if stock_id in prev_lookup:
            today_close = stock.get("close")
            prev_high = prev_lookup[stock_id].get("high")
            prev_low = prev_lookup[stock_id].get("low")

            if today_close is not None:
                # Jump strategy
                if prev_high is not None and today_close > prev_high:
                    jump_results.append(
                        {
                            "id": stock_id,
                            "name": stock["name"],
                            "today_close": today_close,
                            "prev_high": prev_high,
                            "diff": round(today_close - prev_high, 2),
                            "ratio": (
                                round((today_close - prev_high) / prev_high * 100, 2)
                                if prev_high != 0
                                else 0
                            ),
                            "volume": stock.get("volume", 0),
                        }
                    )

                # Drop strategy
                if prev_low is not None and today_close < prev_low:
                    drop_results.append(
                        {
                            "id": stock_id,
                            "name": stock["name"],
                            "today_close": today_close,
                            "prev_low": prev_low,
                            "diff": round(today_close - prev_low, 2),
                            "ratio": (
                                round((today_close - prev_low) / prev_low * 100, 2)
                                if prev_low != 0
                                else 0
                            ),
                            "volume": stock.get("volume", 0),
                        }
                    )

    # Save Gap Jump
    jump_dir = os.path.join(market_dir, "gap_jump")
    os.makedirs(jump_dir, exist_ok=True)
    with open(os.path.join(jump_dir, f"{today_date}.json"), "w", encoding="utf-8") as f:
        json.dump(jump_results, f, ensure_ascii=False, indent=4)
    print(f"[{market_type}] Found {len(jump_results)} stocks for Gap Jump.")

    # Save Gap Drop
    drop_dir = os.path.join(market_dir, "gap_drop")
    os.makedirs(drop_dir, exist_ok=True)
    with open(os.path.join(drop_dir, f"{today_date}.json"), "w", encoding="utf-8") as f:
        json.dump(drop_results, f, ensure_ascii=False, indent=4)
    print(f"[{market_type}] Found {len(drop_results)} stocks for Gap Drop.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Gap strategies.")
    parser.add_argument(
        "--date_str",
        type=str,
        help="Date string in YYYY-MM-DD format",
    )
    args = parser.parse_args()

    run_strategy_for_market("twse", args.date_str)
    run_strategy_for_market("tpex", args.date_str)
