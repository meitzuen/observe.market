"""策略回測：以 docs/data 內的日 K 與各策略每日輸出，計算訊號後的實際報酬。

資料只有盤後日 K，因此：
  - entry=close      訊號日收盤價進場（策略本身即以收盤判斷，屬事後可得的理想情境）
  - entry=next_open  訊號日隔天開盤進場（較貼近實際可執行）
  - 持有 N 日 = 進場日起算第 N 個交易日的收盤出場（N=0 為進場當日收盤）
  - 做空策略（xiaoge_short、gap_drop）報酬取負號
  - 當日漲停鎖死（開盤 >= 前收 +9.5%）無法買進、跌停鎖死無法放空，該筆排除
  - 資料未還原權息：持有期間任一日單日變動超過 ±10.5% 視為除權息／分割，該筆排除
  - 基準為「同進出場日、全市場等權平均」（不含成本）。
    超額(淨) = 策略報酬 - 基準 - 成本；毛超額 = 策略報酬 - 基準，看選股本身有無優勢
  - 累計／MDD 為每日 cohort 等權、攤成 1/max(持有日,1) 資金後的「單利加總」，
    非複利；持有 1 日每天全額換手，成本累計可能超過 -100%，請看與基準的相對差

用法：
    python src/backtest.py
    python src/backtest.py --strategies gap_jump vcp --min-amount 5e7
"""

import argparse
import json
import os
import statistics
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "docs", "data")
MARKETS = ["twse", "tpex"]

# 策略名稱 -> 方向（+1 做多 / -1 做空）
STRATEGIES = {
    "gap_jump": 1,
    "gap_drop": -1,
    "vcp": 1,
    "vol_candle_red": 1,
    "xiaoge_long": 1,
    "xiaoge_short": -1,
}

LIMIT_PCT = 0.095
SPLIT_PCT = 0.105


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_prices(market):
    """回傳 (dates, {stock_id: {date_index: (open, high, low, close, volume)}})。"""
    price_dir = os.path.join(DATA, market, "daily_price")
    dates = sorted(f[:-5] for f in os.listdir(price_dir) if f.endswith(".json"))
    series = defaultdict(dict)
    for i, d in enumerate(dates):
        for r in load_json(os.path.join(price_dir, d + ".json")):
            o, h, l, c = r.get("open"), r.get("high"), r.get("low"), r.get("close")
            if not all((o, h, l, c)):
                continue
            series[r["id"]][i] = (o, h, l, c, r.get("volume") or 0)
    return dates, series


def load_signals(market, strategy):
    d = os.path.join(DATA, market, strategy)
    if not os.path.isdir(d):
        return {}
    return {f[:-5]: load_json(os.path.join(d, f)) for f in sorted(os.listdir(d)) if f.endswith(".json")}


def trade_return(bars, di, entry, hold, direction):
    """單筆報酬（小數）；無法成交或資料不全回傳 None。"""
    prev = bars.get(di)
    if prev is None:
        return None
    if entry == "close":
        start = di
        px_in = prev[3]
    else:
        start = di + 1
        cur = bars.get(start)
        if cur is None:
            return None
        px_in = cur[0]
        gap = px_in / prev[3] - 1
        if direction > 0 and gap >= LIMIT_PCT:
            return None
        if direction < 0 and gap <= -LIMIT_PCT:
            return None
    end = start + hold
    bar_out = bars.get(end)
    if bar_out is None:
        return None
    # 持有期間含任一日跳動過大 → 視為權息／分割
    for k in range(di + 1, end + 1):
        a, b = bars.get(k - 1), bars.get(k)
        if a is None or b is None:
            return None
        if abs(b[3] / a[3] - 1) > SPLIT_PCT:
            return None
    return direction * (bar_out[3] / px_in - 1)


def baseline(series, di, entry, hold, min_amount):
    rets = []
    for bars in series.values():
        bar = bars.get(di)
        if bar is None or bar[3] * bar[4] < min_amount:
            continue
        r = trade_return(bars, di, entry, hold, 1)
        if r is not None:
            rets.append(r)
    return sum(rets) / len(rets) if rets else None


