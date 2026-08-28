"""「小哥策略」當沖選股 screener — 多方（先買後賣）／空方（先賣後買）候選名單。

本站只有台股 TWSE/TPEX 的「盤後」日 K 資料（open/high/low/close/volume），
沒有分點籌碼、盤中 tick、內外盤與融資券資料，因此本策略只能實作原始口訣中
可由日 K + 成交量 + 概念股分類推導的部分：

  多方（先買後賣）
    - 爆量：今日量 / 20 日均量 >= VOL_RATIO_MIN
    - 當天收長紅且創近期新高（吃掉前幾天盤整區）
    - 前一天型態標記：小紅小黑（解套壓力小）／大長紅（慎防隔日沖倒貨）／
      大黑K（剛套牢賣壓）
    - 同族群當日同步走強的檔數（族群共振）

  空方（先賣後買）
    - 前一天大漲／接近鎖漲停
    - 當天開盤幅度：開盤強勢開高（>= GAP_OPEN_MAX_PCT）直接排除；開盤明顯
      轉弱（< GAP_OPEN_WEAK_PCT）優先
    - 技術面「做頭」型態近似：股價接近近 60 日高點且 20 日均線走平
    - 同族群當日平均漲跌幅（族群是否偏弱）

以下完全無法涵蓋，僅能靠使用者自行確認：隔日沖分點是否為「真愛」、
波段籌碼是否站在買方／賣方、隔日補跌股（需分點鎖單資訊）。

Consumes ``docs/data/{market}/daily_price/{date}.json``（歷史回看）與
``docs/data/concept/stock_concepts.json``，輸出至：

- ``docs/data/{market}/xiaoge_long/{date}.json``   （多方候選）
- ``docs/data/{market}/xiaoge_short/{date}.json``  （空方候選）
"""

import os
import json
import argparse

MARKETS = ("twse", "tpex")

# ── 多方 ──────────────────────────────────────────────────────────────
LOOKBACK_VOL_DAYS = 20  # 均量比分母天數
MIN_LOOKBACK_VOL = 10  # 至少要有這麼多天歷史才計算均量比
VOL_RATIO_MIN = 5.0  # 爆量門檻（今日量 / 20日均量）
MIN_VOLUME = 500_000  # 過濾冷門股（股數，等於 500 張）
BIG_CANDLE_PCT = 6.0  # 大長紅／大長黑的漲跌幅門檻
SMALL_CANDLE_PCT = 3.0  # 小紅小黑的漲跌幅門檻
NEW_HIGH_LOOKBACK = 20  # 「創近期新高」回看天數

# ── 空方 ──────────────────────────────────────────────────────────────
PRIOR_STRONG_PCT = 8.0  # 前一天視為強勢/接近鎖漲停的門檻
GAP_OPEN_MAX_PCT = 8.0  # 開盤漲幅 >= 此值直接排除（不能空）
GAP_OPEN_WEAK_PCT = 3.0  # 開盤漲幅 < 此值視為「明顯轉弱」
TREND_LOOKBACK = 60  # 做頭型態回看天數
NEAR_HIGH_RATIO = 0.92  # 收盤價需達近期高點的比例才算「高檔」
MA_WINDOW = 20  # 月線天數
MA_SLOPE_LOOKBACK = 5  # 判斷月線走平的比較天數
MA_FLAT_THRESHOLD = 0.015  # 月線走平的斜率門檻（相對變動比例）

# ── 族群共振 ──────────────────────────────────────────────────────────
GROUP_WEAK_THRESHOLD = -1.0  # 同族群平均漲跌幅 <= 此值視為族群偏弱
GROUP_STRONG_PCT = 3.0  # 同族群個股漲幅 >= 此值算作走強
GROUP_STRONG_MIN_PEERS = 2  # 至少幾檔同族群走強才標記族群共振


def _base_dir():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_json(path):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _price_dates(market_dir):
    price_dir = os.path.join(market_dir, "daily_price")
    if not os.path.exists(price_dir):
        return []
    return sorted(f.replace(".json", "") for f in os.listdir(price_dir) if f.endswith(".json"))


def load_concept_maps(data_dir):
    """回傳 (stock_to_concepts, concept_to_stocks)。"""
    concepts = _load_json(os.path.join(data_dir, "concept", "stock_concepts.json")) or []
    stock_to_concepts = {}
    concept_to_stocks = {}
    for c in concepts:
        name = c.get("name")
        ids = [it.get("stock_id") for it in c.get("items", []) if it.get("stock_id")]
        concept_to_stocks[name] = ids
        for sid in ids:
            stock_to_concepts.setdefault(sid, []).append(name)
    return stock_to_concepts, concept_to_stocks


