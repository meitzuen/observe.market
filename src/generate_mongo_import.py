"""Convert docs/data (tpex/twse/warrant) into one JSON array per Mongo
Compass import, named after the target collection: `{market}@{category}.json`.

Each source file under docs/data/{market}/{category}/{file_name}.json becomes
exactly one Mongo document: `{"file_name": "2026-04-23.json", "content": <raw
parsed JSON from that file>}`. All documents for a given (market, category)
are merged into one array so the whole array can be imported as a collection
in one shot. Output collections:

  tpex@daily_index, tpex@daily_price, tpex@daily_punish,
  tpex@gap_drop, tpex@gap_jump, tpex@stock_history,
  twse@daily_index, twse@daily_price, twse@daily_punish,
  twse@gap_drop, twse@gap_jump, twse@stock_history,
  warrant@daily

Usage: python src/generate_mongo_import.py [output_dir]
(default output_dir: mongo_import/ at repo root)
"""

import json
import os
import sys

MARKETS = ["tpex", "twse"]
DATE_KEYED_CATEGORIES = [
    "daily_index",
    "daily_price",
    "daily_punish",
    "gap_drop",
    "gap_jump",
]


def data_root() -> str:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_dir, "docs", "data")


def write_collection(output_dir: str, collection_name: str, records: list) -> None:
    out_path = os.path.join(output_dir, f"{collection_name}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"{collection_name}: {len(records)} docs -> {out_path}")


def build_file_collection(category_dir: str) -> list:
    records = []
    if not os.path.isdir(category_dir):
        return records
    for fname in sorted(os.listdir(category_dir)):
        if not fname.endswith(".json"):
            continue
        with open(os.path.join(category_dir, fname), encoding="utf-8") as f:
            content = json.load(f)
        records.append({"file_name": fname, "content": content})
    return records


def main() -> None:
    data_dir = data_root()
    repo_root = os.path.dirname(os.path.dirname(data_dir))
    output_dir = (
        os.path.abspath(sys.argv[1])
        if len(sys.argv) > 1
        else os.path.join(repo_root, "mongo_import")
    )
    os.makedirs(output_dir, exist_ok=True)

    for market in MARKETS:
        market_dir = os.path.join(data_dir, market)
        if not os.path.isdir(market_dir):
            continue
        for category in DATE_KEYED_CATEGORIES + ["stock_history"]:
            records = build_file_collection(os.path.join(market_dir, category))
            if records:
                write_collection(output_dir, f"{market}@{category}", records)

    warrant_records = build_file_collection(os.path.join(data_dir, "warrant"))
    if warrant_records:
        write_collection(output_dir, "warrant@daily", warrant_records)

    print(f"\nDone. Import each *.json file in {output_dir} via MongoDB Compass")
    print("(collection name = file name without .json).")


if __name__ == "__main__":
    main()
