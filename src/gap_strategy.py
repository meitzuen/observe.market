import os
import json
import argparse
from datetime import datetime


def run_jump_strategy(date_str=None):
    # Base directory is one level up from this script (in the project root)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "docs", "data")
    
    manifest_path = os.path.join(data_dir, "manifest.json")

    if not os.path.exists(manifest_path):
        print(f"Manifest not found at {manifest_path}.")
        return

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    daily_price_dates = manifest.get("daily_price", [])
    if not daily_price_dates:
        print("No daily price data available.")
        return

    # If no date provided, use the latest from manifest
    if not date_str:
        today_date = daily_price_dates[0]
    else:
        today_date = date_str

    if today_date not in daily_price_dates:
        print(f"Data for {today_date} not found in manifest.")
        return

    # Find the previous available date
    idx = daily_price_dates.index(today_date)
    if idx + 1 >= len(daily_price_dates):
        print(f"No previous date data available for {today_date}.")
        return

    prev_date = daily_price_dates[idx + 1]

    print(f"Running Gap Jump strategy: Comparing today ({today_date}) with previous date ({prev_date})")

    # Load today's data
    today_file = os.path.join(data_dir, "daily_price", f"{today_date}.json")
    with open(today_file, "r", encoding="utf-8") as f:
        today_data = json.load(f)

    # Load previous day's data
    prev_file = os.path.join(data_dir, "daily_price", f"{prev_date}.json")
    with open(prev_file, "r", encoding="utf-8") as f:
        prev_data = json.load(f)

    # Convert prev_data to a dict for quick lookup
    prev_lookup = {stock["id"]: stock for stock in prev_data}

    results = []
    for stock in today_data:
        stock_id = stock["id"]
        if stock_id in prev_lookup:
            today_close = stock.get("close")
            prev_high = prev_lookup[stock_id].get("high")

            if today_close is not None and prev_high is not None:
                if today_close > prev_high:
                    # Found a match
                    results.append(
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

    # Save results
    output_dir = os.path.join(data_dir, "gap_jump")
    os.makedirs(output_dir, exist_ok=True)

    output_path = os.path.join(output_dir, f"{today_date}.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=4)

    print(f"Found {len(results)} stocks for Gap Jump. Results saved to {output_path}")


def run_drop_strategy(date_str=None):
    # Base directory is one level up from this script (in the project root)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "docs", "data")
    
    manifest_path = os.path.join(data_dir, "manifest.json")

    if not os.path.exists(manifest_path):
        print(f"Manifest not found at {manifest_path}.")
        return

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    daily_price_dates = manifest.get("daily_price", [])
    if not daily_price_dates:
        print("No daily price data available.")
        return

    # If no date provided, use the latest from manifest
    if not date_str:
        today_date = daily_price_dates[0]
    else:
        today_date = date_str

    if today_date not in daily_price_dates:
        print(f"Data for {today_date} not found in manifest.")
        return

    # Find the previous available date
    idx = daily_price_dates.index(today_date)
    if idx + 1 >= len(daily_price_dates):
        print(f"No previous date data available for {today_date}.")
        return

    prev_date = daily_price_dates[idx + 1]

    print(f"Running Gap Drop Strategy: Comparing today ({today_date}) with previous date ({prev_date})")

    # Load today's data
    today_file = os.path.join(data_dir, "daily_price", f"{today_date}.json")
    with open(today_file, "r", encoding="utf-8") as f:
        today_data = json.load(f)

    # Load previous day's data
    prev_file = os.path.join(data_dir, "daily_price", f"{prev_date}.json")
    with open(prev_file, "r", encoding="utf-8") as f:
        prev_data = json.load(f)

    # Convert prev_data to a dict for quick lookup
    prev_lookup = {stock["id"]: stock for stock in prev_data}

    results = []
    for stock in today_data:
        stock_id = stock["id"]
        if stock_id in prev_lookup:
            today_close = stock.get("close")
            prev_low = prev_lookup[stock_id].get("low")

            if today_close is not None and prev_low is not None:
                if today_close < prev_low:
                    # Found a match
                    results.append(
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

    # Save results
    output_dir = os.path.join(data_dir, "gap_drop")
    os.makedirs(output_dir, exist_ok=True)

    output_path = os.path.join(output_dir, f"{today_date}.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=4)

    print(f"Found {len(results)} stocks for gap drop. Results saved to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Gap strategies.")
    parser.add_argument(
        "--date_str",
        type=str,
        help="Date string in YYYY-MM-DD format",
    )
    args = parser.parse_args()
    run_jump_strategy(args.date_str)
    run_drop_strategy(args.date_str)
