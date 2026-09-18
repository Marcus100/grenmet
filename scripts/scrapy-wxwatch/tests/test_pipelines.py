import asyncio
import inspect
import re
from datetime import datetime, timezone
from io import BytesIO
from types import SimpleNamespace

import pytest

from PIL import Image
from scrapy.http import Request, Response
from scrapy.settings import Settings
from twisted.internet.defer import Deferred

from app.items import ImageItem
from app.pipelines import (
    MinutePathImagesPipeline,
)


def test_image_key_is_deterministic_partitioned_and_safe():
    pipeline = object.__new__(MinutePathImagesPipeline)
    request = Request("https://images.example.test/products/GOES%2019.PnG%21?version=1")
    item = ImageItem(
        spider_name="goes19",
        observation_time="2026-07-17T12:34:56+00:00",
    )

    path = pipeline.file_path(request, item=item)
    assert re.fullmatch(
        r"goes19/2026/07/17/12/202607171234_[0-9a-f]{12}_GOES-19\.png",
        path,
    )
    assert pipeline.file_path(request, item=item) == path


def test_download_persists_image_and_metadata_from_stored_bytes(tmp_path):
    crawler = SimpleNamespace(
        settings=Settings({"IMAGES_STORE": str(tmp_path)}),
        request_fingerprinter=object(),
    )
    pipeline = MinutePathImagesPipeline(str(tmp_path), crawler=crawler)
    request = Request("https://images.example.test/chart.png")
    item = ImageItem(
        spider_name="cimss",
        observation_time="2026-07-17T12:00:00+00:00",
        raw_metadata={"source": "test"},
    )
    source = BytesIO()
    Image.new("RGBA", (8, 6), (12, 34, 56, 128)).save(source, format="PNG")
    response = Response(request.url, body=source.getvalue())

    asyncio.run(pipeline.image_downloaded(response, request, object(), item=item))

    stored_path = tmp_path / pipeline.file_path(request, response=response, item=item)
    assert {
        "width": item.get("width"),
        "height": item.get("height"),
        "file_format": item.get("file_format"),
        "mode": item.get("mode"),
        "is_animated": item.get("is_animated"),
        "frame_count": item.get("frame_count"),
        "file_size_bytes": item.get("file_size_bytes"),
        "raw_metadata": item.get("raw_metadata"),
        "stored": stored_path.exists(),
    } == {
        "width": 8,
        "height": 6,
        "file_format": "png",
        "mode": "RGBA",
        "is_animated": False,
        "frame_count": 1,
        "file_size_bytes": stored_path.stat().st_size,
        "raw_metadata": {"source": "test"},
        "stored": True,
    }


def test_image_downloaded_matches_the_installed_scrapy_await_contract():
    """Scrapy 2.15 made ImagesPipeline.image_downloaded awaitable.

    Our override must match whatever the installed Scrapy expects: if the base
    method is a coroutine function, ours has to be one too, or Scrapy's
    `await self.image_downloaded(...)` raises TypeError on every image.
    """
    from scrapy.pipelines.images import ImagesPipeline

    assert inspect.iscoroutinefunction(
        MinutePathImagesPipeline.image_downloaded
    ) == inspect.iscoroutinefunction(ImagesPipeline.image_downloaded)


def test_pipeline_order_has_no_filesystem_only_metadata_stage():
    from app.settings import ITEM_PIPELINES

    assert list(ITEM_PIPELINES) == [
        "app.pipelines.SpiderNamePipeline",
        "app.pipelines.MinutePathImagesPipeline",
        "app.pipelines.FastApiPipeline",
    ]


def test_complete_object_storage_configuration_maps_to_scrapy_settings():
    from app.config import ImageStorageConfig

    config = ImageStorageConfig.from_env(
        {
            "STORAGE_ENDPOINT_URL": "https://nyc3.digitaloceanspaces.com",
            "STORAGE_REGION": "nyc3",
            "STORAGE_BUCKET": "grenmet-assets",
            "STORAGE_ACCESS_KEY_ID": "access-key",
            "STORAGE_SECRET_ACCESS_KEY": "secret-key",
            "STORAGE_PREFIX": "wxwatch",
            "STORAGE_OBJECT_ACL": "public-read",
        }
    )

    assert config.as_scrapy_settings() == {
        "IMAGES_STORE": "s3://grenmet-assets/wxwatch/",
        "AWS_ENDPOINT_URL": "https://nyc3.digitaloceanspaces.com",
        "AWS_REGION_NAME": "nyc3",
        "AWS_ACCESS_KEY_ID": "access-key",
        "AWS_SECRET_ACCESS_KEY": "secret-key",
        "IMAGES_STORE_S3_ACL": "public-read",
    }


