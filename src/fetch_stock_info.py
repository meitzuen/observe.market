import requests
import json
import os
from config import API_DOMAIN


def fetch_stock_info():
    url = f"{API_DOMAIN}/api/finmind/api/v1/stock/info"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        raw = response.json()
    except Exception as e:
        print(f"Failed to fetch stock info: {e}")
        return

    # Deduplicate by stock_id, keeping first occurrence
    lookup = {}
    for item in raw:
        sid = item.get("stock_id")
        if sid and sid not in lookup:
            lookup[sid] = {
                "name": item.get("stock_name", ""),
                "type": item.get("type", ""),
            }

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(base_dir, "docs", "data", "stock_info.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(lookup, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Saved {len(lookup)} stocks to {out_path}")


if __name__ == "__main__":
    fetch_stock_info()
