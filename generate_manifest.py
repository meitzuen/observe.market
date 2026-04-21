import os
import json


def generate_manifest():
    data_dir = "data"
    manifest = {
        "daily_index": [],
        "daily_price": [],
        "gap_jump": [],
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

    if os.path.exists(os.path.join(data_dir, "daily_punish")):
        manifest["daily_punish"] = sorted(
            [
                f.replace(".json", "")
                for f in os.listdir(os.path.join(data_dir, "daily_punish"))
                if f.endswith(".json")
            ],
            reverse=True,
        )

    with open(os.path.join(data_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=4)

    print("Manifest generated successfully.")


if __name__ == "__main__":
    generate_manifest()