def test_partial_object_storage_configuration_fails_fast():
    from app.config import ImageStorageConfig, StorageConfigurationError

    with pytest.raises(StorageConfigurationError, match="STORAGE_SECRET_ACCESS_KEY"):
        ImageStorageConfig.from_env(
            {
                "STORAGE_ENDPOINT_URL": "https://nyc3.digitaloceanspaces.com",
                "STORAGE_BUCKET": "grenmet-assets",
                "STORAGE_ACCESS_KEY_ID": "access-key",
            }
        )


def test_local_storage_requires_no_cloud_credentials(tmp_path):
    from app.config import ImageStorageConfig

    config = ImageStorageConfig.from_env({}, default_local_store=tmp_path)

    assert config.as_scrapy_settings() == {"IMAGES_STORE": str(tmp_path)}


def test_scrapy_settings_apply_validated_object_storage(monkeypatch):
    import importlib

    from app import settings

    values = {
        "STORAGE_ENDPOINT_URL": "https://nyc3.digitaloceanspaces.com",
        "STORAGE_REGION": "nyc3",
        "STORAGE_BUCKET": "grenmet-assets",
        "STORAGE_ACCESS_KEY_ID": "access-key",
        "STORAGE_SECRET_ACCESS_KEY": "secret-key",
        "STORAGE_PREFIX": "wxwatch",
        "STORAGE_OBJECT_ACL": "public-read",
    }
    with monkeypatch.context() as context:
        for key, value in values.items():
            context.setenv(key, value)
        reloaded = importlib.reload(settings)

        assert {
            "IMAGES_STORE": reloaded.IMAGES_STORE,
            "AWS_ENDPOINT_URL": reloaded.AWS_ENDPOINT_URL,
            "AWS_REGION_NAME": reloaded.AWS_REGION_NAME,
            "FILES_STORE_S3_ACL": reloaded.FILES_STORE_S3_ACL,
        } == {
            "IMAGES_STORE": "s3://grenmet-assets/wxwatch/",
            "AWS_ENDPOINT_URL": "https://nyc3.digitaloceanspaces.com",
            "AWS_REGION_NAME": "nyc3",
            "FILES_STORE_S3_ACL": "public-read",
        }

    importlib.reload(settings)


def test_feed_exports_are_opt_in(tmp_path):
    from run_crawlers import build_feed_exports

    timestamp = datetime(2026, 7, 17, 12, 30, tzinfo=timezone.utc)

    assert build_feed_exports(None, timestamp) == {}
    assert build_feed_exports(tmp_path, timestamp) == {
        str(tmp_path / "%(name)s_2026-07-17_12-30.json"): {
            "format": "json",
            "encoding": "utf-8",
            "overwrite": True,
        }
    }


def test_crawl_outcome_is_nonzero_after_an_error():
    from run_crawlers import CrawlOutcome

    outcome = CrawlOutcome()
    outcome.record_error()

    assert outcome.exit_code == 1


def test_images_pipeline_applies_configured_object_acl(monkeypatch):
    from app.config import ImageStorageConfig

    config = ImageStorageConfig.from_env(
        {
            "STORAGE_ENDPOINT_URL": "https://nyc3.digitaloceanspaces.com",
            "STORAGE_BUCKET": "grenmet-assets",
            "STORAGE_ACCESS_KEY_ID": "access-key",
            "STORAGE_SECRET_ACCESS_KEY": "secret-key",
            "STORAGE_OBJECT_ACL": "public-read",
        }
    )
    s3_store = MinutePathImagesPipeline.STORE_SCHEMES["s3"]
    monkeypatch.setattr(s3_store, "POLICY", "private")

    MinutePathImagesPipeline._update_stores(Settings(config.as_scrapy_settings()))

    assert s3_store.POLICY == "public-read"


def test_crawl_outcome_watches_bootstrap_failures():
    from run_crawlers import CrawlOutcome

    outcome = CrawlOutcome()
    deferred = Deferred()
    outcome.watch(deferred)

    deferred.errback(RuntimeError("pipeline bootstrap failed"))

    assert outcome.exit_code == 1


def test_production_crawls_do_not_reuse_stale_http_cache():
    from app.settings import HTTPCACHE_ENABLED

    assert HTTPCACHE_ENABLED is False
