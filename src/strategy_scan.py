"""候選策略掃描：只用日 K 產生訊號，沿用 backtest.py 的成交與成本假設，
並把訊號日切成前 60%（樣本內）與後 40%（樣本外）比較勝率，避免只是挑到雜訊。

用法：
    python src/strategy_scan.py
    python src/strategy_scan.py --min-amount 1e8 --holds 1 3 5
"""

import argparse
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backtest as bt  # noqa: E402

MIN_HISTORY = 100


def mean(xs):
    return sum(xs) / len(xs)


def rsi(closes, i, n=2):
    gains = losses = 0.0
    for k in range(i - n + 1, i + 1):
        d = closes[k] - closes[k - 1]
        if d > 0:
            gains += d
        else:
            losses -= d
    if gains + losses == 0:
        return 50.0
    return 100 * gains / (gains + losses)


# 每個策略：fn(o, h, l, c, v, i) -> bool；僅使用 i 以前（含 i）的資料
def s_rsi2_oversold(o, h, l, c, v, i):
    return rsi(c, i, 2) < 10 and c[i] > mean(c[i - 99 : i + 1])


def s_three_down_uptrend(o, h, l, c, v, i):
    return c[i] < c[i - 1] < c[i - 2] < c[i - 3] and c[i] > mean(c[i - 49 : i + 1])


def s_big_drop_uptrend(o, h, l, c, v, i):
    return c[i] / c[i - 1] - 1 <= -0.05 and c[i] > mean(c[i - 49 : i + 1])


def s_bb_lower(o, h, l, c, v, i):
    w = c[i - 19 : i + 1]
    m = mean(w)
    sd = (sum((x - m) ** 2 for x in w) / 20) ** 0.5
    return sd > 0 and c[i] < m - 2 * sd and c[i] > mean(c[i - 99 : i + 1])


def s_breakout20_vol(o, h, l, c, v, i):
    return c[i] > max(h[i - 20 : i]) and v[i] > 1.5 * mean(v[i - 20 : i]) and c[i] > o[i]


def s_high60_momentum(o, h, l, c, v, i):
    return c[i] >= max(c[i - 59 : i + 1]) and c[i] > mean(c[i - 19 : i + 1])


def s_dry_pullback(o, h, l, c, v, i):
    """多頭中量縮回檔：收盤在 MA20 附近（±2%）、量低於 20 日均量 70%、前 5 日曾創 20 日新高。"""
    ma20 = mean(c[i - 19 : i + 1])
    recent_high = max(c[i - 5 : i]) >= max(c[i - 25 : i - 5])
    return (
        abs(c[i] / ma20 - 1) <= 0.02
        and v[i] < 0.7 * mean(v[i - 19 : i + 1])
        and c[i] > mean(c[i - 59 : i + 1])
        and recent_high
    )


SCANS = {
    "rsi2_oversold": s_rsi2_oversold,
    "three_down_uptrend": s_three_down_uptrend,
    "big_drop_uptrend": s_big_drop_uptrend,
    "bb_lower_uptrend": s_bb_lower,
    "breakout20_vol": s_breakout20_vol,
    "high60_momentum": s_high60_momentum,
    "dry_pullback": s_dry_pullback,
}


