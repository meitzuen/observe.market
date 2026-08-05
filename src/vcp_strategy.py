"""VCP (Volatility Contraction Pattern) screener.

Implements a simplified version of Mark Minervini's VCP screen:

1. Detect swing highs/lows in each stock's recent daily history using a
   percentage-based zigzag (so noise below ``ZIGZAG_PCT`` is ignored).
2. Turn the swing points into a sequence of pullback "legs" (swing high ->
   next swing low) and measure how deep each pullback is.
3. A genuine VCP shows a series of pullbacks that get shallower over time
   (each contraction smaller than the last), with trading volume drying up
   as the base tightens, while price stays near its recent high and above
   its 50-day moving average.
4. Combine those signals into a single 0-100 score so the results can be
   sorted/filtered on the front-end instead of a hard pass/fail cut.

Consumes ``docs/data/{market}/stock_history/{id}.json`` (produced by
``generate_stock_history.py``) and writes
``docs/data/{market}/vcp/{date}.json``.
"""

import argparse
import json
import os

# How many trailing trading days of history to analyse (roughly 6 months).
LOOKBACK_DAYS = 130
# Minimum number of daily bars required before we even attempt an analysis.
MIN_POINTS = 30
# Percentage reversal required for the zigzag to record a new swing point.
ZIGZAG_PCT = 4.0
# A stock needs at least this many completed pullback legs to be considered.
MIN_CONTRACTIONS = 2
# Only keep candidates scoring at least this well.
MIN_SCORE = 30
# Cap the output file size to the best candidates.
MAX_RESULTS = 300


def zigzag(highs, lows, pct_threshold=ZIGZAG_PCT):
    """Return alternating swing points as a list of (index, price, 'H'|'L').

    Uses a percentage-reversal zigzag: price must move ``pct_threshold``%
    away from the running extreme before a swing point is confirmed.
    """
    n = len(highs)
    if n == 0:
        return []

    pivots = []
    direction = None  # None, 'up', 'down'
    extreme_idx = 0
    extreme_price = highs[0]

    for i in range(1, n):
        if direction is None:
            up_move = (highs[i] - extreme_price) / extreme_price * 100
            down_move = (extreme_price - lows[i]) / extreme_price * 100
            if up_move >= pct_threshold:
                direction = "up"
                extreme_idx, extreme_price = i, highs[i]
            elif down_move >= pct_threshold:
                direction = "down"
                extreme_idx, extreme_price = i, lows[i]
        elif direction == "up":
            if highs[i] > extreme_price:
                extreme_idx, extreme_price = i, highs[i]
            drop = (extreme_price - lows[i]) / extreme_price * 100
            if drop >= pct_threshold:
                pivots.append((extreme_idx, extreme_price, "H"))
                direction = "down"
                extreme_idx, extreme_price = i, lows[i]
        elif direction == "down":
            if lows[i] < extreme_price:
                extreme_idx, extreme_price = i, lows[i]
            rise = (highs[i] - extreme_price) / extreme_price * 100
            if rise >= pct_threshold:
                pivots.append((extreme_idx, extreme_price, "L"))
                direction = "up"
                extreme_idx, extreme_price = i, highs[i]

    # Record the still-forming swing at the end of the series too, so the
    # most recent high/low is available even if it hasn't reversed yet.
    if direction == "up":
        pivots.append((extreme_idx, extreme_price, "H"))
    elif direction == "down":
        pivots.append((extreme_idx, extreme_price, "L"))

    return pivots


def build_contractions(pivots):
    """Turn swing points into completed High->Low pullback legs, oldest first.

    Returns ``(legs, swing_highs)`` where ``legs`` is a list of
    ``(start_index, depth_pct)`` for each High that is followed by a Low,
    and ``swing_highs`` is every High pivot (including the newest one even
    if no pullback has completed yet, so callers can still read the
    current pivot/resistance price).
    """
    swing_highs = [p for p in pivots if p[2] == "H"]
    legs = []
    for i, (idx, price, kind) in enumerate(pivots):
        if kind != "H":
            continue
        # Find the next Low after this High.
        for j in range(i + 1, len(pivots)):
            nxt = pivots[j]
            if nxt[2] == "L":
                depth = (price - nxt[1]) / price * 100 if price else 0
                legs.append((idx, round(depth, 2)))
                break
    return legs, swing_highs


def compute_score(contractions, volume_ratio, distance_to_pivot, above_ma50):
    """Weighted 0-100 quality score for how "VCP-like" the setup looks."""
    score = 0.0
    n = len(contractions)

    # More confirmed contraction legs (up to 5) = more convincing base. Max 20.
    score += min(n, 5) / 5 * 20

    # Each leg should be shallower than the previous one (10% tolerance). Max 25.
    pairs = list(zip(contractions, contractions[1:]))
    if pairs:
        good = sum(1 for a, b in pairs if b <= a * 1.1)
        score += (good / len(pairs)) * 25

    # Tighter final pullback = closer to a breakout. Ideal <=8%, fades to 0 at 25%. Max 20.
    tight_pct = contractions[-1] if contractions else 100
    score += max(0.0, 1 - tight_pct / 25) * 20

    # Volume should be drying up in the latest leg vs the first leg. Max 15.
    if volume_ratio is not None:
        vr = max(0.0, min(1.2, volume_ratio))
        score += max(0.0, (1.2 - vr) / 1.2) * 15

    # Price coiling just under (or already through) the pivot high. Max 10.
    if distance_to_pivot is not None:
        if distance_to_pivot < 0:
            score += 10
        else:
            score += max(0.0, 1 - distance_to_pivot / 12) * 10

    # Trend confirmation: trading above the 50-day moving average. Max 10.
    if above_ma50:
        score += 10

    return round(min(100.0, score), 1)


