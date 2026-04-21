import os
import json


def generate_manifest():
    # Base directory is one level up from this script (in the project root)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, "docs", "data")
    
    manifest = {
        "daily_index": [],
        "daily_price": [],
        "gap_jump": [],
        "gap_drop": [],
        "daily_punish": [],
    }

    if os.path.exists(os.path.join(data_dir, "daily_index")):
        manifest["daily_index"] = sorted(
            [
                f.replace(".json", "")
                for f in os.listdir(os.path.join(data_dir, "daily_index"))
                if f.endswith(".json")
            ],
            reverse=True,
        )

    if os.path.exists(os.path.join(data_dir, "daily_price")):
        manifest["daily_price"] = sorted(
            [
                f.replace(".json", "")
                for f in os.listdir(os.path.join(data_dir, "daily_price"))
                if f.endswith(".json")
            ],
            reverse=True,
        )

    if os.path.exists(os.path.join(data_dir, "gap_jump")):
        manifest["gap_jump"] = sorted(
            [
                f.replace(".json", "")
                for f in os.listdir(os.path.join(data_dir, "gap_jump"))
                if f.endswith(".json")
            ],
            reverse=True,
        )

    if os.path.exists(os.path.join(data_dir, "gap_drop")):
        manifest["gap_drop"] = sorted(
            [
                f.replace(".json", "")
                for f in os.listdir(os.path.join(data_dir, "gap_drop"))
                if f.endswith(".json")
            ],
            reverse=True,
        )

    if os.path.exists(os.path.join(data_dir, "daily_punish")):
        manifest["daily_punish"] = sorted(
            [
                f.replace(".json", "")
                for f in os.listdir(os.path.join(data_dir, "daily_punish"))
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
