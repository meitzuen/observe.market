"""頭肩底／頭肩頂選股。

只用日 K（高、低、收、量）以純規則偵測：

1. 取最近 ``LOOKBACK_DAYS`` 根 K 棒，轉成對數價格（門檻即近似百分比）。
2. 找出轉折低點（左右各 ``PIVOT_WINDOW`` 根都沒有更低）。
3. 在最近的轉折低點中挑出 (左肩, 頭, 右肩)：頭明顯最低、兩肩高度相近、
   兩肩之前有一段跌勢，頭與兩肩之間的反彈高點連成頸線。
4. 依收盤價相對頸線分類：``forming``（右肩已成形，尚未突破）、
   ``breakout``（最近 ``BREAKOUT_RECENT`` 根內收盤突破頸線）。
   更早就突破、或收盤跌破頭部低點的型態一律丟棄。

頭肩頂是同一套規則在鏡像價格（取負的對數）上執行。

讀取 ``docs/data/{market}/stock_history/{id}.json``，輸出
``docs/data/{market}/hs_bottom/{date}.json`` 與 ``hs_top/{date}.json``。
"""

import argparse
import json
import math
import os
from itertools import combinations

LOOKBACK_DAYS = 120
MIN_POINTS = 40
PIVOT_WINDOW = 4
MAX_PIVOTS = 6  # 只在最近 N 個轉折低點裡組合 (左肩, 頭, 右肩)
MIN_SPAN = 15  # 左肩到右肩最少／最多幾根 K 棒
MAX_SPAN = 100
MAX_RS_AGE = 25  # 右肩距今最多幾根
SHOULDER_TOL = 0.10  # 兩肩低點差距上限
HEAD_MARGIN = 0.03  # 頭至少比較低的肩再低多少
MIN_DEPTH = 0.06  # 頭到頸線的最小深度
SHOULDER_DEPTH = 0.02  # 兩肩至少低於頸線多少
SYMMETRY_RATIO = 3.0  # 左右半邊 K 棒數比的上限
PRIOR_BARS = 40
PRIOR_DROP = 0.08  # 左肩之前要有的跌幅
FORMING_MAX_GAP = 0.10  # forming：收盤距頸線不超過
BREAKOUT_RECENT = 3
MAX_RESULTS = 300


def _pivots(values, window):
    """轉折低點索引：左側不更低、右側嚴格不更低。"""
    out = []
    for i in range(window, len(values) - window):
        left = values[i - window : i]
        right = values[i + 1 : i + window + 1]
        if values[i] <= min(left) and values[i] < min(right):
            out.append(i)
    return out


def _find_bottom(lo, hi, cl):
    """在（對數）價格上找頭肩底，回傳最佳候選 dict 或 None。"""
    n = len(lo)
    pivots = _pivots(lo, PIVOT_WINDOW)[-MAX_PIVOTS:]
    best = None
    for a, b, c in combinations(pivots, 3):
        if not MIN_SPAN <= c - a <= MAX_SPAN or n - 1 - c > MAX_RS_AGE:
            continue
        if b - a < 2 or c - b < 2:
            continue
        shoulder_diff = abs(lo[a] - lo[c])
        if shoulder_diff > SHOULDER_TOL:
            continue
        if min(lo[a], lo[c]) - lo[b] < HEAD_MARGIN:
            continue
        ratio = (b - a) / (c - b)
        if not 1 / SYMMETRY_RATIO <= ratio <= SYMMETRY_RATIO:
            continue

        p1 = max(range(a + 1, b), key=lambda k: hi[k])
        p2 = max(range(b + 1, c), key=lambda k: hi[k])
        slope = (hi[p2] - hi[p1]) / (p2 - p1)

        def neck(t, p1=p1, slope=slope):
            return hi[p1] + slope * (t - p1)

        depth = neck(b) - lo[b]
        if depth < MIN_DEPTH:
            continue
        if neck(a) - lo[a] < SHOULDER_DEPTH or neck(c) - lo[c] < SHOULDER_DEPTH:
            continue
        if a < 5 or max(hi[max(0, a - PRIOR_BARS) : a]) - lo[a] < PRIOR_DROP:
            continue
        if min(cl[c + 1 :], default=cl[c]) < lo[b]:
            continue

        first_cross = next((j for j in range(c + 1, n) if cl[j] > neck(j)), None)
        last = n - 1
        if first_cross is None:
            if neck(last) - cl[last] > FORMING_MAX_GAP:
                continue
            status = "forming"
        elif cl[last] > neck(last) and last - first_cross < BREAKOUT_RECENT:
            status = "breakout"
        else:
            continue

        cand = {
            "a": a,
            "b": b,
            "c": c,
            "status": status,
            "neck_last": neck(last),
            "depth": depth,
            "key": (c, -shoulder_diff),
        }
        if best is None or cand["key"] > best["key"]:
            best = cand
    return best


