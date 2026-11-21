import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import fetch_market_data as fas  # noqa: E402


class SplitIndexByDateTest(unittest.TestCase):
    def test_every_day_in_the_window_is_kept_under_its_iso_date(self):
        rows = [
            {"date": "115/08/14", "volume": 1},
            {"date": "115/08/17", "volume": 2},
            {"date": "115/08/31", "volume": 3},
        ]
        out = fas.split_index_by_date(rows)
        self.assertEqual(sorted(out), ["2026-08-14", "2026-08-17", "2026-08-31"])
        self.assertEqual(out["2026-08-17"], [{"date": "115/08/17", "volume": 2}])

    def test_malformed_rows_are_skipped(self):
        self.assertEqual(fas.split_index_by_date([{"x": 1}, {"date": "bad"}, None]), {})
        self.assertEqual(fas.split_index_by_date(None), {})


if __name__ == "__main__":
    unittest.main()
