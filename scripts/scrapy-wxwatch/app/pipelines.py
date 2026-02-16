# Define your item pipelines here
#
# Don't forget to add your pipeline to the ITEM_PIPELINES setting
# See: https://docs.scrapy.org/en/latest/topics/item-pipeline.html


import json
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

import psycopg
from itemadapter import ItemAdapter
from PIL import Image
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
        adapter = ItemAdapter(item or {})
        original_name = PurePosixPath(request.url).name or "image"

        # Use observation_time from spider, fall back to fetched_at
        dt = parse_iso_datetime(adapter.get("observation_time"))
        if dt is None:
            dt = parse_iso_datetime(adapter.get("fetched_at"))
        if dt is None:
            dt = datetime.now(timezone.utc)

        year = f"{dt:%Y}"
        month = f"{dt:%m}"
        day = f"{dt:%d}"
        hour = f"{dt:%H}"
        stamp = f"{dt:%Y%m%d%H%M}"

        base, dot, ext = original_name.rpartition(".")
        name_stem = base if dot else original_name
        extension = f".{ext}" if dot else ""
        safe_stem = name_stem.replace(" ", "-")

        filename = f"{stamp}_{safe_stem}{extension}"
        return f"{year}/{month}/{day}/{hour}/{filename}"


class ImageMetadataPipeline:
    """
    Extract image metadata using Pillow after download.

    This pipeline processes items after ImagesPipeline has downloaded the images.
    It extracts:
    - Image dimensions (width, height)
    - File format and mode
    - Animation info (for GIFs)
    - File size

    According to Scrapy best practices, this pipeline should run after ImagesPipeline.
    """

    def process_item(self, item, spider):
        """
        Process item to extract image metadata using Pillow.

        Args:
            item: The item containing image information
            spider: The spider instance

        Returns:
            Item with image metadata populated
        """
        adapter = ItemAdapter(item)

        # Get the downloaded image info from ImagesPipeline
        # ImagesPipeline populates the 'images' field with download results
        images = adapter.get("images", [])
        if not images:
            spider.logger.debug("No images found in item, skipping metadata extraction")
            return item

        # Get the first image (since we typically have one per item)
        image_info = images[0]
        storage_path = image_info.get("path")

        if not storage_path:
            spider.logger.warning("No storage path found in image info")
            return item

        # Build full path to downloaded image
        images_store = spider.settings.get("IMAGES_STORE", "images")
        full_path = Path(images_store) / storage_path

        if not full_path.exists():
            spider.logger.warning("Image file not found: %s", full_path)
            return item

        try:
            # Get file size
            adapter["file_size_bytes"] = full_path.stat().st_size

            # Extract file extension from path for fallback
            file_ext = full_path.suffix.lower().lstrip(".") if full_path.suffix else None
            # Normalize common extension variants
            ext_format_map = {
                "jpg": "jpeg",
                "jpeg": "jpeg",
                "png": "png",
                "gif": "gif",
                "webp": "webp",
                "bmp": "bmp",
                "tiff": "tiff",
                "tif": "tiff",
            }
            normalized_ext = ext_format_map.get(file_ext, file_ext)

            # Open image with Pillow
            with Image.open(full_path) as img:
                # Extract basic metadata
                # Use Pillow's format if available, otherwise fall back to extension
                pillow_format = img.format.lower() if img.format else None
                adapter["file_format"] = pillow_format or normalized_ext
                adapter["width"] = img.width
                adapter["height"] = img.height
                adapter["mode"] = img.mode

                # Check for animation (GIFs, animated WebP, etc.)
                adapter["is_animated"] = getattr(img, "is_animated", False)
                adapter["frame_count"] = getattr(img, "n_frames", 1)

                # Try to extract EXIF metadata if available
                exif_data = None
                if hasattr(img, "getexif"):
                    try:
                        exif = img.getexif()
                        if exif:
                            exif_data = dict(exif)
                    except (AttributeError, TypeError, ValueError):
                        pass

                # Merge EXIF into existing raw_metadata (don't overwrite)
                if exif_data:
                    existing_raw = adapter.get("raw_metadata") or {}
                    if isinstance(existing_raw, dict):
                        existing_raw["exif"] = exif_data
                        adapter["raw_metadata"] = existing_raw

                spider.logger.debug(
                    "Extracted metadata for %s: %dx%d, format=%s, mode=%s, animated=%s",
                    storage_path,
                    img.width,
                    img.height,
                    img.format,
                    img.mode,
                    adapter["is_animated"],
                )

        except Exception as e:
            spider.logger.error(
                "Error processing image %s: %s",
                full_path,
                e,
            )
            # Don't fail the item, just log the error

        return item


