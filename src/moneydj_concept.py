import re 
import requests

r = requests.get(
    "https://www.moneydj.com/z/zg/zge_EH001279_1.djhtm",
    headers={"User-Agent": "Mozilla/5.0"},
)
html = r.content.decode("big5", errors="replace")   # 一定要用 big5 decode
pairs = re.findall(r'<option[^>]*value="?(EH\d+)"?[^>]*>([^<]+)</option>', html)


concept_dict = {}

for code, name in pairs:
    concept_dict[code] = name.strip()

print(concept_dict)