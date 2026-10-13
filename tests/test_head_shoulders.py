import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import head_shoulders as hs  # noqa: E402


def make_points(waypoints, n, mirror=None):
    """Linear interpolation of closes through (index, price) waypoints, length n.

    high/low are close +/- 1%. ``mirror`` maps price -> mirror/price to build a
    head-and-shoulders top from a bottom (exact mirror in log space).
    """
    xs = [w[0] for w in waypoints]
    pts = []
    for i in range(n):
        for k in range(len(xs) - 1):
            if xs[k] <= i <= xs[k + 1]:
                x0, p0 = waypoints[k]
                x1, p1 = waypoints[k + 1]
                close = p0 + (p1 - p0) * (i - x0) / (x1 - x0)
                break
        else:
            close = waypoints[-1][1]
        if mirror:
            close = mirror / close
        pts.append(
            {
                "date": f"d{i:03d}",
                "open": close,
                "high": close * 1.01,
                "low": close * 0.99,
                "close": close,
                "volume": 1000,
            }
        )
    return pts


# Left shoulder @20 (100), head @44 (88), right shoulder @68 (100), neckline ~112.
BASE = [(0, 130), (20, 100), (32, 112), (44, 88), (56, 112), (68, 100)]
FORMING = BASE + [(74, 106)]
BREAKOUT = BASE + [(73, 115)]
MIRROR = 20000


def one(points, pattern):
    return [r for r in hs.analyze_stock(points) if r["pattern"] == pattern]


class HeadShouldersBottomTest(unittest.TestCase):
    def test_forming(self):
        res = one(make_points(FORMING, 75), "bottom")
        self.assertEqual(len(res), 1)
        r = res[0]
        self.assertEqual(r["status"], "forming")
        self.assertEqual(r["left_shoulder_date"], "d020")
        self.assertEqual(r["head_date"], "d044")
        self.assertEqual(r["right_shoulder_date"], "d068")
        self.assertAlmostEqual(r["neckline"], 112 * 1.01, delta=0.5)
        self.assertLess(r["dist_to_neckline_pct"], 0)
        self.assertGreater(r["target"], r["neckline"])
        self.assertEqual(one(make_points(FORMING, 75), "top"), [])

    def test_breakout(self):
        res = one(make_points(BREAKOUT, 74), "bottom")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["status"], "breakout")
        self.assertEqual(res[0]["days_since_cross"], 0)
        self.assertGreater(res[0]["dist_to_neckline_pct"], 0)

    def test_breakout_one_day_old(self):
        wps = BASE + [(73, 115), (74, 116)]
        res = one(make_points(wps, 75), "bottom")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["status"], "breakout")
        self.assertEqual(res[0]["days_since_cross"], 1)

    def test_forming_has_no_cross_day(self):
        res = one(make_points(FORMING, 75), "bottom")
        self.assertIsNone(res[0]["days_since_cross"])

    def test_stale_breakout_is_dropped(self):
        wps = BASE + [(73, 115), (83, 118)]
        self.assertEqual(one(make_points(wps, 84), "bottom"), [])

    def test_invalidated_below_head_is_dropped(self):
        wps = BASE + [(72, 105), (76, 85)]
        self.assertEqual(one(make_points(wps, 77), "bottom"), [])

    def test_equal_lows_is_not_head_and_shoulders(self):
        wps = [(0, 130), (20, 100), (32, 112), (44, 100), (56, 112), (68, 100), (74, 106)]
        self.assertEqual(one(make_points(wps, 75), "bottom"), [])

    def test_no_prior_downtrend_is_dropped(self):
        wps = [(0, 98)] + BASE[1:] + [(74, 106)]
        self.assertEqual(one(make_points(wps, 75), "bottom"), [])

    def test_steady_uptrend_has_no_pattern(self):
        pts = make_points([(0, 50), (100, 150)], 101)
        self.assertEqual(hs.analyze_stock(pts), [])

    def test_too_little_history(self):
        self.assertEqual(hs.analyze_stock(make_points(FORMING, 75)[:20]), [])


class HeadShouldersTopTest(unittest.TestCase):
    def test_forming_top(self):
        res = one(make_points(FORMING, 75, mirror=MIRROR), "top")
        self.assertEqual(len(res), 1)
        r = res[0]
        self.assertEqual(r["status"], "forming")
        self.assertEqual(r["head_date"], "d044")
        self.assertGreater(r["dist_to_neckline_pct"], 0)
        self.assertLess(r["target"], r["neckline"])
        self.assertEqual(one(make_points(FORMING, 75, mirror=MIRROR), "bottom"), [])

    def test_breakdown_top(self):
        res = one(make_points(BREAKOUT, 74, mirror=MIRROR), "top")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["status"], "breakout")
        self.assertLess(res[0]["dist_to_neckline_pct"], 0)


class RunStrategyTest(unittest.TestCase):
    def test_writes_both_files_and_filters_history_by_date(self):
        with tempfile.TemporaryDirectory() as d:
            m = os.path.join(d, "twse")
            for sub in ("daily_price", "stock_history"):
                os.makedirs(os.path.join(m, sub))
            pts = make_points(FORMING, 75)
            with open(os.path.join(m, "stock_history", "1111.json"), "w") as f:
                json.dump(pts, f)
            with open(os.path.join(m, "daily_price", "d074.json"), "w") as f:
                json.dump([{"id": "1111", "name": "測試"}], f)
            hs.run_strategy_for_market("twse", None, data_dir=d)
            with open(os.path.join(m, "hs_bottom", "d074.json"), encoding="utf-8") as f:
                bottom = json.load(f)
            with open(os.path.join(m, "hs_top", "d074.json"), encoding="utf-8") as f:
                top = json.load(f)
            self.assertEqual([r["id"] for r in bottom], ["1111"])
            self.assertEqual(bottom[0]["name"], "測試")
            self.assertEqual(top, [])

    def test_backfill_matches_single_day_run_and_skips_short_history(self):
        with tempfile.TemporaryDirectory() as d:
            m = os.path.join(d, "twse")
            os.makedirs(os.path.join(m, "daily_price"))
            os.makedirs(os.path.join(m, "stock_history"))
            pts = make_points(FORMING, 75)
            with open(os.path.join(m, "stock_history", "1111.json"), "w") as f:
                json.dump(pts, f)
            for p in pts:
                with open(os.path.join(m, "daily_price", p["date"] + ".json"), "w") as f:
                    json.dump([{"id": "1111", "name": "測試"}], f)

            hs.backfill_market("twse", data_dir=d)
            out = os.path.join(m, "hs_bottom")
            dates = sorted(os.listdir(out))
            # earliest date needs MIN_POINTS bars of history
            self.assertEqual(dates[0], pts[hs.MIN_POINTS - 1]["date"] + ".json")
            self.assertEqual(dates[-1], "d074.json")
            with open(os.path.join(out, "d074.json"), encoding="utf-8") as f:
                backfilled = json.load(f)

            os.remove(os.path.join(out, "d074.json"))
            hs.run_strategy_for_market("twse", "d074", data_dir=d)
            with open(os.path.join(out, "d074.json"), encoding="utf-8") as f:
                self.assertEqual(json.load(f), backfilled)


if __name__ == "__main__":
    unittest.main()