def analyze_stock(points):
    """Run the VCP analysis on one stock's history points.

    ``points`` is a chronologically sorted list of
    ``{date, open, high, low, close, volume}`` dicts.
    Returns a result dict, or None if the stock doesn't qualify.
    """
    points = [
        p for p in points if p.get("high") is not None and p.get("low") is not None
    ]
    if len(points) < MIN_POINTS:
        return None

    points = points[-LOOKBACK_DAYS:]
    highs = [p["high"] for p in points]
    lows = [p["low"] for p in points]
    closes = [p["close"] for p in points]
    volumes = [p.get("volume") or 0 for p in points]

    pivots = zigzag(highs, lows)
    legs, swing_highs = build_contractions(pivots)
    if len(legs) < MIN_CONTRACTIONS:
        return None

    # Trim to the most recent legs only — earlier history is noise for VCP.
    legs = legs[-5:]
    contractions = [depth for _, depth in legs]

    # Pivot (resistance) price = most recent confirmed swing high.
    _pivot_idx, pivot_price, _ = swing_highs[-1]
    close = closes[-1]
    distance_to_pivot = (
        round((pivot_price - close) / pivot_price * 100, 2) if pivot_price else None
    )

    # Volume dry-up: compare avg volume around the first vs last analysed leg.
    volume_ratio = None
    if len(legs) >= 2:
        first_idx = legs[0][0]
        last_idx = legs[-1][0]
        window = 5
        early_vols = volumes[max(0, first_idx - window) : first_idx + window + 1]
        late_vols = volumes[max(0, last_idx - window) : last_idx + window + 1]
        early_avg = sum(early_vols) / len(early_vols) if early_vols else 0
        late_avg = sum(late_vols) / len(late_vols) if late_vols else 0
        if early_avg > 0:
            volume_ratio = round(late_avg / early_avg, 3)

    ma50 = (
        round(sum(closes[-50:]) / len(closes[-50:]), 2) if len(closes) >= 50 else None
    )
    above_ma50 = ma50 is not None and close > ma50

    period_high = max(highs)
    period_low = min(lows)
    pct_from_period_high = (
        round((period_high - close) / period_high * 100, 2) if period_high else None
    )
    pct_from_period_low = (
        round((close - period_low) / period_low * 100, 2) if period_low else None
    )

    is_decreasing = (
        all(b <= a * 1.1 for a, b in zip(contractions, contractions[1:]))
        if len(contractions) > 1
        else True
    )

    score = compute_score(contractions, volume_ratio, distance_to_pivot, above_ma50)

    return {
        "close": close,
        "volume": volumes[-1],
        "pivot_price": round(pivot_price, 2),
        "distance_to_pivot": distance_to_pivot,
        "contractions": contractions,
        "num_contractions": len(contractions),
        "last_contraction_pct": contractions[-1],
        "is_decreasing": is_decreasing,
        "volume_ratio": volume_ratio,
        "ma50": ma50,
        "above_ma50": above_ma50,
        "pct_from_period_high": pct_from_period_high,
        "pct_from_period_low": pct_from_period_low,
        "period_days": len(points),
        "score": score,
    }


def run_strategy_for_market(market_type, date_str=None):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "docs", "data")
    market_dir = os.path.join(data_dir, market_type)

    price_dir = os.path.join(market_dir, "daily_price")
    history_dir = os.path.join(market_dir, "stock_history")

    if not os.path.exists(price_dir) or not os.path.exists(history_dir):
        print(f"Missing price/history data for {market_type}, skipping.")
        return

    daily_price_dates = sorted(
        f.replace(".json", "") for f in os.listdir(price_dir) if f.endswith(".json")
    )
    if not daily_price_dates:
        print(f"No daily price data available for {market_type}.")
        return

    today_date = date_str if date_str else daily_price_dates[-1]
    if today_date not in daily_price_dates:
        print(f"Data for {today_date} not found in {market_type} price data.")
        return

    with open(
        os.path.join(price_dir, f"{today_date}.json"), "r", encoding="utf-8"
    ) as f:
        today_data = json.load(f)

    results = []
    for stock in today_data:
        stock_id = stock["id"]
        history_path = os.path.join(history_dir, f"{stock_id}.json")
        if not os.path.exists(history_path):
            continue

        with open(history_path, "r", encoding="utf-8") as f:
            points = json.load(f)

        # Only analyse history up to (and including) the target date.
        points = [p for p in points if p["date"] <= today_date]

        analysis = analyze_stock(points)
        if analysis is None or analysis["score"] < MIN_SCORE:
            continue

        results.append(
            {
                "id": stock_id,
                "name": stock["name"],
                **analysis,
            }
        )

    results.sort(key=lambda r: r["score"], reverse=True)
    results = results[:MAX_RESULTS]

    vcp_dir = os.path.join(market_dir, "vcp")
    os.makedirs(vcp_dir, exist_ok=True)
    with open(os.path.join(vcp_dir, f"{today_date}.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=4)

    print(f"[{market_type}] Found {len(results)} VCP candidates for {today_date}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run VCP (Volatility Contraction Pattern) strategy."
    )
    parser.add_argument(
        "--date_str",
        type=str,
        help="Date string in YYYY-MM-DD format",
    )
    args = parser.parse_args()

    run_strategy_for_market("twse", args.date_str)
    run_strategy_for_market("tpex", args.date_str)
