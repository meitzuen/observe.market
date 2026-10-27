import argparse
import json
import os

STATE_FILE = "_state.json"
FIELDS = ("open", "high", "low", "close", "volume")


def _load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def _update_market(data_dir, market, full):
    daily_price_dir = os.path.join(data_dir, market, "daily_price")
    if not os.path.exists(daily_price_dir):
        return

    history_dir = os.path.join(data_dir, market, "stock_history")
    os.makedirs(history_dir, exist_ok=True)
    state_path = os.path.join(history_dir, STATE_FILE)

    dates = sorted(
        f[: -len(".json")] for f in os.listdir(daily_price_dir) if f.endswith(".json")
    )
    last_date = None if full else (_load_json(state_path) or {}).get("last_date")

    # Re-read the last processed date too, so a re-run after the day's prices
    # were revised replaces that day instead of keeping the stale row.
    todo = [d for d in dates if last_date is None or d >= last_date]

    # stock_id -> {date: point}; seeded from the existing file only when
    # appending, so a full rebuild never keeps rows from deleted days.
    stocks = {}
    existing = {}
    for date_str in todo:
        file_path = os.path.join(daily_price_dir, f"{date_str}.json")
        rows = _load_json(file_path)
        if rows is None:
            print(f"Error reading {file_path}")
            continue
        for row in rows:
            stock_id = row.get("id")
            if not stock_id:
                continue
            points = stocks.get(stock_id)
            if points is None:
                points = stocks[stock_id] = {}
                if last_date is not None:
                    old = _load_json(os.path.join(history_dir, f"{stock_id}.json"), [])
                    existing[stock_id] = old
                    points.update({p["date"]: p for p in old})
            points[date_str] = {"date": date_str, **{k: row.get(k) for k in FIELDS}}

    written = 0
    for stock_id, points in stocks.items():
        merged = [points[d] for d in sorted(points)]
        # Skip files whose content did not change (e.g. only the re-read last
        # day), so the daily upload touches as few objects as possible.
        if existing.get(stock_id) == merged:
            continue
        _write_json(os.path.join(history_dir, f"{stock_id}.json"), merged)
        written += 1

    if dates:
        _write_json(state_path, {"last_date": dates[-1]})
    mode = "full" if last_date is None else f"incremental since {last_date}"
    print(
        f"Updated {written} of {len(stocks)} stock history files for {market} "
        f"from {len(todo)} day(s) ({mode})"
    )


def generate_stock_history(data_dir=None, full=False):
    if data_dir is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_dir = os.path.join(base_dir, "docs", "data")
    for market in ["twse", "tpex"]:
        _update_market(data_dir, market, full)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--full", action="store_true", help="rebuild every history file from scratch"
    )
    generate_stock_history(full=parser.parse_args().full)