def summarize(rets, excess, cost):
    n = len(rets)
    net = [r - cost for r in rets]
    mean = sum(net) / n
    sd = statistics.pstdev(net) if n > 1 else 0
    t = mean / (sd / n**0.5) if sd else 0
    return {
        "n": n,
        "win": sum(1 for r in net if r > 0) / n,
        "mean": mean,
        "median": statistics.median(net),
        "excess": (sum(excess) / len(excess) - cost) if excess else float("nan"),
        "t": t,
    }


def equity_stats(daily, all_dates, hold, cost):
    """daily: {date: [單筆報酬...]}；每日 cohort 取等權平均，並攤成 1/max(hold,1) 的資金。

    回傳 (累計報酬, 最大回撤)；無訊號的日子報酬為 0。
    """
    scale = 1 / max(hold, 1)
    cum = peak = mdd = 0.0
    for d in all_dates:
        rs = daily.get(d)
        if rs:
            cum += (sum(rs) / len(rs) - cost) * scale
        peak = max(peak, cum)
        mdd = min(mdd, cum - peak)
    return cum, mdd


def collect(data, strat, entry, hold, args):
    """回傳 [(單筆報酬, 基準報酬或 None, 訊號列)]，已套用流動性／ETF 過濾。"""
    direction = STRATEGIES[strat]
    out, base_cache = [], {}
    for m in MARKETS:
        dates, series = data[m]
        idx = {d: i for i, d in enumerate(dates)}
        for d, rows in load_signals(m, strat).items():
            di = idx.get(d)
            if di is None:
                continue
            for r in rows:
                if args.exclude_etf and r["id"].startswith("00"):
                    continue
                bars = series.get(r["id"])
                bar = bars.get(di) if bars else None
                if bar is None or bar[3] * bar[4] < args.min_amount:
                    continue
                ret = trade_return(bars, di, entry, hold, direction)
                if ret is None:
                    continue
                key = (m, di)
                if key not in base_cache:
                    base_cache[key] = baseline(series, di, entry, hold, args.min_amount)
                b = base_cache[key]
                out.append((ret, None if b is None else direction * b, r))
    return out


