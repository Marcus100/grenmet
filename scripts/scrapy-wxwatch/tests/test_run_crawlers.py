import logging
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from scrapy import signals
from scrapy.settings import Settings
from twisted.internet.defer import succeed

from app.items import ImageItem

import run_crawlers


class FakeSignals:
    def __init__(self):
        self.receivers = {}

    def connect(self, receiver, signal):
        self.receivers.setdefault(signal, []).append(receiver)

    def send(self, signal, *args):
        for receiver in self.receivers.get(signal, []):
            receiver(*args)


class FakeCrawlerProcess:
    created_spiders: list[str] = []
    configured_timeouts: list[int] = []

    def __init__(self, settings):
        self.settings = settings
        self.crawlers = []

    def create_crawler(self, spider_name):
        self.created_spiders.append(spider_name)
        crawler = SimpleNamespace(
            name=spider_name,
            settings=Settings(),
            signals=FakeSignals(),
        )
        self.crawlers.append(crawler)
        return crawler

    def crawl(self, crawler):
        self.configured_timeouts.append(crawler.settings.getint("CLOSESPIDER_TIMEOUT"))
        return succeed(None)

    def start(self):
        for crawler in self.crawlers:
            spider = SimpleNamespace(
                name=crawler.name,
                logger=logging.getLogger("test"),
            )
            policy = run_crawlers.CRAWL_POLICIES[crawler.name]
            for index in range(policy.required_images):
                item = ImageItem(
                    observation_time=datetime.now(timezone.utc).isoformat(),
                    images=[{"path": f"{crawler.name}/{index}.jpg"}],
                )
                crawler.signals.send(signals.item_scraped, item, None, spider)
            crawler.signals.send(signals.spider_closed, spider, "finished")


def test_selected_source_runs_without_starting_other_spiders(monkeypatch):
    FakeCrawlerProcess.created_spiders = []
    FakeCrawlerProcess.configured_timeouts = []
    monkeypatch.setattr(run_crawlers, "CrawlerProcess", FakeCrawlerProcess)
    monkeypatch.setattr(run_crawlers, "get_project_settings", Settings)

    exit_code = run_crawlers.main(["goes19"])

    assert exit_code == 0
    assert FakeCrawlerProcess.created_spiders == ["goes19"]
    assert FakeCrawlerProcess.configured_timeouts == [15 * 60]


def test_clean_close_without_required_images_fails_the_run():
    outcome = run_crawlers.CrawlOutcome(
        {"goes19": run_crawlers.CrawlPolicy(required_images=1)}
    )
    spider = SimpleNamespace(name="goes19", logger=logging.getLogger("test"))

    outcome.record_closed(spider, "finished")

    assert outcome.exit_code == 1


def test_unchanged_stored_image_satisfies_the_run_policy():
    outcome = run_crawlers.CrawlOutcome(
        {"goes19": run_crawlers.CrawlPolicy(required_images=1)}
    )
    spider = SimpleNamespace(name="goes19", logger=logging.getLogger("test"))
    item = ImageItem(
        image_urls=["https://images.example.test/latest.jpg"],
        images=[
            {
                "path": "goes19/2026/07/18/latest.jpg",
                "checksum": "unchanged",
                "status": "uptodate",
            }
        ],
    )

    outcome.record_item(item, None, spider)
    outcome.record_closed(spider, "finished")

    assert outcome.exit_code == 0


def test_every_known_source_has_a_default_nonempty_run_policy():
    for source in run_crawlers.SPIDER_NAMES:
        outcome = run_crawlers.CrawlOutcome()
        spider = SimpleNamespace(name=source, logger=logging.getLogger("test"))

        outcome.record_closed(spider, "finished")

        assert outcome.exit_code == 1, source


def test_stale_stored_image_does_not_satisfy_a_freshness_policy():
    now = datetime(2026, 7, 18, 12, tzinfo=timezone.utc)
    outcome = run_crawlers.CrawlOutcome(
        {
            "goes19": run_crawlers.CrawlPolicy(
                required_images=1,
                max_age=timedelta(hours=3),
            )
        },
        now=lambda: now,
    )
    spider = SimpleNamespace(name="goes19", logger=logging.getLogger("test"))
    item = ImageItem(
        observation_time=(now - timedelta(hours=4)).isoformat(),
        images=[{"path": "goes19/stale.jpg", "status": "uptodate"}],
    )

    outcome.record_item(item, None, spider)
    outcome.record_closed(spider, "finished")

    assert outcome.exit_code == 1


def test_default_goes_policy_rejects_a_complete_but_stale_product_set():
    now = datetime(2026, 7, 18, 12, tzinfo=timezone.utc)
    outcome = run_crawlers.CrawlOutcome(now=lambda: now)
    spider = SimpleNamespace(name="goes19", logger=logging.getLogger("test"))
    for index in range(8):
        item = ImageItem(
            observation_time=(now - timedelta(hours=4)).isoformat(),
            images=[{"path": f"goes19/{index}.jpg", "status": "uptodate"}],
        )
        outcome.record_item(item, None, spider)

    outcome.record_closed(spider, "finished")

    assert outcome.exit_code == 1


def test_source_selection_is_required(monkeypatch):
    FakeCrawlerProcess.created_spiders = []
    monkeypatch.setattr(run_crawlers, "CrawlerProcess", FakeCrawlerProcess)
    monkeypatch.setattr(run_crawlers, "get_project_settings", Settings)

    with pytest.raises(SystemExit) as error:
        run_crawlers.main([])

    assert error.value.code == 2
    assert FakeCrawlerProcess.created_spiders == []


def test_future_dated_image_does_not_satisfy_a_freshness_policy():
    now = datetime(2026, 7, 18, 11, tzinfo=timezone.utc)
    outcome = run_crawlers.CrawlOutcome(
        {
            "uwyo": run_crawlers.CrawlPolicy(
                required_images=1,
                max_age=timedelta(hours=36),
            )
        },
        now=lambda: now,
    )
    spider = SimpleNamespace(name="uwyo", logger=logging.getLogger("test"))
    item = ImageItem(
        observation_time=(now + timedelta(hours=1)).isoformat(),
        images=[{"path": "uwyo/future.png", "status": "downloaded"}],
    )

    outcome.record_item(item, None, spider)
    outcome.record_closed(spider, "finished")

    assert outcome.exit_code == 1


def test_dynamic_source_requires_every_product_discovered_on_the_live_page():
    now = datetime(2026, 7, 18, 12, tzinfo=timezone.utc)
    outcome = run_crawlers.CrawlOutcome(
        {
            "trackthetropics": run_crawlers.CrawlPolicy(
                required_images=1,
                max_age=timedelta(hours=1),
                expected_images_stat="wxwatch/expected_images",
                freshness_fields=("fetched_at",),
            )
        },
        now=lambda: now,
    )
    stats = SimpleNamespace(get_value=lambda key, default=0: 3)
    spider = SimpleNamespace(
        name="trackthetropics",
        logger=logging.getLogger("test"),
        crawler=SimpleNamespace(stats=stats),
    )
    for index in range(2):
        item = ImageItem(
            fetched_at=now.isoformat(),
            images=[{"path": f"trackthetropics/{index}.png"}],
        )
        outcome.record_item(item, None, spider)

    outcome.record_closed(spider, "finished")

    assert outcome.exit_code == 1