def arrays(bars, n):
    """把 {di: bar} 轉成連續陣列；任何缺漏的日子回傳 None（跳過該股）。"""
    if len(bars) < MIN_HISTORY + 2:
        return None
    lo = min(bars)
    hi = max(bars)
    if hi - lo + 1 != len(bars):
        return None
    pad = lo
    o = [0.0] * pad + [bars[k][0] for k in range(lo, hi + 1)]
    h = [0.0] * pad + [bars[k][1] for k in range(lo, hi + 1)]
    l = [0.0] * pad + [bars[k][2] for k in range(lo, hi + 1)]
    c = [0.0] * pad + [bars[k][3] for k in range(lo, hi + 1)]
    v = [0.0] * pad + [bars[k][4] for k in range(lo, hi + 1)]
    return o, h, l, c, v, lo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--holds", nargs="+", type=int, default=[1, 3, 5])
    ap.add_argument("--entries", nargs="+", default=["close", "next_open"])
    ap.add_argument("--min-amount", type=float, default=5e7)
    ap.add_argument("--split", type=float, default=0.6, help="樣本內佔訊號日的比例")
    ap.add_argument("--fee", type=float, default=0.001425)
    ap.add_argument("--tax", type=float, default=0.003)
    ap.add_argument("--slippage", type=float, default=0.001)
    args = ap.parse_args()
    cost = 2 * args.fee + args.tax + 2 * args.slippage

    data = {m: bt.load_prices(m) for m in bt.MARKETS}
    all_dates = sorted({d for m in bt.MARKETS for d in data[m][0]})
    cut_date = all_dates[int(len(all_dates) * args.split)]

    # 產生訊號：signals[name] -> [(market, series, di, date, stock_id)]
    signals = defaultdict(list)
    universe = []  # 全部可交易的 (market, bars, di, date) 用來算基準勝率
    for m in bt.MARKETS:
        dates, series = data[m]
        for sid, bars in series.items():
            if sid.startswith("00"):
                continue
            arr = arrays(bars, len(dates))
            if arr is None:
                continue
            o, h, l, c, v, lo = arr
            for i in range(max(lo + MIN_HISTORY, 100), max(bars)):  # 最後一天沒有後續
                if c[i] * v[i] < args.min_amount:
                    continue
                universe.append((bars, i, dates[i]))
                for name, fn in SCANS.items():
                    if fn(o, h, l, c, v, i):
                        signals[name].append((bars, i, dates[i]))

    print(f"來回成本 {cost:.3%}；流動性 >= {args.min_amount:,.0f}；已排除 ETF")
    print(f"樣本內：< {cut_date}；樣本外：>= {cut_date}\n")
    head = f"{'策略':<20}{'進場':<10}{'持有':>4}{'區段':>6}{'筆數':>8}{'勝率':>8}{'平均(淨)':>10}{'毛超額':>9}{'基準勝率':>9}"
    print(head)

    for entry in args.entries:
        for hold in args.holds:
            if entry == "close" and hold == 0:
                continue

            def run(pool, tag):
                rets, dts = [], []
                for bars, i, d in pool:
                    r = bt.trade_return(bars, i, entry, hold, 1)
                    if r is not None:
                        rets.append(r)
                        dts.append(d)
                return rets, dts

            u_rets, u_dts = run(universe, "u")
            # 基準：同進場／持有天數、同區段的全市場平均報酬與勝率（扣成本）
            def seg(rets, dts, part):
                if part == "all":
                    sel = rets
                elif part == "in":
                    sel = [r for r, d in zip(rets, dts) if d < cut_date]
                else:
                    sel = [r for r, d in zip(rets, dts) if d >= cut_date]
                return sel

            for name in SCANS:
                s_rets, s_dts = run(signals[name], name)
                for part in ("all", "in", "out"):
                    sr = seg(s_rets, s_dts, part)
                    ur = seg(u_rets, u_dts, part)
                    if len(sr) < 30 or not ur:
                        continue
                    win = sum(r - cost > 0 for r in sr) / len(sr)
                    bwin = sum(r - cost > 0 for r in ur) / len(ur)
                    net = mean(sr) - cost
                    gross_ex = mean(sr) - mean(ur)
                    label = {"all": "全部", "in": "樣本內", "out": "樣本外"}[part]
                    print(
                        f"{name:<20}{entry:<10}{hold:>4}{label:>6}{len(sr):>8}{win:>8.1%}"
                        f"{net:>10.2%}{gross_ex:>9.2%}{bwin:>9.1%}"
                    )
            print()


if __name__ == "__main__":
    main()
