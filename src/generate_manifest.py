import os
import json


def generate_manifest():
    # Base directory is one level up from this script (in the project root)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "docs", "data")
    
    manifest = {}

    for market in ["twse", "tpex"]:
        market_dir = os.path.join(data_dir, market)
        if not os.path.exists(market_dir):
            continue
            
        manifest[market] = {
            "daily_index": [],
            "daily_price": [],
            "gap_jump": [],
            "gap_drop": [],
            "daily_punish": [],
        }

        for category in manifest[market].keys():
            category_dir = os.path.join(market_dir, category)
            if os.path.exists(category_dir):
                manifest[market][category] = sorted(
                    [
                        f.replace(".json", "")
                        for f in os.listdir(category_dir)
                        if f.endswith(".json")
                    ],
                    reverse=True,
                )

    manifest_path = os.path.join(data_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=4)

    print(f"Manifest generated successfully at {manifest_path}")


if __name__ == "__main__":
    generate_manifest()
