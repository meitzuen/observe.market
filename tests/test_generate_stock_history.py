import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import generate_stock_history as gsh  # noqa: E402


def row(stock_id, close):
    return {"id": stock_id, "open": close, "high": close, "low": close,
            "close": close, "volume": 1}


class StockHistoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.price_dir = os.path.join(self.tmp.name, "twse", "daily_price")
        os.makedirs(self.price_dir)

    def add_day(self, date, rows):
        with open(os.path.join(self.price_dir, f"{date}.json"), "w") as f:
            json.dump(rows, f)

    def history(self, stock_id):
        path = os.path.join(self.tmp.name, "twse", "stock_history", f"{stock_id}.json")
        with open(path) as f:
            return json.load(f)

    def run_gen(self, **kw):
        gsh.generate_stock_history(self.tmp.name, **kw)

    def test_incremental_matches_full_rebuild(self):
        self.add_day("2024-01-02", [row("A", 1), row("B", 5)])
        self.add_day("2024-01-03", [row("A", 2)])
        self.run_gen()
        self.add_day("2024-01-04", [row("A", 3), row("C", 9)])
        self.run_gen()
        incremental = {s: self.history(s) for s in "ABC"}
        self.run_gen(full=True)
        self.assertEqual(incremental, {s: self.history(s) for s in "ABC"})
        self.assertEqual([p["date"] for p in incremental["A"]],
                         ["2024-01-02", "2024-01-03", "2024-01-04"])

    def test_rerun_replaces_last_day_without_duplicating(self):
        self.add_day("2024-01-02", [row("A", 1)])
        self.run_gen()
        self.add_day("2024-01-02", [row("A", 7)])
        self.run_gen()
        self.assertEqual([(p["date"], p["close"]) for p in self.history("A")],
                         [("2024-01-02", 7)])

    def test_untouched_stock_file_is_not_rewritten(self):
        self.add_day("2024-01-02", [row("A", 1), row("B", 5)])
        self.run_gen()
        path_b = os.path.join(self.tmp.name, "twse", "stock_history", "B.json")
        before = os.stat(path_b).st_mtime_ns
        self.add_day("2024-01-03", [row("A", 2)])
        self.run_gen()
        self.assertEqual(os.stat(path_b).st_mtime_ns, before)


if __name__ == "__main__":
    unittest.main()
