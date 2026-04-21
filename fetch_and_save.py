import requests
import json
import os
import argparse
from datetime import datetime
from typing import Dict, Any


def get_daily_index(date_str: str) -> Dict[str, Any]:
    index_url = (
        f"https://market.smallplum.xyz/api/strategy/daily/index?date_str={date_str}"
    )
    try:
        response = requests.get(index_url)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"抓取日線數據失敗: {e}")
        return None


def get_daily_price(date_str: str) -> Dict[str, Any]:
    daily_url = f"https://market.smallplum.xyz/api/strategy/daily/stock_price?date_str={date_str}"
    try:
        response = requests.get(daily_url)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"抓取日線數據失敗: {e}")
        return None


def get_punish_stock(date_str: str) -> Dict[str, Any]:
    daily_url = f"https://market.smallplum.xyz/api/strategy/daily/punishment?start_date={date_str}&end_date={date_str}"
    try:
        response = requests.get(daily_url)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"抓取日線數據失敗: {e}")
        return None


def save_to_file(data: Dict[str, Any], path: str, filename: str) -> None:
    try:
        os.makedirs("data", exist_ok=True)
        os.makedirs(f"data/{path}", exist_ok=True)

        with open(f"data/{path}/{filename}.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)

        print(f"成功更新資料: {filename}")
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

    daily_data = get_daily_index(date_str)
    if daily_data:
        save_to_file(daily_data, "daily_index", date_str)

    daily_price_data = get_daily_price(date_str)
    if daily_price_data:
        save_to_file(daily_price_data, "daily_price", date_str)

    daily_punish_data = get_punish_stock(date_str)
    if daily_punish_data:
        save_to_file(daily_punish_data, "daily_punish", date_str)
