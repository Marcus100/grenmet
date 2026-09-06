#!/usr/bin/env python3
"""Import existing JSON crawl data into the weather_images table."""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

INSERT_SQL = """
    INSERT INTO weather_images (
        storage_path, width, height, spider_name, file_format,
        is_animated, file_size_bytes, fetched_at, name, image_url,
        parent_url, page_title, source_modified, observation_time,
        etag, checksum, download_status, mode, frame_count, raw_metadata
    ) VALUES (
        %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s,
        %s, %s, %s, %s,
        %s, %s, %s, %s, %s, %s
    )
"""


def parse_iso_datetime(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def resolve_images_root(explicit):
    """Return the local directory holding stored images, or None if unknown.

    Falls back to IMAGES_STORE so the importer verifies against exactly the
    directory the crawler writes to. Object storage cannot be checked locally.
    """
    if explicit:
        return Path(explicit).expanduser()

    store = os.getenv("IMAGES_STORE", "").strip()
    if store and "://" not in store:
        return Path(store).expanduser()
    return None


def load_existing_keys(conn):
    """Return every (image_url, checksum) pair already recorded."""
    with conn.cursor() as cur:
        cur.execute("SELECT image_url, checksum FROM weather_images")
        return {(row[0], row[1]) for row in cur}


def build_row(item):
    """Map one crawl item onto the weather_images column order."""
    image_info = item.get("images", [])[0]
    image_urls = item.get("image_urls", [])
    return (
        image_info["path"],
        item.get("width", 0),
        item.get("height", 0),
        item.get("spider_name"),
        item.get("file_format"),
        item.get("is_animated", False),
        item.get("file_size_bytes"),
        parse_iso_datetime(item.get("fetched_at")),
        item.get("name"),
        image_urls[0] if image_urls else None,
        item.get("parent_url"),
        item.get("page_title"),
        parse_iso_datetime(item.get("source_modified")),
        parse_iso_datetime(item.get("observation_time")),
        item.get("etag"),
        image_info.get("checksum"),
        image_info.get("status"),
        item.get("mode"),
        item.get("frame_count", 1),
        json.dumps(item.get("raw_metadata", {})),
    )


def collect_rows(items, seen, images_root, counters):
    """Return insertable rows, recording why each rejected item was dropped.

    `seen` is updated as rows are accepted so that repeats within the archive
    are dropped too, not just those already in the database.
    """
    rows = []
    for item in items:
        images = item.get("images", [])
        if not images or not images[0].get("path"):
            counters["no_image"] += 1
            continue

        if not parse_iso_datetime(item.get("fetched_at")):
            counters["no_timestamp"] += 1
            continue

        image_urls = item.get("image_urls", [])
        key = (
            image_urls[0] if image_urls else None,
            images[0].get("checksum"),
        )
        if key in seen:
            counters["duplicate"] += 1
            continue

        if images_root is not None:
            if not (images_root / images[0]["path"]).is_file():
                counters["missing_file"] += 1
                continue

        seen.add(key)
        rows.append(build_row(item))

    return rows


def main(argv=None):
    import psycopg

    parser = argparse.ArgumentParser(
        description="Import archived JSON crawl output into weather_images"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be imported without writing to the database",
    )
    parser.add_argument(
        "--images-root",
        help="Directory holding stored images (defaults to IMAGES_STORE)",
    )
    args = parser.parse_args(argv)

    # Load local development settings from the project root
    project_root = Path(__file__).resolve().parent.parent
    load_dotenv(project_root / ".env.local")

    data_dir = project_root / "data"
    if not data_dir.exists():
        print(f"No data directory found at {data_dir}")
        sys.exit(1)

    json_files = sorted(data_dir.glob("*.json"))
    if not json_files:
        print("No JSON files found in data/")
        sys.exit(1)

    images_root = resolve_images_root(args.images_root)
    if images_root is None:
        print("IMAGES_STORE is unset or remote — skipping file existence checks")
    elif not images_root.is_dir():
        print(f"Images root does not exist: {images_root}", file=sys.stderr)
        sys.exit(2)
    else:
        print(f"Verifying images under {images_root}")

    db_host = os.getenv("DB_HOST", "127.0.0.1")
    db_port = int(os.getenv("DB_PORT", "5432"))
    db_name = os.getenv("DB_NAME", "wxwatch")
    db_user = os.getenv("DB_USER", "wxwatch")
    db_password = os.getenv("DB_PASSWORD")
    if not db_password:
        print("DB_PASSWORD is required", file=sys.stderr)
        sys.exit(2)

    conn = psycopg.connect(
        host=db_host,
        port=db_port,
        dbname=db_name,
        user=db_user,
        password=db_password,
    )
    print(f"Connected to {db_name}@{db_host}:{db_port}")
    if args.dry_run:
        print("DRY RUN — no rows will be written")

    seen = load_existing_keys(conn)
    print(f"{len(seen)} records already in weather_images")

    counters = {
        "inserted": 0,
        "duplicate": 0,
        "missing_file": 0,
        "no_image": 0,
        "no_timestamp": 0,
    }

    for json_file in json_files:
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                items = json.load(f)
        except json.JSONDecodeError as e:
            print(f"  {json_file.name}: SKIPPED (invalid JSON: {e})")
            continue

        rows = collect_rows(items, seen, images_root, counters)
        if not rows:
            continue

        if args.dry_run:
            counters["inserted"] += len(rows)
            continue

        try:
            with conn.cursor() as cur:
                cur.executemany(INSERT_SQL, rows)
            conn.commit()
            counters["inserted"] += len(rows)
        except psycopg.Error as e:
            print(f"  {json_file.name}: ERROR {e}")
            conn.rollback()
            # These rows were never written, so let a rerun retry them.
            for row in rows:
                seen.discard((row[9], row[15]))

    conn.close()

    verb = "would insert" if args.dry_run else "inserted"
    print(
        f"\nDone across {len(json_files)} files: {counters['inserted']} {verb}, "
        f"{counters['duplicate']} already present, "
        f"{counters['missing_file']} skipped (image not on disk), "
        f"{counters['no_image']} skipped (no download), "
        f"{counters['no_timestamp']} skipped (no fetched_at)"
    )


if __name__ == "__main__":
    main()
