# Define your item pipelines here
#
# Don't forget to add your pipeline to the ITEM_PIPELINES setting
# See: https://docs.scrapy.org/en/latest/topics/item-pipeline.html


import hashlib
import re
from datetime import UTC, datetime
from pathlib import PurePosixPath
from urllib.parse import unquote, urlparse

from itemadapter import ItemAdapter
from scrapy.pipelines.images import ImagesPipeline
from scrapy.utils.defer import ensure_awaitable


class ConcurrentCrawlError(RuntimeError):
    """Raised when the same spider already owns its database run lock."""


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
            return dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)
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
            dt = datetime.now(UTC)

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
        # Response content makes keys immutable across corrections at the same URL/time.
        if response is not None:
            source_hash += "_" + hashlib.sha256(response.body).hexdigest()
        filename = f"{dt:%Y%m%d%H%M}_{source_hash}_{safe_stem}{extension}"
        return f"{safe_spider}/{dt:%Y/%m/%d/%H}/{filename}"

    def media_to_download(self, request, info, *, item=None):
        # A reused source URL may carry a correction at the same observation time.
        # Fetch bytes before deciding identity; the API deduplicates by checksum.
        return None

    def get_images(self, response, request, info, *, item=None):
        from io import BytesIO

        buffer = BytesIO(response.body)
        image = self._Image.open(buffer)
        image.verify()
        buffer.seek(0)
        image = self._Image.open(buffer)
        yield (
            self.file_path(request, response=response, info=info, item=item),
            image,
            buffer,
        )

    async def image_downloaded(self, response, request, info, *, item=None):
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
            await ensure_awaitable(
                self.store.persist_file(
                    path,
                    buffer,
                    info,
                    meta={"width": width, "height": height},
                    headers={"Content-Type": content_type},
                )
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


class FastApiPipeline:
    """Collect files separately; FastAPI owns all archive database writes."""

    def __init__(self, crawler):
        from run_crawlers import CrawlOutcome

        from app.api import ArchiveClient

        self.crawler = crawler
        self.client = ArchiveClient()
        self.outcome = CrawlOutcome()
        self.run_id: str | None = None

    @classmethod
    def from_crawler(cls, crawler):
        from scrapy import signals

        instance = cls(crawler)
        crawler.signals.connect(instance.spider_closed, signal=signals.spider_closed)
        crawler.signals.connect(
            instance.outcome.record_error, signal=signals.spider_error
        )
        crawler.signals.connect(
            instance.outcome.record_error, signal=signals.item_error
        )
        return instance

    async def open_spider(self):
        import asyncio

        result = await asyncio.to_thread(
            self.client.post, "/runs", {"source": self.crawler.spider.name}
        )
        self.run_id = result["id"]

    async def process_item(self, item):
        import asyncio

        from app.api import image_payload

        adapter = ItemAdapter(item)
        images = adapter.get("images", [])
        if not images or not images[0].get("path"):
            return item
        await asyncio.to_thread(
            self.client.post, "/ingest", image_payload(adapter, self.run_id)
        )
        self.outcome.record_item(adapter, None, self.crawler.spider)
        return item

    async def spider_closed(self, spider, reason):
        import asyncio

        if self.run_id is not None:
            self.outcome.record_closed(spider, reason)
            await asyncio.to_thread(
                self.client.post,
                f"/runs/{self.run_id}/finish",
                {"status": "failed" if self.outcome.failed else "finished"},
            )