def analyze_stock(points):
    """回傳 0~2 筆結果（頭肩底與／或頭肩頂）。points 為依日期排序的日 K。"""
    points = [
        p for p in points if all(p.get(k) and p[k] > 0 for k in ("high", "low", "close"))
    ][-LOOKBACK_DAYS:]
    if len(points) < MIN_POINTS:
        return []

    lo_log = [math.log(p["low"]) for p in points]
    hi_log = [math.log(p["high"]) for p in points]
    cl_log = [math.log(p["close"]) for p in points]

    last = points[-1]
    prev_close = points[-2]["close"]
    prior_vol = [p.get("volume") or 0 for p in points[-21:-1]]
    avg_vol = sum(prior_vol) / len(prior_vol)
    vol_ratio = round((last.get("volume") or 0) / avg_vol, 2) if avg_vol > 0 else None

    results = []
    for pattern, sign in (("bottom", 1), ("top", -1)):
        if sign == 1:
            lo, hi, cl = lo_log, hi_log, cl_log
        else:
            lo = [-v for v in hi_log]
            hi = [-v for v in lo_log]
            cl = [-v for v in cl_log]
        cand = _find_bottom(lo, hi, cl)
        if cand is None:
            continue

        def price(x, sign=sign):
            return math.exp(sign * x)

        neck = price(cand["neck_last"])
        target = price(cand["neck_last"] + cand["depth"])
        a, b, c = cand["a"], cand["b"], cand["c"]
        results.append(
            {
                "pattern": pattern,
                "status": cand["status"],
                "close": last["close"],
                "change_percent": round((last["close"] / prev_close - 1) * 100, 2),
                "neckline": round(neck, 2),
                "dist_to_neckline_pct": round((last["close"] / neck - 1) * 100, 2),
                "target": round(target, 2),
                "head_depth_pct": round((math.exp(cand["depth"]) - 1) * 100, 1),
                "left_shoulder_date": points[a]["date"],
                "left_shoulder_price": round(price(lo[a]), 2),
                "head_date": points[b]["date"],
                "head_price": round(price(lo[b]), 2),
                "right_shoulder_date": points[c]["date"],
                "right_shoulder_price": round(price(lo[c]), 2),
                "vol_ratio": vol_ratio,
            }
        )
    return results


def run_strategy_for_market(market_type, date_str=None, data_dir=None):
    if data_dir is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_dir = os.path.join(base_dir, "docs", "data")
    market_dir = os.path.join(data_dir, market_type)
    price_dir = os.path.join(market_dir, "daily_price")
    history_dir = os.path.join(market_dir, "stock_history")

    if not os.path.exists(price_dir) or not os.path.exists(history_dir):
        print(f"Missing price/history data for {market_type}, skipping.")
        return

    dates = sorted(f[:-5] for f in os.listdir(price_dir) if f.endswith(".json"))
    if not dates:
        print(f"No daily price data available for {market_type}.")
        return
    today_date = date_str if date_str else dates[-1]
    if today_date not in dates:
        print(f"Data for {today_date} not found in {market_type} price data.")
        return

    with open(os.path.join(price_dir, f"{today_date}.json"), encoding="utf-8") as f:
        today_data = json.load(f)

    found = {"bottom": [], "top": []}
    for stock in today_data:
        history_path = os.path.join(history_dir, f"{stock['id']}.json")
        if not os.path.exists(history_path):
            continue
        with open(history_path, encoding="utf-8") as f:
            points = json.load(f)
        points = [p for p in points if p["date"] <= today_date]
        if not points or points[-1]["date"] != today_date:
            continue
        for r in analyze_stock(points):
            found[r["pattern"]].append({"id": stock["id"], "name": stock["name"], **r})

    for pattern, rows in found.items():
        # 已突破的排前面，其次依距頸線距離由近到遠
        rows.sort(key=lambda r: (r["status"] != "breakout", abs(r["dist_to_neckline_pct"])))
        out_dir = os.path.join(market_dir, f"hs_{pattern}")
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, f"{today_date}.json"), "w", encoding="utf-8") as f:
            json.dump(rows[:MAX_RESULTS], f, ensure_ascii=False, indent=4)
        print(f"[{market_type}] {len(rows)} head-and-shoulders {pattern} for {today_date}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run head-and-shoulders screener.")
    parser.add_argument("--date_str", type=str, help="Date string in YYYY-MM-DD format")
    args = parser.parse_args()

    run_strategy_for_market("twse", args.date_str)
    run_strategy_for_market("tpex", args.date_str)
