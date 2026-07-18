# Define your item pipelines here
#
# Don't forget to add your pipeline to the ITEM_PIPELINES setting
# See: https://docs.scrapy.org/en/latest/topics/item-pipeline.html


import json
import hashlib
import re
from datetime import datetime, timezone
from pathlib import PurePosixPath
from urllib.parse import unquote, urlparse

import psycopg
from itemadapter import ItemAdapter

from scrapy.pipelines.images import ImagesPipeline


def parse_iso_datetime(value):
    """Parse ISO datetime string to timezone-aware datetime.

    Shared utility used by multiple pipelines.
    Handles both 'Z' suffix and +00:00 timezone formats.

    Args:
        value: ISO 8601 datetime string or None

    Returns:
        timezone-aware datetime object or None
    """
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


class SpiderNamePipeline:
    """Add spider name to each item for identification."""

    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        adapter["spider_name"] = spider.name
        return item


class MinutePathImagesPipeline(ImagesPipeline):
    """Store images under YYYY/MM/DD/HH/YYYYMMDDHHMM_original-name.

    Uses observation_time set by each spider for path generation.
    Falls back to fetched_at if observation_time is not set.

    Each spider sets observation_time based on its best available source:
    - goes19: extracts from GOES filename (YYYYDDDHHmm pattern)
    - cimss, sfcana: uses source_modified from directory listing
    - trackthetropics: uses source_modified from HTTP Last-Modified header
    """

    def file_path(self, request, response=None, info=None, *, item=None):
        """Return a deterministic, portable object key for a weather image."""
        adapter = ItemAdapter(item or {})
        parsed_url = urlparse(request.url)
        original_name = PurePosixPath(unquote(parsed_url.path)).name or "image"

        dt = parse_iso_datetime(adapter.get("observation_time"))
        if dt is None:
            dt = parse_iso_datetime(adapter.get("fetched_at"))
        if dt is None:
            dt = datetime.now(timezone.utc)

        base, dot, ext = original_name.rpartition(".")
        name_stem = base if dot else original_name
        safe_extension = re.sub(r"[^A-Za-z0-9]+", "", ext).lower()[:10] if dot else ""
        extension = f".{safe_extension}" if safe_extension else ""
        safe_stem = re.sub(r"[^A-Za-z0-9_-]+", "-", name_stem).strip("-_")
        if not safe_stem:
            safe_stem = "image"

        spider_name = str(adapter.get("spider_name") or "unknown")
        safe_spider = re.sub(r"[^A-Za-z0-9_-]+", "-", spider_name).strip("-_")
        if not safe_spider:
            safe_spider = "unknown"

        source_hash = hashlib.sha256(request.url.encode("utf-8")).hexdigest()[:12]
        filename = f"{dt:%Y%m%d%H%M}_{source_hash}_{safe_stem}{extension}"
        return f"{safe_spider}/{dt:%Y/%m/%d/%H}/{filename}"

    def image_downloaded(self, response, request, info, *, item=None):
        """Persist an image and attach metadata for the bytes that were stored."""
        checksum = None
        content_type = "image/jpeg"

        for path, image, buffer in self.get_images(response, request, info, item=item):
            if checksum is None:
                checksum = hashlib.md5(
                    buffer.getbuffer(), usedforsecurity=False
                ).hexdigest()
                content_type = self._set_stored_image_metadata(item, buffer)

            width, height = image.size
            self.store.persist_file(
                path,
                buffer,
                info,
                meta={"width": width, "height": height},
                headers={"Content-Type": content_type},
            )

        if checksum is None:
            raise ValueError("Image pipeline produced no stored image")
        return checksum

    def _set_stored_image_metadata(self, item, buffer):
        if item is None:
            return "image/jpeg"

        adapter = ItemAdapter(item)
        file_size_bytes = buffer.getbuffer().nbytes
        buffer.seek(0)
        with self._Image.open(buffer) as stored_image:
            file_format = (stored_image.format or "jpeg").lower()
            adapter["width"] = stored_image.width
            adapter["height"] = stored_image.height
            adapter["file_format"] = file_format
            adapter["mode"] = stored_image.mode
            adapter["is_animated"] = bool(getattr(stored_image, "is_animated", False))
            adapter["frame_count"] = int(getattr(stored_image, "n_frames", 1))
            adapter["file_size_bytes"] = file_size_bytes

        buffer.seek(0)
        return f"image/{file_format}"


