#!/usr/bin/env python3

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from PIL import Image


SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

FILENAME_DATE_PATTERNS = [
    # PXL_20250725_162414037.jpg
    # PXL_20230508_132822144.PORTRAIT.jpg
    re.compile(r"(?<!\d)(20\d{6})(?:_\d{6,9})?"),

    # IMG-20250724-WA0000.jpg
    re.compile(r"(?<!\d)(20\d{6})(?=-WA)", re.IGNORECASE),

    # 20251206160730081.jpg
    re.compile(r"^(20\d{6})\d{6,}$"),
]


def date_from_filename(filename):
    for pattern in FILENAME_DATE_PATTERNS:
        match = pattern.search(filename)

        if not match:
            continue

        try:
            return datetime.strptime(
                match.group(1),
                "%Y%m%d"
            ).date()
        except ValueError:
            pass

    return None


def date_from_exif(path):
    try:
        with Image.open(path) as image:
            exif = image.getexif()

            # DateTimeOriginal
            # DateTime
            for tag in (36867, 306):
                value = exif.get(tag)

                if not value:
                    continue

                try:
                    return datetime.strptime(
                        str(value),
                        "%Y:%m:%d %H:%M:%S"
                    ).date()
                except ValueError:
                    pass

    except Exception as exc:
        print(f"  ⚠ EXIF read failed: {path.name}: {exc}")

    return None


def load_overrides(path):
    if not path.exists():
        return {}

    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict):
            raise ValueError("Overrides must be a JSON object")

        return data

    except Exception as exc:
        print(f"ERROR: Could not read {path}: {exc}")
        sys.exit(1)


def save_overrides(path, overrides):
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as f:
        json.dump(
            overrides,
            f,
            indent=2,
            ensure_ascii=False,
        )
        f.write("\n")


def get_photo_date(path, overrides):
    # 1. Filename
    date = date_from_filename(path.name)

    if date:
        return date, "filename"

    # 2. EXIF
    date = date_from_exif(path)

    if date:
        return date, "EXIF"

    # 3. Manual override
    override = overrides.get(path.name)

    if override:
        try:
            date = datetime.strptime(
                override,
                "%Y-%m-%d"
            ).date()

            return date, "override"

        except ValueError:
            print(
                f"  ⚠ Invalid override for {path.name}: "
                f"{override!r}"
            )

    return None, None


def convert_to_webp(source, destination, quality):
    destination.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with Image.open(source) as image:
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")

        image.save(
            destination,
            "WEBP",
            quality=quality,
            method=6,
        )


def main():
    parser = argparse.ArgumentParser(
        description="Process Moonweft gallery photos."
    )

    parser.add_argument(
        "source",
        type=Path,
        help="Folder containing original photos",
    )

    parser.add_argument(
        "--quality",
        type=int,
        default=85,
        help="WebP quality (default: 85)",
    )

    args = parser.parse_args()

    if not args.source.exists():
        print(f"ERROR: Source folder does not exist: {args.source}")
        sys.exit(1)

    if not args.source.is_dir():
        print(f"ERROR: Source is not a directory: {args.source}")
        sys.exit(1)

    repo_root = Path(__file__).resolve().parent.parent

    output_dir = repo_root / "assets" / "media"
    data_dir = repo_root / "data"

    gallery_json = data_dir / "gallery-data.json"
    overrides_json = data_dir / "gallery-overrides.json"

    print("Moonweft Gallery Processor")
    print("==========================")
    print(f"Source    : {args.source}")
    print(f"Output    : {output_dir}")
    print(f"Gallery   : {gallery_json}")
    print(f"Overrides : {overrides_json}")
    print()

    overrides = load_overrides(overrides_json)

    files = sorted(
        path
        for path in args.source.iterdir()
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not files:
        print("No supported images found.")
        return

    gallery = []
    missing_dates = []

    for source in files:
        photo_date, date_source = get_photo_date(
            source,
            overrides,
        )

        if not photo_date:
            print(
                f"⚠ NO DATE: {source.name}"
            )

            missing_dates.append(source.name)

            # Add it to the override file without
            # overwriting anything already entered.
            if source.name not in overrides:
                overrides[source.name] = ""

            continue

        year = photo_date.strftime("%Y")
        month = photo_date.strftime("%m")

        destination = (
            output_dir
            / year
            / month
            / f"{source.stem}.webp"
        )

        relative_url = (
            f"assets/media/{year}/{month}/"
            f"{source.stem}.webp"
        )

        print(
            f"✓ {source.name}"
            f" → {photo_date.isoformat()}"
            f" ({date_source})"
        )

        if not destination.exists():
            convert_to_webp(
                source,
                destination,
                args.quality,
            )

        gallery.append({
            "id": source.stem,
            "url": relative_url,
            "alt": f"Photo taken on "
                   f"{photo_date.strftime('%B %-d, %Y')}",
            "date": photo_date.isoformat(),
        })

    # Newest first.
    gallery.sort(
        key=lambda entry: entry["date"],
        reverse=True,
    )

    data_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    # Rebuild gallery-data.json from scratch.
    with gallery_json.open(
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            gallery,
            f,
            indent=2,
            ensure_ascii=False,
        )
        f.write("\n")

    # Save/update overrides.
    save_overrides(
        overrides_json,
        overrides,
    )

    print()
    print("==========================")
    print(f"Gallery entries : {len(gallery)}")
    print(f"Missing dates   : {len(missing_dates)}")
    print("==========================")

    if missing_dates:
        print()
        print("Add dates to:")
        print(overrides_json)
        print()

        for filename in missing_dates:
            print(f'  "{filename}": "YYYY-MM-DD"')


if __name__ == "__main__":
    main()