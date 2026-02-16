#!/usr/bin/env python3
"""Import scraped JSON data into PostgreSQL for gallery and analysis."""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

import psycopg2
from psycopg2.extras import Json

# Database configuration (override with environment variables)
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432"),
    "database": os.getenv("DB_NAME", "wxwatch"),
    "user": os.getenv("DB_USER", "wxwatch"),
    "password": os.getenv("DB_PASSWORD", "wxwatch_password"),
}


def parse_datetime(value):
    """Parse ISO datetime string to datetime object."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def import_json_file(conn, json_path, spider_name):
    """Import a single JSON file into the database."""
    print(f"Importing {json_path.name} (spider: {spider_name})...")

    with open(json_path, "r", encoding="utf-8") as f:
        items = json.load(f)

    if not items:
        print(f"  No items found")
        return 0

    sql = """
        INSERT INTO weather_images (
            -- Gallery core
            storage_path, width, height, spider_name,
            file_format, is_animated, file_size_bytes, fetched_at,
            -- Analysis: source
            name, image_url, parent_url, page_title, source_modified,
            -- Analysis: HTTP
            etag, checksum, download_status,
            -- Analysis: technical
            mode, frame_count,
            -- Analysis: raw
            raw_metadata
        ) VALUES (
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s,
            %s
        )
        ON CONFLICT (checksum) DO UPDATE SET
            fetched_at = EXCLUDED.fetched_at,
            source_modified = EXCLUDED.source_modified,
            etag = EXCLUDED.etag,
            download_status = EXCLUDED.download_status,
            raw_metadata = EXCLUDED.raw_metadata
    """

    inserted = 0
    skipped = 0

    with conn.cursor() as cur:
        for item in items:
            images = item.get("images", [])
            if not images or not images[0].get("path"):
                skipped += 1
                continue

            image_info = images[0]
            image_urls = item.get("image_urls", [])

            values = (
                # Gallery core
                image_info["path"],
                item.get("width"),
                item.get("height"),
                spider_name,
                item.get("file_format"),
                item.get("is_animated", False),
                item.get("file_size_bytes"),
                parse_datetime(item.get("fetched_at")),
                # Analysis: source
                item.get("name"),
                image_urls[0] if image_urls else None,
                item.get("parent_url"),
                item.get("page_title"),
                parse_datetime(item.get("source_modified")),
                # Analysis: HTTP
                item.get("etag"),
                image_info.get("checksum"),
                image_info.get("status"),
                # Analysis: technical
                item.get("mode"),
                item.get("frame_count", 1),
                # Analysis: raw
                Json(item.get("raw_metadata", {})),
            )

            try:
                cur.execute(sql, values)
                inserted += 1
            except psycopg2.Error as e:
                print(f"  Error inserting record: {e}")
                conn.rollback()

    conn.commit()
    print(f"  Inserted: {inserted}, Skipped: {skipped}")
    return inserted


def detect_spider_name(filename):
    """Infer spider name from JSON filename."""
    stem = Path(filename).stem.lower().replace("_output", "")
    return stem


def main():
    """Main entry point."""
    project_root = Path(__file__).parent.parent

    # Find all JSON output files
    json_files = list(project_root.glob("*_output.json"))

    if not json_files:
        print("No *_output.json files found in project root.")
        print("Run spiders first:")
        print("  scrapy crawl cimss -o cimss_output.json")
        sys.exit(1)

    print(f"Found {len(json_files)} JSON file(s) to import:\n")

    # Connect to database
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print("Connected to PostgreSQL\n")
    except psycopg2.Error as e:
        print(f"Database connection failed: {e}")
        print("\nMake sure PostgreSQL is running:")
        print("  docker-compose up -d")
        sys.exit(1)

    # Import each JSON file
    total = 0
    try:
        for json_file in json_files:
            spider_name = detect_spider_name(json_file.name)
            count = import_json_file(conn, json_file, spider_name)
            total += count
            print()
    finally:
        conn.close()

    print(f"Done! Imported {total} total records.")


if __name__ == "__main__":
    main()