class PostgresPipeline:
    """
    Write scraped items directly to PostgreSQL using psycopg (v3).

    This pipeline runs after ImageMetadataPipeline to ensure all metadata
    is available. It inserts a new record for every downloaded image,
    allowing tracking of the same image across multiple fetch times.
    """

    def __init__(self, db_host, db_port, db_name, db_user, db_password):
        self.db_host = db_host
        self.db_port = db_port
        self.db_name = db_name
        self.db_user = db_user
        self.db_password = db_password
        self.conn = None

    @classmethod
    def from_crawler(cls, crawler):
        return cls(
            db_host=crawler.settings.get("DB_HOST", "127.0.0.1"),
            db_port=crawler.settings.getint("DB_PORT", 5432),
            db_name=crawler.settings.get("DB_NAME", "wxwatch"),
            db_user=crawler.settings.get("DB_USER", "wxwatch"),
            db_password=crawler.settings.get("DB_PASSWORD", "wxwatch_password"),
        )

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
            # Ensure table exists
            self._create_table_if_not_exists(spider)
        except psycopg.Error as e:
            spider.logger.error("PostgresPipeline: Failed to connect to database: %s", e)
            raise

    def _create_table_if_not_exists(self, spider):
        """Create the weather_images table if it doesn't exist."""
        try:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS weather_images (
                    id SERIAL PRIMARY KEY,
                    storage_path TEXT NOT NULL,
                    width INTEGER DEFAULT 0,
                    height INTEGER DEFAULT 0,
                    spider_name TEXT,
                    file_format TEXT,
                    is_animated BOOLEAN DEFAULT FALSE,
                    file_size_bytes BIGINT,
                    fetched_at TIMESTAMPTZ NOT NULL,
                    name TEXT,
                    image_url TEXT,
                    parent_url TEXT,
                    page_title TEXT,
                    source_modified TIMESTAMPTZ,
                    observation_time TIMESTAMPTZ,
                    etag TEXT,
                    checksum TEXT,
                    download_status TEXT,
                    mode TEXT,
                    frame_count INTEGER DEFAULT 1,
                    raw_metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            # Create index for duplicate checking
            self.conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_weather_images_url_checksum 
                ON weather_images (image_url, checksum)
            """)
            self.conn.commit()
            spider.logger.info("PostgresPipeline: Table weather_images ready")
        except psycopg.Error as e:
            spider.logger.error("PostgresPipeline: Failed to create table: %s", e)
            self.conn.rollback()
            raise

    def close_spider(self, spider):
        """Commit and close connection when spider closes."""
        if self.conn:
            try:
                self.conn.commit()
                spider.logger.info("PostgresPipeline: Committed transaction")
            except psycopg.Error as e:
                spider.logger.error("PostgresPipeline: Failed to commit: %s", e)
            finally:
                self.conn.close()
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

        try:
            # Parse timestamps
            fetched_at = parse_iso_datetime(adapter.get("fetched_at"))
            source_modified = parse_iso_datetime(adapter.get("source_modified"))
            observation_time = parse_iso_datetime(adapter.get("observation_time"))

            if not fetched_at:
                spider.logger.warning("PostgresPipeline: Missing fetched_at, using now()")
                fetched_at = datetime.now(timezone.utc)

            # Convert raw_metadata to JSON string for psycopg3
            raw_metadata = adapter.get("raw_metadata") or {}
            raw_metadata_json = json.dumps(raw_metadata)

            # Insert new record
            self.conn.execute(
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
            self.conn.commit()
            spider.logger.debug(
                "PostgresPipeline: Inserted %s",
                image_info.get("path"),
            )
        except psycopg.Error as e:
            spider.logger.error("PostgresPipeline: Database error: %s", e)
            # Rollback to clear the failed transaction state
            self.conn.rollback()

        return item
