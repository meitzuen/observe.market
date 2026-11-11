"""Backfill TPEx (上櫃) index history from the official 日成交量值指數 monthly table.

The upstream mktobs index endpoint ignores date_str and only returns the current
month, so older months are pulled straight from TPEx. Rows are written in the
same shape as fetch_and_save.py produces:

    {"date": "115/04/01", "volume": <shares>, "turnover": <NTD>,
     "transactions": <n>, "index": <float>, "changes": "<str>"}

Usage (from src/):
    python backfill_tpex_index.py --start 2026-01 --end 2026-05

Per-day files go to docs/data/tpex/daily_index/YYYY-MM-DD.json and
docs/data/tpex/index_history.json is merged (existing rows are kept; backfilled
rows only fill dates that are missing, unless --overwrite is given).
"""

import argparse
import json
import os
from typing import Dict, List

import requests

from fetch_and_save import data_root_path, save_to_file

URL = "https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingIndex"


def month_range(start: str, end: str) -> List[str]:
    sy, sm = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    out = []
    while (sy, sm) <= (ey, em):
        out.append(f"{sy}-{sm:02d}")
        sm += 1
        if sm == 13:
            sy, sm = sy + 1, 1
    return out


def to_int(s: str) -> int:
    return int(s.replace(",", ""))


def fetch_month(month: str) -> List[Dict]:
    resp = requests.get(
        URL, params={"date": f"{month.replace('-', '/')}/01", "response": "json"}, timeout=30
    )
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("stat") != "ok":
        raise RuntimeError(f"{month}: {payload.get('stat')}")
    rows = []
    for date, vol_k, turnover_k, txns, index, change in payload["tables"][0]["data"]:
        rows.append(
            {
                "date": date,
                "volume": to_int(vol_k) * 1000,  # 仟股 -> 股
                "turnover": to_int(turnover_k) * 1000,  # 仟元 -> 元
                "transactions": to_int(txns),
                "index": float(index),
                "changes": str(float(change)),
            }
        )
    return rows


def roc_to_iso(roc: str) -> str:
    y, m, d = roc.split("/")
    return f"{int(y) + 1911}-{m}-{d}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True, help="YYYY-MM")
    ap.add_argument("--end", required=True, help="YYYY-MM")
    ap.add_argument("--overwrite", action="store_true", help="replace rows that already exist")
    args = ap.parse_args()

    hist_path = os.path.join(data_root_path(), "tpex", "index_history.json")
    existing: Dict[str, Dict] = {}
    if os.path.exists(hist_path):
        with open(hist_path, encoding="utf-8") as f:
            existing = {r["date"]: r for r in json.load(f)}

    added = 0
    for month in month_range(args.start, args.end):
        rows = fetch_month(month)
        print(f"{month}: {len(rows)} trading days from TPEx")
        for row in rows:
            if row["date"] in existing and not args.overwrite:
                continue
            existing[row["date"]] = row
            save_to_file([row], "tpex/daily_index", roc_to_iso(row["date"]))
            added += 1

    merged = sorted(existing.values(), key=lambda r: r["date"])
    with open(hist_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))
    print(f"index_history.json: +{added} rows, {len(merged)} total")


if __name__ == "__main__":
    main()
