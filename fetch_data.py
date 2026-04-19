import requests
import json
import os
from datetime import datetime

# API 網址 (可以根據需求動態調整日期)
date_str = datetime.now().strftime("%Y-%m-%d")
url = f"https://market.smallplum.xyz/api/strategy/daily/stock_price?date_str={date_str}"

def fetch_and_save():
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()

        # 確保資料夾存在
        os.makedirs("data", exist_ok=True)
        
        # 儲存為今日資料
        with open(f"data/{date_str}.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
            
        # 同時儲存一份為 latest.json 方便前端固定讀取
        with open("data/latest.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
            
        print(f"成功更新資料: {date_str}")
    except Exception as e:
        print(f"抓取失敗: {e}")

if __name__ == "__main__":
    fetch_and_save()