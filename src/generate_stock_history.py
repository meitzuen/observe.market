import os
import json


def generate_stock_history():
    # Base directory is one level up from this script (in the project root)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "docs", "data")

    for market in ["twse", "tpex"]:
        daily_price_dir = os.path.join(data_dir, market, "daily_price")
        if not os.path.exists(daily_price_dir):
            continue

        history_dir = os.path.join(data_dir, market, "stock_history")
        os.makedirs(history_dir, exist_ok=True)

        stocks = {}

        date_files = sorted(
            f for f in os.listdir(daily_price_dir) if f.endswith(".json")
        )

        for filename in date_files:
            date_str = filename.replace(".json", "")
            file_path = os.path.join(daily_price_dir, filename)
            try:
                with open(file_path, encoding="utf-8") as f:
                    rows = json.load(f)
            except Exception as e:
                print(f"Error reading {file_path}: {e}")
                continue

            for row in rows:
                stock_id = row.get("id")
                if not stock_id:
                    continue
                stocks.setdefault(stock_id, []).append(
                    {
                        "date": date_str,
                        "open": row.get("open"),
                        "high": row.get("high"),
                        "low": row.get("low"),
                        "close": row.get("close"),
                        "volume": row.get("volume"),
                    }
                )

        count = 0
        for stock_id, points in stocks.items():
            points.sort(key=lambda p: p["date"])
            out_path = os.path.join(history_dir, f"{stock_id}.json")
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(points, f, ensure_ascii=False)
            count += 1

        print(f"Generated {count} stock history files for {market} at {history_dir}")


if __name__ == "__main__":
    generate_stock_history()