def _peer_stats(sid, concepts, concept_to_stocks, all_today_by_id):
    peer_ids = set()
    for cname in concepts:
        for pid in concept_to_stocks.get(cname, []):
            if pid != sid:
                peer_ids.add(pid)

    peer_changes = []
    for pid in peer_ids:
        rec = all_today_by_id.get(pid)
        if rec and rec.get("change_percent") is not None:
            peer_changes.append(rec["change_percent"])

    peer_avg_change = sum(peer_changes) / len(peer_changes) if peer_changes else None
    peer_strong_count = sum(1 for x in peer_changes if x >= GROUP_STRONG_PCT)
    peer_weak = peer_avg_change is not None and peer_avg_change <= GROUP_WEAK_THRESHOLD
    return peer_avg_change, peer_strong_count, peer_weak


def run_strategy_for_market(
    market_type,
    date_str,
    stock_to_concepts,
    concept_to_stocks,
    all_today_by_id,
):
    base_dir = _base_dir()
    data_dir = os.path.join(base_dir, "docs", "data")
    market_dir = os.path.join(data_dir, market_type)

    all_dates = _price_dates(market_dir)
    if not all_dates:
        print(f"No daily price data for {market_type}.")
        return

    today_date = date_str or all_dates[-1]
    if today_date not in all_dates:
        print(f"Data for {today_date} not found in {market_type} price data.")
        return

    idx = all_dates.index(today_date)
    if idx == 0:
        print(f"No history before {today_date} for {market_type}. Skipping.")
        return

    hist_dates = all_dates[max(0, idx - TREND_LOOKBACK) : idx]  # 升冪，不含今天

    price_dir = os.path.join(market_dir, "daily_price")
    history = {}  # stock_id -> [record, ...]（升冪）
    for d in hist_dates:
        for s in _load_json(os.path.join(price_dir, f"{d}.json")) or []:
            history.setdefault(s["id"], []).append(s)

    today_data = _load_json(os.path.join(price_dir, f"{today_date}.json")) or []

    long_results = []
    short_results = []

    for stock in today_data:
        sid = stock["id"]
        name = stock.get("name")
        o, h, l, c = stock.get("open"), stock.get("high"), stock.get("low"), stock.get("close")
        vol = stock.get("volume") or 0
        chg_pct = stock.get("change_percent")

        if not all(isinstance(x, (int, float)) for x in (o, h, l, c)):
            continue
        if vol < MIN_VOLUME or chg_pct is None:
            continue

        hist = history.get(sid, [])
        concepts = stock_to_concepts.get(sid, [])
        peer_avg_change, peer_strong_count, peer_weak = _peer_stats(
            sid, concepts, concept_to_stocks, all_today_by_id
        )

        # ---- 前一天型態 ----
        prior_chg_pct = None
        prior_close = None
        if hist:
            prior_rec = hist[-1]
            prior_close = prior_rec.get("close")
            prior_chg_pct = prior_rec.get("change_percent")

        if prior_chg_pct is None:
            prior_pattern = "unknown"
        elif prior_chg_pct >= BIG_CANDLE_PCT:
            prior_pattern = "big_red"
        elif prior_chg_pct <= -BIG_CANDLE_PCT:
            prior_pattern = "big_black"
        elif abs(prior_chg_pct) <= SMALL_CANDLE_PCT:
            prior_pattern = "small"
        else:
            prior_pattern = "normal"

        # ── 多方候選：爆量 + 收長紅 + 創新高 ──────────────────────────
        if len(hist) >= MIN_LOOKBACK_VOL and c > o and chg_pct >= BIG_CANDLE_PCT:
            vol_hist = [r.get("volume") or 0 for r in hist[-LOOKBACK_VOL_DAYS:]]
            avg_vol = sum(vol_hist) / len(vol_hist) if vol_hist else 0
            vol_ratio = (vol / avg_vol) if avg_vol > 0 else 0

            if vol_ratio >= VOL_RATIO_MIN:
                recent_closes = [
                    r.get("close") for r in hist[-NEW_HIGH_LOOKBACK:] if r.get("close") is not None
                ]
                is_new_high = not recent_closes or c >= max(recent_closes)

                tags = []
                if prior_pattern == "small":
                    tags.append("前日小紅小黑，解套壓力小")
                elif prior_pattern == "big_red":
                    tags.append("⚠️ 前日大長紅，慎防隔日沖倒貨")
                elif prior_pattern == "big_black":
                    tags.append("⚠️ 前日大黑K，剛套牢賣壓")
                if is_new_high:
                    tags.append(f"創{NEW_HIGH_LOOKBACK}日新高")
                if peer_strong_count >= GROUP_STRONG_MIN_PEERS:
                    tags.append(f"同族群{peer_strong_count}檔同步走強")

                long_results.append(
                    {
                        "id": sid,
                        "name": name,
                        "close": c,
                        "open": o,
                        "high": h,
                        "low": l,
                        "diff": stock.get("change", 0),
                        "change_percent": chg_pct,
                        "volume": vol,
                        "avg_volume": round(avg_vol),
                        "vol_ratio": round(vol_ratio, 2),
                        "prior_change_percent": (
                            round(prior_chg_pct, 2) if prior_chg_pct is not None else None
                        ),
                        "prior_pattern": prior_pattern,
                        "is_new_high": is_new_high,
                        "peer_strong_count": peer_strong_count,
                        "tags": tags,
                    }
                )

        # ── 空方候選：前一天強勢 + 今日未開高鎖死 ──────────────────────
        if prior_chg_pct is not None and prior_chg_pct >= PRIOR_STRONG_PCT and prior_close:
            gap_open_pct = (o / prior_close - 1) * 100

            if gap_open_pct < GAP_OPEN_MAX_PCT:
                closes = [r.get("close") for r in hist if r.get("close") is not None] + [c]
                highs = [r.get("high") for r in hist if r.get("high") is not None] + [h]
                trend_high = max(highs) if highs else h
                near_high = trend_high > 0 and c >= NEAR_HIGH_RATIO * trend_high

                ma_now = sum(closes[-MA_WINDOW:]) / MA_WINDOW if len(closes) >= MA_WINDOW else None
                ma_prev = (
                    sum(closes[-MA_WINDOW - MA_SLOPE_LOOKBACK : -MA_SLOPE_LOOKBACK]) / MA_WINDOW
                    if len(closes) >= MA_WINDOW + MA_SLOPE_LOOKBACK
                    else None
                )
                ma_flat = bool(
                    ma_now and ma_prev and abs(ma_now - ma_prev) / ma_now <= MA_FLAT_THRESHOLD
                )
                topping_pattern = bool(near_high and ma_flat)
                risk_breakout = not near_high

                gap_class = "weak_open" if gap_open_pct < GAP_OPEN_WEAK_PCT else "mid_open"

                tags = []
                tags.append("今日開盤明顯轉弱" if gap_class == "weak_open" else "今日開盤普通，觀察中")
                if peer_weak:
                    tags.append("同族群普遍疲弱")
                if topping_pattern:
                    tags.append("高檔月線走平，疑似做頭")
                if risk_breakout:
                    tags.append("⚠️ 股價未創高，慎防為剛突破而非出貨")

                short_results.append(
                    {
                        "id": sid,
                        "name": name,
                        "close": c,
                        "open": o,
                        "high": h,
                        "low": l,
                        "diff": stock.get("change", 0),
                        "change_percent": chg_pct,
                        "volume": vol,
                        "prior_change_percent": round(prior_chg_pct, 2),
                        "gap_open_percent": round(gap_open_pct, 2),
                        "gap_class": gap_class,
                        "near_high": near_high,
                        "ma_flat": ma_flat,
                        "topping_pattern": topping_pattern,
                        "peer_avg_change": (
                            round(peer_avg_change, 2) if peer_avg_change is not None else None
                        ),
                        "peer_weak": peer_weak,
                        "risk_breakout": risk_breakout,
                        "tags": tags,
                    }
                )

    long_results.sort(key=lambda r: -r["vol_ratio"])
    short_results.sort(key=lambda r: (r["gap_open_percent"], -r["prior_change_percent"]))

    long_dir = os.path.join(market_dir, "xiaoge_long")
    os.makedirs(long_dir, exist_ok=True)
    with open(os.path.join(long_dir, f"{today_date}.json"), "w", encoding="utf-8") as f:
        json.dump(long_results, f, ensure_ascii=False, indent=4)
    print(f"[{market_type}] {today_date}: {len(long_results)} 檔多方候選（小哥策略）")

    short_dir = os.path.join(market_dir, "xiaoge_short")
    os.makedirs(short_dir, exist_ok=True)
    with open(os.path.join(short_dir, f"{today_date}.json"), "w", encoding="utf-8") as f:
        json.dump(short_results, f, ensure_ascii=False, indent=4)
    print(f"[{market_type}] {today_date}: {len(short_results)} 檔空方候選（小哥策略）")


def main(date_str=None):
    base_dir = _base_dir()
    data_dir = os.path.join(base_dir, "docs", "data")
    stock_to_concepts, concept_to_stocks = load_concept_maps(data_dir)

    # 合併雙市場當天資料，供族群同儕統計使用（概念股不分上市/上櫃）。
    all_today_by_id = {}
    for market in MARKETS:
        market_dir = os.path.join(data_dir, market)
        dates = _price_dates(market_dir)
        if not dates:
            continue
        d = date_str or dates[-1]
        if d not in dates:
            continue
        for s in _load_json(os.path.join(market_dir, "daily_price", f"{d}.json")) or []:
            all_today_by_id[s["id"]] = s

    for market in MARKETS:
        run_strategy_for_market(
            market, date_str, stock_to_concepts, concept_to_stocks, all_today_by_id
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run 小哥策略 day-trade screener.")
    parser.add_argument("--date_str", type=str, help="Date string in YYYY-MM-DD format")
    args = parser.parse_args()

    main(args.date_str)
