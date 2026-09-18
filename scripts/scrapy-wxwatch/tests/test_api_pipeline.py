import asyncio
from io import BytesIO
from types import SimpleNamespace

import pytest
from PIL import Image
from scrapy.http import Request, Response
from scrapy.settings import Settings

from app.api import ArchiveClient
from app.items import ImageItem
from app.pipelines import FastApiPipeline, MinutePathImagesPipeline
from run_crawlers import CrawlOutcome, CrawlPolicy


def test_original_animation_is_preserved_and_changed_bytes_get_new_key(tmp_path):
    crawler = SimpleNamespace(
        settings=Settings({"IMAGES_STORE": str(tmp_path)}),
        request_fingerprinter=object(),
    )
    pipeline = MinutePathImagesPipeline(str(tmp_path), crawler=crawler)
    request = Request("https://example.test/loop.gif")
    assert pipeline.media_to_download(request, None) is None
    buffer = BytesIO()
    Image.new("RGB", (4, 4), "red").save(
        buffer,
        format="GIF",
        save_all=True,
        append_images=[Image.new("RGB", (4, 4), "blue")],
        duration=100,
        loop=0,
    )
    response = Response(request.url, body=buffer.getvalue())
    item = ImageItem(spider_name="cimss", fetched_at="2026-09-17T12:00:00Z")
    asyncio.run(pipeline.image_downloaded(response, request, None, item=item))
    path = pipeline.file_path(request, response=response, item=item)
    assert (tmp_path / path).read_bytes() == buffer.getvalue()
    assert item["is_animated"] and item["frame_count"] == 2
    assert path != pipeline.file_path(
        request, response=Response(request.url, body=b"changed"), item=item
    )


def test_worker_requires_shared_secret():
    with pytest.raises(ValueError, match="WXWATCH_INGEST_TOKEN"):
        ArchiveClient(token="short")


def test_api_failure_propagates_and_interrupted_run_is_failed():
    class Client:
        def post(self, path, payload):
            if path == "/ingest":
                raise RuntimeError("API unavailable")
            self.finished = payload

    pipeline = object.__new__(FastApiPipeline)
    pipeline.client = Client()
    pipeline.run_id = "test-run"
    spider = SimpleNamespace(name="cimss")
    pipeline.crawler = SimpleNamespace(spider=spider)
    pipeline.outcome = CrawlOutcome({"cimss": CrawlPolicy(required_images=0)})
    item = {
        "images": [{"path": "cimss/a.gif", "checksum": "abc"}],
        "image_urls": ["https://example.test/a.gif"],
    }
    with pytest.raises(RuntimeError, match="API unavailable"):
        asyncio.run(pipeline.process_item(item))
    asyncio.run(pipeline.spider_closed(spider, "shutdown"))
    assert pipeline.client.finished == {"status": "failed"}