def sensitivity(data, strat, field, entry, hold, args, cost, bins=4):
    """依訊號欄位分組（數值取分位數、其他取類別），比較各組報酬。"""
    trades = [t for t in collect(data, strat, entry, hold, args) if t[2].get(field) is not None]
    if not trades:
        print(f"（{strat} 沒有 {field} 欄位或無樣本）\n")
        return
    vals = [t[2][field] for t in trades]
    numeric = all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in vals)
    groups = defaultdict(list)
    if numeric:
        sv = sorted(vals)
        cuts = [sv[len(sv) * k // bins] for k in range(1, bins)]
        for t in trades:
            groups[sum(t[2][field] >= c for c in cuts)].append(t)
        lo = [sv[0]] + cuts
        hi = cuts + [sv[-1]]
        labels = {k: f"Q{k + 1} [{lo[k]:g} ~ {hi[k]:g}]" for k in range(bins)}
    else:
        for t in trades:
            groups[str(t[2][field])].append(t)
        labels = {k: k for k in groups}
    print(f"== {strat} 依 {field} 分組（進場 {entry}、持有 {hold}）==")
    print(f"{'組別':<28}{'筆數':>7}{'勝率':>8}{'平均(淨)':>10}{'毛超額':>9}{'t值':>7}")
    for k in sorted(groups):
        g = groups[k]
        ex = [t[0] - t[1] for t in g if t[1] is not None]
        sm = summarize([t[0] for t in g], ex, cost)
        flag = " *" if sm["n"] < 100 else ""
        print(
            f"{labels[k]:<28}{sm['n']:>7}{sm['win']:>8.1%}{sm['mean']:>10.2%}"
            f"{sm['excess'] + cost:>9.2%}{sm['t']:>7.1f}{flag}"
        )
    print("（* 樣本 < 100，僅供參考；t 值未考慮同日訊號相關，偏樂觀）\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strategies", nargs="+", default=list(STRATEGIES), choices=list(STRATEGIES))
    ap.add_argument("--holds", nargs="+", type=int, default=[0, 1, 3, 5, 10])
    ap.add_argument("--entries", nargs="+", default=["close", "next_open"], choices=["close", "next_open"])
    ap.add_argument("--min-amount", type=float, default=0, help="訊號日成交金額下限（元），過濾流動性不足標的")
    ap.add_argument("--exclude-etf", action="store_true", help="排除 ETF／ETN（代號以 00 開頭）")
    ap.add_argument("--by", nargs="+", metavar="FIELD", help="敏感度分析：依訊號欄位分組（搭配單一 --strategies）")
    ap.add_argument("--fee", type=float, default=0.001425, help="單邊手續費率（未打折）")
    ap.add_argument("--tax", type=float, default=0.003, help="賣出證交稅率")
    ap.add_argument("--slippage", type=float, default=0.001, help="單邊滑價")
    args = ap.parse_args()

    # 成本以「來回」計入報酬：手續費 x2 + 證交稅 + 滑價 x2。做空同樣近似。
    cost = 2 * args.fee + args.tax + 2 * args.slippage

    data = {m: load_prices(m) for m in MARKETS}
    print(f"來回成本 {cost:.3%}（手續費 {args.fee:.4%} x2 + 證交稅 {args.tax:.2%} + 滑價 {args.slippage:.2%} x2）")
    print(f"流動性門檻：成交金額 >= {args.min_amount:,.0f}　排除 ETF：{'是' if args.exclude_etf else '否'}\n")
    head = (
        f"{'策略':<15}{'進場':<10}{'持有':>4}{'筆數':>7}{'勝率':>8}{'平均':>9}{'中位數':>9}{'超額':>9}{'t值':>7}"
        f"{'累計':>9}{'MDD':>8}{'基準累計':>10}{'基準MDD':>9}"
    )
    all_dates = sorted({d for m in MARKETS for d in data[m][0]})

    if args.by:
        if len(args.strategies) != 1:
            ap.error("--by 需搭配恰好一個 --strategies")
        for field in args.by:
            for entry in args.entries:
                for hold in args.holds:
                    if hold == 0 and entry == "close":
                        continue
                    sensitivity(data, args.strategies[0], field, entry, hold, args, cost)
        return

    for strat in args.strategies:
        direction = STRATEGIES[strat]
        print(f"== {strat} ({'做多' if direction > 0 else '做空'}) ==")
        print(head)
        any_row = False
        for entry in args.entries:
            for hold in args.holds:
                if hold == 0 and entry == "close":
                    continue  # 收盤進、收盤出沒有意義
                rets, excess = [], []
                daily, bench = defaultdict(list), defaultdict(list)
                base_cache = {}
                for m in MARKETS:
                    dates, series = data[m]
                    idx = {d: i for i, d in enumerate(dates)}
                    for d, rows in load_signals(m, strat).items():
                        di = idx.get(d)
                        if di is None:
                            continue
                        for r in rows:
                            if args.exclude_etf and r["id"].startswith("00"):
                                continue
                            bars = series.get(r["id"])
                            bar = bars.get(di) if bars else None
                            if bar is None or bar[3] * bar[4] < args.min_amount:
                                continue
                            ret = trade_return(bars, di, entry, hold, direction)
                            if ret is None:
                                continue
                            key = (m, di)
                            if key not in base_cache:
                                base_cache[key] = baseline(series, di, entry, hold, args.min_amount)
                            rets.append(ret)
                            daily[d].append(ret)
                            if base_cache[key] is not None:
                                bench[d].append(direction * base_cache[key])
                                excess.append(ret - direction * base_cache[key])
                if not rets:
                    continue
                any_row = True
                s = summarize(rets, excess, cost)
                cum, mdd = equity_stats(daily, all_dates, hold, cost)
                bcum, bmdd = equity_stats(bench, all_dates, hold, cost)
                print(
                    f"{strat:<15}{entry:<10}{hold:>4}{s['n']:>7}{s['win']:>8.1%}"
                    f"{s['mean']:>9.2%}{s['median']:>9.2%}{s['excess']:>9.2%}{s['excess'] + cost:>8.2%}{s['t']:>7.1f}"
                    f"{cum:>9.1%}{mdd:>8.1%}{bcum:>10.1%}{bmdd:>9.1%}"
                )
        if not any_row:
            print("（無可用樣本）")
        print()


if __name__ == "__main__":
    main()
