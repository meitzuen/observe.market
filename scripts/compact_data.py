"""Rewrite every JSON under docs/data without indentation or extra spaces.

The pipeline scripts already write compact JSON; this converts the files that
were written before that change. Safe to re-run (idempotent).
"""

import json
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "docs" / "data"


def main():
    before = after = 0
    for path in DATA_DIR.rglob("*.json"):
        raw = path.read_bytes()
        out = json.dumps(
            json.loads(raw), ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")
        before += len(raw)
        after += len(out)
        if out != raw:
            path.write_bytes(out)
    print(f"{before / 1e6:.1f} MB -> {after / 1e6:.1f} MB", file=sys.stderr)


if __name__ == "__main__":
    main()
