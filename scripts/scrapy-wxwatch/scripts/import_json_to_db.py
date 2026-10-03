#!/usr/bin/env python3
"""Import existing JSON crawl data into the weather_images table."""

import argparse
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv


def parse_iso_datetime(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            return dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)
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
    # Historical entry point retained, but database access belongs to FastAPI.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.api import ArchiveClient, image_payload

    parser = argparse.ArgumentParser(
        description="Import saved crawl feeds through FastAPI"
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--images-root")
    args = parser.parse_args(argv)
    project_root = Path(__file__).resolve().parents[1]
    load_dotenv(project_root / ".env.local")
    root = resolve_images_root(args.images_root) or project_root / "data/images"
    client = None if args.dry_run else ArchiveClient()
    runs = {}
    failed = False
    try:
        for path in sorted((project_root / "data").rglob("*.json")):
            for item in json.loads(path.read_text()):
                images = item.get("images", [])
                if not images or not images[0].get("path"):
                    continue
                relative = images[0]["path"]
                resolved = (root / relative).resolve()
                if (
                    not resolved.is_relative_to(root.resolve())
                    or not resolved.is_file()
                ):
                    raise ValueError("Feed references a missing or unsafe local file")
                source = item["spider_name"]
                if client is not None:
                    if source not in runs:
                        runs[source] = client.post("/runs", {"source": source})["id"]
                    client.post("/ingest", image_payload(item, runs[source]))
    except Exception:
        failed = True
        raise
    finally:
        if client is not None:
            for run_id in runs.values():
                client.post(
                    f"/runs/{run_id}/finish",
                    {"status": "failed" if failed else "finished"},
                )


if __name__ == "__main__":
    main()