class PostgresPipeline:
    """
    Write scraped items directly to PostgreSQL using psycopg (v3).

    It runs after the image pipeline, reuses existing records for previously
    downloaded content, and fails the crawl when persistence fails.
    """

    def __init__(
        self,
        db_host: str,
        db_port: int,
        db_name: str,
        db_user: str,
        db_password: str,
    ):
        self.db_host = db_host
        self.db_port = db_port
        self.db_name = db_name
        self.db_user = db_user
        self.db_password = db_password
        self.conn: psycopg.Connection | None = None

    @classmethod
    def from_crawler(cls, crawler):
        db_password = crawler.settings.get("DB_PASSWORD")
        if not db_password:
            raise ValueError("DB_PASSWORD is required for PostgresPipeline")

        return cls(
            db_host=crawler.settings.get("DB_HOST", "127.0.0.1"),
            db_port=crawler.settings.getint("DB_PORT", 5432),
            db_name=crawler.settings.get("DB_NAME", "wxwatch"),
            db_user=crawler.settings.get("DB_USER", "wxwatch"),
            db_password=db_password,
        )

    def _require_connection(self) -> psycopg.Connection:
        if self.conn is None:
            raise RuntimeError("PostgresPipeline has not been opened")
        return self.conn

    def open_spider(self, spider):
        """Connect to PostgreSQL when spider opens."""
        try:
            self.conn = psycopg.connect(
                host=self.db_host,
                port=self.db_port,
                dbname=self.db_name,
                user=self.db_user,
                password=self.db_password,
            )
            spider.logger.info(
                "PostgresPipeline: Connected to %s@%s:%s/%s",
                self.db_user,
                self.db_host,
                self.db_port,
                self.db_name,
            )
        except psycopg.Error as e:
            spider.logger.error(
                "PostgresPipeline: Failed to connect to database: %s", e
            )
            raise

    def close_spider(self, spider):
        """Close the database connection after all per-item commits finish."""
        if self.conn is not None:
            self.conn.close()
            self.conn = None
            spider.logger.info("PostgresPipeline: Connection closed")

    def process_item(self, item, spider):
        """Insert item into PostgreSQL database."""
        adapter = ItemAdapter(item)

        # Skip if no image was downloaded
        images = adapter.get("images", [])
        if not images or not images[0].get("path"):
            spider.logger.debug("PostgresPipeline: No downloaded image, skipping")
            return item

        image_info = images[0]
        image_url = adapter.get("image_urls", [None])[0]
        connection = self._require_connection()

        try:
            checksum = image_info.get("checksum")
            record_identity = "\x1f".join((image_url or "", checksum or ""))
            connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (record_identity,),
            )
            existing = connection.execute(
                """
                SELECT 1
                FROM weather_images
                WHERE image_url IS NOT DISTINCT FROM %s
                  AND checksum IS NOT DISTINCT FROM %s
                LIMIT 1
                """,
                (image_url, checksum),
            ).fetchone()
            if existing:
                connection.commit()
                spider.logger.debug(
                    "PostgresPipeline: Already recorded %s",
                    image_info.get("path"),
                )
                return item

            # Parse timestamps
            fetched_at = parse_iso_datetime(adapter.get("fetched_at"))
            source_modified = parse_iso_datetime(adapter.get("source_modified"))
            observation_time = parse_iso_datetime(adapter.get("observation_time"))

            if not fetched_at:
                spider.logger.warning(
                    "PostgresPipeline: Missing fetched_at, using now()"
                )
                fetched_at = datetime.now(timezone.utc)

            # Convert raw_metadata to JSON string for psycopg3
            raw_metadata = adapter.get("raw_metadata") or {}
            raw_metadata_json = json.dumps(raw_metadata)

            # Insert new record
            connection.execute(
                """
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
                """,
                (
                    image_info.get("path"),
                    adapter.get("width", 0),
                    adapter.get("height", 0),
                    adapter.get("spider_name"),
                    adapter.get("file_format"),
                    adapter.get("is_animated", False),
                    adapter.get("file_size_bytes"),
                    fetched_at,
                    adapter.get("name"),
                    image_url,
                    adapter.get("parent_url"),
                    adapter.get("page_title"),
                    source_modified,
                    observation_time,
                    adapter.get("etag"),
                    image_info.get("checksum"),
                    image_info.get("status"),
                    adapter.get("mode"),
                    adapter.get("frame_count", 1),
                    raw_metadata_json,
                ),
            )
            connection.commit()
            spider.logger.debug(
                "PostgresPipeline: Inserted %s",
                image_info.get("path"),
            )
        except psycopg.Error as e:
            spider.logger.error("PostgresPipeline: Database error: %s", e)
            # Rollback to clear the failed transaction state
            connection.rollback()
            raise

        return item
