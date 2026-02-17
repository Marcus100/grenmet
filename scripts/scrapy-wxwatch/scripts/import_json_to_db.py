#!/usr/bin/env python3
"""Import existing JSON crawl data into the weather_images table."""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


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


def main():
    import psycopg

    data_dir = Path(__file__).parent.parent / "data"
    if not data_dir.exists():
        print(f"No data directory found at {data_dir}")
        sys.exit(1)

    json_files = sorted(data_dir.glob("*.json"))
    if not json_files:
        print("No JSON files found in data/")
        sys.exit(1)

    db_host = os.getenv("DB_HOST", "127.0.0.1")
    db_port = int(os.getenv("DB_PORT", "5432"))
    db_name = os.getenv("DB_NAME", "wxwatch")
    db_user = os.getenv("DB_USER", "wxwatch")
    db_password = os.getenv("DB_PASSWORD", "changethis")

    conn = psycopg.connect(
        host=db_host, port=db_port, dbname=db_name,
        user=db_user, password=db_password,
    )
    print(f"Connected to {db_name}@{db_host}:{db_port}")

    sql = """
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

    total_inserted = 0
    total_skipped = 0

    for json_file in json_files:
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                items = json.load(f)
        except json.JSONDecodeError as e:
            print(f"  {json_file.name}: SKIPPED (invalid JSON: {e})")
            continue

        inserted = 0
        skipped = 0

        for item in items:
            images = item.get("images", [])
            if not images or not images[0].get("path"):
                skipped += 1
                continue

            image_info = images[0]
            image_urls = item.get("image_urls", [])
            fetched_at = parse_iso_datetime(item.get("fetched_at"))
            if not fetched_at:
                skipped += 1
                continue

            values = (
                image_info["path"],
                item.get("width", 0),
                item.get("height", 0),
                item.get("spider_name"),
                item.get("file_format"),
                item.get("is_animated", False),
                item.get("file_size_bytes"),
                fetched_at,
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

            try:
                conn.execute(sql, values)
                conn.commit()
                inserted += 1
            except psycopg.Error as e:
                print(f"  Error: {e}")
                conn.rollback()

        print(f"  {json_file.name}: {inserted} inserted, {skipped} skipped")
        total_inserted += inserted
        total_skipped += skipped

    conn.close()
    print(f"\nDone: {total_inserted} total inserted, {total_skipped} skipped, from {len(json_files)} files")


if __name__ == "__main__":
    main()