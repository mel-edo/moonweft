#!/usr/bin/env python3
"""
Generates lightweight WebP thumbnails for all photos in data/gallery-data.json
and updates gallery-data.json with the thumbnail paths.
"""

import json
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
GALLERY_JSON = REPO_ROOT / "data" / "gallery-data.json"
MAX_WIDTH = 480
THUMB_QUALITY = 75

def generate_thumbnail(src_path: Path, thumb_path: Path):
    with Image.open(src_path) as img:
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        w, h = img.size
        if w > MAX_WIDTH:
            new_h = int(h * (MAX_WIDTH / w))
            img = img.resize((MAX_WIDTH, new_h), Image.Resampling.LANCZOS)
        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(thumb_path, "WEBP", quality=THUMB_QUALITY, method=6)

def main():
    if not GALLERY_JSON.exists():
        print(f"Error: {GALLERY_JSON} not found.")
        return

    with GALLERY_JSON.open("r", encoding="utf-8") as f:
        gallery = json.load(f)

    updated_count = 0
    generated_count = 0

    for item in gallery:
        orig_rel = item.get("url")
        if not orig_rel:
            continue
        orig_path = REPO_ROOT / orig_rel
        if not orig_path.exists():
            print(f"Warning: {orig_path} does not exist, skipping.")
            continue

        thumb_rel = str(Path(orig_rel).with_name(f"{Path(orig_rel).stem}_thumb.webp"))
        thumb_path = REPO_ROOT / thumb_rel

        if not thumb_path.exists():
            generate_thumbnail(orig_path, thumb_path)
            generated_count += 1
            print(f"Generated thumb: {thumb_rel}")

        if item.get("thumb") != thumb_rel:
            item["thumb"] = thumb_rel
            updated_count += 1

    with GALLERY_JSON.open("w", encoding="utf-8") as f:
        json.dump(gallery, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"\nDone! Generated {generated_count} new thumbnails.")
    print(f"Updated {updated_count} entries in {GALLERY_JSON.name}.")

if __name__ == "__main__":
    main()
