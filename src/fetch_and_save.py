import requests
import json
import os
import argparse
from datetime import datetime, timedelta
from typing import Dict, Any, List
from config import API_DOMAIN, PATH

RETENTION_DAYS = 180


def get_daily_index(type: str, date_str: str) -> Dict[str, Any]:
    index_url = f"{API_DOMAIN}/{PATH}/{type}/daily/index?date_str={date_str}"
    try:
        response = requests.get(index_url)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"抓取日線數據失敗: {e}")
        return None


def get_daily_price(type: str, date_str: str) -> Dict[str, Any]:
    daily_url = f"{API_DOMAIN}/{PATH}/{type}/daily/stock_price?date_str={date_str}"
    try:
        response = requests.get(daily_url)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"抓取日線數據失敗: {e}")
        return None


def get_punish_stock(type: str, date_str: str) -> Dict[str, Any]:
    daily_url = f"{API_DOMAIN}/{PATH}/{type}/daily/punishment?start_date={date_str}&end_date={date_str}"
    try:
        response = requests.get(daily_url)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"抓取日線數據失敗: {e}")
        return None


def get_warrant_stock() -> Dict[str, Any]:
    warrant_url = f"{API_DOMAIN}/{PATH}/warrant/daily?language=zh-tw"
    try:
        response = requests.get(warrant_url)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"抓取日線數據失敗: {e}")
        return None


def data_root_path() -> str:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_dir, "docs", "data")


def save_to_file(data: Dict[str, Any], path: str, filename: str) -> None:
    try:
        data_root = data_root_path()
        target_dir = os.path.join(data_root, path)
        os.makedirs(data_root, exist_ok=True)
        os.makedirs(target_dir, exist_ok=True)
        file_path = os.path.join(target_dir, f"{filename}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        print(f"成功更新資料: {filename} at {file_path}")
    except Exception as e:
        print(f"抓取失敗: {e}")


def rebuild_index_history(market: str) -> None:
    """Merge all daily_index files into a single index_history.json."""
    data_root = data_root_path()
    index_dir = os.path.join(data_root, market, "daily_index")
    if not os.path.exists(index_dir):
        return

    seen_dates = set()
    all_rows: List[Dict] = []

    for fname in sorted(os.listdir(index_dir)):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(index_dir, fname), encoding="utf-8") as f:
                rows = json.load(f)
            for row in rows:
                if row.get("date") not in seen_dates:
                    all_rows.append(row)
                    seen_dates.add(row["date"])
        except Exception as e:
            print(f"Error reading {fname}: {e}")

    all_rows.sort(key=lambda r: r.get("date", ""))

    out_path = os.path.join(data_root, market, "index_history.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_rows, f, ensure_ascii=False, indent=4)
    print(f"Rebuilt index_history.json for {market}: {len(all_rows)} rows")


def write_latest(market: str, price_data: List[Dict], date_str: str) -> None:
    """Write latest.json — today's price data with date metadata."""
    data_root = data_root_path()
    out = {"date": date_str, "stocks": price_data}
    out_path = os.path.join(data_root, market, "latest.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=4)
    print(f"Wrote latest.json for {market} ({date_str})")


def update_punish_history(market: str, new_records: List[Dict]) -> None:
    """Append new punish records to punish_history.json, deduplicating by id+publish_date."""
    data_root = data_root_path()
    out_path = os.path.join(data_root, market, "punish_history.json")

    existing: List[Dict] = []
    if os.path.exists(out_path):
        try:
            with open(out_path, encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            existing = []

    seen = {(r["id"], r["publish_date"]) for r in existing}
    added = 0
    for r in new_records:
        key = (r.get("id"), r.get("publish_date"))
        if key not in seen:
            existing.append(r)
            seen.add(key)
            added += 1

    existing.sort(key=lambda r: r.get("publish_date", ""), reverse=True)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=4)
    print(f"Updated punish_history.json for {market}: +{added} new records, {len(existing)} total")


def apply_retention_dir(directory: str, label: str) -> None:
    """Delete YYYY-MM-DD.json files in directory older than RETENTION_DAYS days."""
    if not os.path.exists(directory):
        return
    cutoff_str = (datetime.now() - timedelta(days=RETENTION_DAYS)).strftime("%Y-%m-%d")
    for fname in os.listdir(directory):
        if not fname.endswith(".json"):
            continue
        date_part = fname.replace(".json", "")
        if len(date_part) == 10 and date_part < cutoff_str:
            os.remove(os.path.join(directory, fname))
            print(f"Deleted old file: {label}/{fname}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch daily market data.")
    parser.add_argument(
        "--date_str",
        type=str,
        default=datetime.now().strftime("%Y-%m-%d"),
        help="Date string in YYYY-MM-DD format (default: today)",
    )
    args = parser.parse_args()
    date_str = args.date_str

    # --- TWSE ---
    twse_index = get_daily_index("twse", date_str)
    if twse_index:
        save_to_file(twse_index, "twse/daily_index", date_str)
        rebuild_index_history("twse")

    twse_price = get_daily_price("twse", date_str)
    if twse_price:
        save_to_file(twse_price, "twse/daily_price", date_str)
        write_latest("twse", twse_price, date_str)

    twse_punish = get_punish_stock("twse", date_str)
    if twse_punish:
        save_to_file(twse_punish, "twse/daily_punish", date_str)
        update_punish_history("twse", twse_punish)

    # --- TPEX ---
    tpex_index = get_daily_index("tpex", date_str)
    if tpex_index:
        save_to_file(tpex_index, "tpex/daily_index", date_str)
        rebuild_index_history("tpex")

    tpex_price = get_daily_price("tpex", date_str)
    if tpex_price:
        save_to_file(tpex_price, "tpex/daily_price", date_str)
        write_latest("tpex", tpex_price, date_str)

    tpex_punish = get_punish_stock("tpex", date_str)
    if tpex_punish:
        save_to_file(tpex_punish, "tpex/daily_punish", date_str)
        update_punish_history("tpex", tpex_punish)

    # --- Warrant ---
    warrant_data = get_warrant_stock()
    if warrant_data:
        save_to_file(warrant_data, "warrant", date_str)

    # --- Retention: keep only last 180 days of per-day files ---
    data_root = data_root_path()
    for market in ["twse", "tpex"]:
        for cat in ["daily_index", "daily_price", "daily_punish", "gap_jump", "gap_drop"]:
            apply_retention_dir(os.path.join(data_root, market, cat), f"{market}/{cat}")
    apply_retention_dir(os.path.join(data_root, "warrant"), "warrant")
