import json
import time

import requests

API_URL = "https://market.smallplum.xyz/api/mktobs/watchlist"
DATA_PATH = "docs/data/concept/stock_concepts.json"
START_ORDER = 15

valid_list = [
    "AI PC概念股",
    "AIoT物聯網概念股",
    "AI伺服器概念股",
    "AI智慧眼鏡概念股",
    "BBU概念股",
    "CES概念股",
    "CoPoS概念股",
    "CoWoS概念股",
    "FOPLP概念股",
    "Google TPU概念股",
    "MOSFET(電晶體)概念股",
    "PS5概念股",
    "WiFi 7概念股",
    "太空AI概念股",
    "太陽能概念股",
    "水資源概念股",
    "任天堂Switch概念股",
    "光棍節(雙11)受惠概念股",
    "再生醫療概念股",
    "低軌衛星概念股",
    "折疊式手機概念股",
    "車用電子概念股",
    "固態電池概念股",
    "物流概念股",
    "矽光概念股",
    "星鏈計畫(Starlink)概念股",
    "軍工概念股",
    "特斯拉人形機器人概念股",
    "區塊鏈概念股",
    "氫能概念股",
    "第三代半導體概念股",
    "軟板概念股",
    "無人機概念股",
    "稀土概念股",
    "虛擬貨幣概念股",
    "虛擬實境概念股",
    "超級電容概念股",
    "超透鏡概念股",
    "量子電腦概念股",
    "鈣鈦礦太陽能電池概念股",
    "雲端運算概念股",
    "碳權概念股",
    "精準醫療概念股",
    "機器人概念股",
    "燃料電池概念股",
    "儲能系統概念股",
    "儲能概念股",
    "磷化銦概念股",
    "磷酸鋰鐵電池概念股",
    "擴增實境(AR)概念股",
    "邊緣運算概念股",
]


def main():
    with open(DATA_PATH, encoding="utf-8") as f:
        concepts = json.load(f)

    session = requests.Session()
    order = START_ORDER
    created = []

    for concept in concepts:
        if concept["name"] not in valid_list:
            continue

        payload = {
            "name": concept["name"],
            "order": order,
            "note": None,
            "items": [{"stock_id": item["stock_id"]} for item in concept["items"]],
        }

        r = session.post(API_URL, json=payload, timeout=15)
        if r.status_code != 201:
            print(
                f"[FAIL] order={order} name={payload['name']} status={r.status_code} body={r.text}"
            )
        else:
            print(
                f"[OK] order={order} name={payload['name']} items={len(payload['items'])}"
            )
            created.append(payload["name"])
        time.sleep(0.1)

        order += 1

    print(f"\ndone. {len(created)} created out of {len(concepts)} attempted.")


if __name__ == "__main__":
    main()
