import re
import requests
import time
import json

session = requests.Session()
session.headers.update({"User-Agent": "Mozilla/5.0"})

r = session.get("https://www.moneydj.com/z/zg/zge_EH001279_1.djhtm", timeout=10)
html = r.content.decode("big5", errors="replace")
pairs = re.findall(r'<option[^>]*value="?(EH\d+)"?[^>]*>([^<]+)</option>', html)

concepts = [(code, name.strip()) for code, name in pairs]

results = []
for code, name in concepts:
    url = f"https://www.moneydj.com/z/zg/zge_{code}_1.djhtm"
    try:
        r = session.get(url, timeout=10)
        page = r.content.decode("big5", errors="replace")
    except requests.RequestException as e:
        print(f"[skip] {code} {name}: {e}")
        continue

    ids = re.findall(r"GenLink2stk\('A[SO](\w+)'", page)
    seen = set()
    items = [{"stock_id": i} for i in ids if not (i in seen or seen.add(i))]

    results.append({"code": code, "name": name, "items": items})
    time.sleep(0.3)

with open("stock_concepts.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"done, {len(results)} concepts")