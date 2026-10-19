"""起漲後漲幅與所需時間：從起漲日收盤價起算，找出收盤價首次達到各漲幅門檻的日期。

  - 基準價 = 起漲日收盤價；目標價 = 基準價 × (1 + 漲幅)
  - 達標 = 起漲日之後，收盤價第一次 >= 目標價
  - 交易日 = 在 stock_history 中相隔的 K 棒數；日曆天 = 日期相差天數
  - 資料未還原權息：起漲日之後任一日單日變動超過 ±10.5% 視為疑似除權息／分割並標記，
    達標日落在異常日之後的門檻會註記「可能失真」

用法：
    python src/gain_timing.py 6949 2026-05-04
    python src/gain_timing.py 6949:2026-05-04 2330:2026-03-02 --targets 30 50 100
"""

import argparse
import json
import os
import sys
from datetime import date

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "docs", "data")
MARKETS = ["twse", "tpex"]

DEFAULT_TARGETS = [50, 100, 200, 300, 400]
SPLIT_PCT = 0.105


def load_history(stock_id):
    """回傳 (market, 依日期排序的日 K list)；找不到回傳 (None, None)。"""
    for market in MARKETS:
        path = os.path.join(DATA, market, "stock_history", f"{stock_id}.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return market, sorted(json.load(f), key=lambda r: r["date"])
    return None, None


def find_anomalies(history, start_idx):
    """起漲日之後單日變動超過 SPLIT_PCT 的日子。"""
    out = []
    for i in range(start_idx + 1, len(history)):
        prev, cur = history[i - 1]["close"], history[i]["close"]
        if not prev:
            continue
        chg = cur / prev - 1
        if abs(chg) > SPLIT_PCT:
            out.append({"idx": i, "date": history[i]["date"], "prev_close": prev,
                        "close": cur, "change": chg})
    return out


def analyze(stock_id, start_date, targets=DEFAULT_TARGETS):
    market, history = load_history(stock_id)
    if history is None:
        raise SystemExit(f"找不到 {stock_id} 的歷史資料")
    start_idx = next((i for i, r in enumerate(history) if r["date"] == start_date), None)
    if start_idx is None:
        raise SystemExit(f"{stock_id} 在 {start_date} 沒有資料（可能非交易日，"
                         f"資料範圍 {history[0]['date']} ~ {history[-1]['date']}）")

    base = history[start_idx]["close"]
    anomalies = find_anomalies(history, start_idx)
    first_anomaly = anomalies[0]["idx"] if anomalies else None
    d0 = date.fromisoformat(start_date)

    rows = []
    for pct in targets:
        target = base * (1 + pct / 100)
        hit = next((i for i in range(start_idx + 1, len(history))
                    if history[i]["close"] >= target), None)
        row = {"pct": pct, "target": target, "hit": None, "suspect": False}
        if hit is not None:
            row["hit"] = {
                "date": history[hit]["date"],
                "close": history[hit]["close"],
                "trading_days": hit - start_idx,
                "calendar_days": (date.fromisoformat(history[hit]["date"]) - d0).days,
            }
            row["suspect"] = first_anomaly is not None and hit >= first_anomaly
        elif first_anomaly is not None:
            row["suspect"] = True  # 未達成但中途有異常，無法確定
        rows.append(row)

    peak = max(history[start_idx:], key=lambda r: r["close"])
    return {
        "stock_id": stock_id, "market": market, "start_date": start_date, "base": base,
        "last_date": history[-1]["date"], "peak": peak, "rows": rows, "anomalies": anomalies,
    }


def print_report(res):
    print(f"\n{res['stock_id']} ({res['market']})  起漲日 {res['start_date']}  "
          f"基準收盤 {res['base']:g}  資料至 {res['last_date']}")
    print(f"{'漲幅':>6} {'目標價':>10} {'達標日':>12} {'收盤':>9} {'交易日':>6} {'日曆天':>6}  備註")
    for r in res["rows"]:
        h = r["hit"]
        note = "可能失真" if r["suspect"] else ""
        if h:
            print(f"{'+%d%%' % r['pct']:>6} {r['target']:>10.2f} {h['date']:>12} {h['close']:>9g} "
                  f"{h['trading_days']:>6} {h['calendar_days']:>6}  {note}")
        else:
            note = "未達成" + ("（期間有異常，無法確定）" if r["suspect"] else "")
            print(f"{'+%d%%' % r['pct']:>6} {r['target']:>10.2f} {'-':>12} {'-':>9} {'-':>6} {'-':>6}  {note}")
    p = res["peak"]
    print(f"起漲後最高收盤 {p['close']:g}（{p['date']}，{p['close'] / res['base'] - 1:+.1%}）")
    for a in res["anomalies"]:
        print(f"⚠ 疑似除權息／分割：{a['date']}  {a['prev_close']:g} → {a['close']:g} "
              f"（{a['change']:+.1%}）")


def parse_stock_args(items):
    """接受 `代號 日期` 或多個 `代號:日期`。"""
    if len(items) == 2 and ":" not in items[0] and ":" not in items[1]:
        return [(items[0], items[1])]
    pairs = []
    for it in items:
        if ":" not in it:
            raise SystemExit(f"格式錯誤：{it}（請用 代號:日期，例如 6949:2026-05-04）")
        sid, d = it.split(":", 1)
        pairs.append((sid, d))
    return pairs


def main():
    if hasattr(sys.stdout, "reconfigure"):  # Windows cp950 無法輸出 ⚠
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("stocks", nargs="+", help="`代號 起漲日` 或多個 `代號:起漲日`")
    ap.add_argument("--targets", nargs="+", type=float, default=DEFAULT_TARGETS,
                    help="漲幅門檻（%%），預設 50 100 200 300 400")
    ap.add_argument("--json", action="store_true", help="輸出 JSON")
    args = ap.parse_args()

    results = [analyze(sid, d, args.targets) for sid, d in parse_stock_args(args.stocks)]
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for res in results:
            print_report(res)


if __name__ == "__main__":
    main()
