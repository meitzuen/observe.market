import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import backtest as bt  # noqa: E402


class SignalFilterTest(unittest.TestCase):
    def test_hs_strategies_registered_with_direction(self):
        self.assertEqual(bt.STRATEGIES["hs_bottom"], 1)
        self.assertEqual(bt.STRATEGIES["hs_top"], -1)

    def test_hs_keeps_only_breakout_day(self):
        for strat in ("hs_bottom", "hs_top"):
            day0 = {"status": "breakout", "days_since_cross": 0}
            self.assertTrue(bt.keep_signal(strat, day0))
            self.assertFalse(bt.keep_signal(strat, {"status": "breakout", "days_since_cross": 1}))
            self.assertFalse(bt.keep_signal(strat, {"status": "forming", "days_since_cross": None}))
            # files written before the field existed carry no cross day
            self.assertFalse(bt.keep_signal(strat, {"status": "breakout"}))

    def test_other_strategies_keep_everything(self):
        self.assertTrue(bt.keep_signal("gap_jump", {"id": "1101"}))


if __name__ == "__main__":
    unittest.main()
