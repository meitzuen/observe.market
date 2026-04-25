import requests
import json
import os
import argparse
from datetime import datetime
from typing import Dict, Any
from config import API_DOMAIN, PATH


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
    warrant_url = f"{API_DOMAIN}/{PATH}/warrant/daily"
    try:
        response = requests.get(warrant_url)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"抓取日線數據失敗: {e}")
        return None


def save_to_file(data: Dict[str, Any], path: str, filename: str) -> None:

    try:
        # Base directory is one level up from this script (in the project root)
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_root = os.path.join(base_dir, "docs", "data")
        target_dir = os.path.join(data_root, path)

        os.makedirs(data_root, exist_ok=True)
        os.makedirs(target_dir, exist_ok=True)

        file_path = os.path.join(target_dir, f"{filename}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)

        print(f"成功更新資料: {filename} at {file_path}")
    except Exception as e:
        print(f"抓取失敗: {e}")


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

    twse_daily_data = get_daily_index("twse", date_str)
    if twse_daily_data:
        save_to_file(twse_daily_data, "twse/daily_index", date_str)

    tpex_daily_data = get_daily_index("tpex", date_str)
    if tpex_daily_data:
        save_to_file(tpex_daily_data, "tpex/daily_index", date_str)

    twse_daily_price_data = get_daily_price("twse", date_str)
    if twse_daily_price_data:
        save_to_file(twse_daily_price_data, "twse/daily_price", date_str)

    tpex_daily_price_data = get_daily_price("tpex", date_str)
    if tpex_daily_price_data:
        save_to_file(tpex_daily_price_data, "tpex/daily_price", date_str)

    twse_daily_punish_data = get_punish_stock("twse", date_str)
    if twse_daily_punish_data:
        save_to_file(twse_daily_punish_data, "twse/daily_punish", date_str)

    tpex_daily_punish_data = get_punish_stock("tpex", date_str)
    if tpex_daily_punish_data:
        save_to_file(tpex_daily_punish_data, "tpex/daily_punish", date_str)

    warrant_data = get_warrant_stock()
    if warrant_data:
        save_to_file(warrant_data, "warrant", date_str)

