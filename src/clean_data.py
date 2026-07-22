"""One-off cleanup for docs/data data-quality issues:

1. daily_index/{date}.json files store a growing rolling window from the
   upstream API instead of a single day's record, so ~90% of each file
   duplicates the previous file. Some files are also mislabeled (their
   content doesn't cover the date in the filename at all, likely from a
   backfill run on a non-trading day). Neither the frontend nor any script
   other than rebuild_index_history() reads these files individually, so
   they're rewritten as a single canonical record per date (sourced from a
   freshly rebuilt index_history.json), or deleted if no trading occurred
   on that date.
2. daily_punish condition text has a scraped HTML artifact like
   "(./attention.html)" appended to ~2000 records across both markets.
"""

import json
import os
import re

DATA_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "data")

CONDITION_ARTIFACT_RE = re.compile(r"\(\./[^)]*\)\s*$")


def to_roc_date(date_str: str) -> str:
    y, m, d = date_str.split("-")
    return f"{int(y) - 1911}/{m}/{d}"


def clean_daily_index(market: str) -> None:
    index_dir = os.path.join(DATA_ROOT, market, "daily_index")
    if not os.path.exists(index_dir):
        return

    # Rebuild the canonical merged history first (same de-dup rule as
    # fetch_and_save.rebuild_index_history: first file in filename order wins).
    seen_dates = set()
    canonical = {}
    for fname in sorted(os.listdir(index_dir)):
        if not fname.endswith(".json"):
            continue
        with open(os.path.join(index_dir, fname), encoding="utf-8") as f:
            rows = json.load(f)
        for row in rows:
            if row.get("date") not in seen_dates:
                seen_dates.add(row["date"])
                canonical[row["date"]] = row

    history_path = os.path.join(DATA_ROOT, market, "index_history.json")
    all_rows = sorted(canonical.values(), key=lambda r: r.get("date", ""))
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(all_rows, f, ensure_ascii=False, indent=4)
    print(f"[{market}] rebuilt index_history.json: {len(all_rows)} rows")

    rewritten, deleted = 0, 0
    for fname in sorted(os.listdir(index_dir)):
        if not fname.endswith(".json"):
            continue
        date_str = fname.replace(".json", "")
        roc_date = to_roc_date(date_str)
        path = os.path.join(index_dir, fname)
        record = canonical.get(roc_date)
        if record is None:
            os.remove(path)
            deleted += 1
            continue
        with open(path, "w", encoding="utf-8") as f:
            json.dump([record], f, ensure_ascii=False, indent=4)
        rewritten += 1
    print(f"[{market}] daily_index: rewrote {rewritten} files to a single record, deleted {deleted} with no matching trading data")


def clean_condition_text(records) -> int:
    fixed = 0
    for r in records:
        condition = r.get("condition", "")
        stripped = CONDITION_ARTIFACT_RE.sub("", condition).rstrip()
        if stripped != condition:
            r["condition"] = stripped
            fixed += 1
    return fixed


def clean_daily_punish(market: str) -> None:
    punish_dir = os.path.join(DATA_ROOT, market, "daily_punish")
    total_fixed = 0
    if os.path.exists(punish_dir):
        for fname in sorted(os.listdir(punish_dir)):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(punish_dir, fname)
            with open(path, encoding="utf-8") as f:
                records = json.load(f)
            fixed = clean_condition_text(records)
            if fixed:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(records, f, ensure_ascii=False, indent=4)
                total_fixed += fixed

    history_path = os.path.join(DATA_ROOT, market, "punish_history.json")
    if os.path.exists(history_path):
        with open(history_path, encoding="utf-8") as f:
            records = json.load(f)
        fixed = clean_condition_text(records)
        if fixed:
            with open(history_path, "w", encoding="utf-8") as f:
                json.dump(records, f, ensure_ascii=False, indent=4)
            total_fixed += fixed

    print(f"[{market}] daily_punish: stripped HTML artifact from {total_fixed} condition fields")


if __name__ == "__main__":
    for market in ["twse", "tpex"]:
        clean_daily_index(market)
        clean_daily_punish(market)
