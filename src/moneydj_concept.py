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
    _name = name.strip()
    _url = f'https://www.moneydj.com/z/zg/zge_{code}_1.djhtm'
    concept_dict[_name] = _url

print(concept_dict)