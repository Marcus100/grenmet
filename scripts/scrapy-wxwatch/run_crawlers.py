import argparse
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Mapping

from scrapy import signals
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings
from twisted.internet.defer import Deferred

FUTURE_TIMESTAMP_TOLERANCE = timedelta(minutes=15)


@dataclass(frozen=True, slots=True)
class CrawlPolicy:
    """Observable requirements for a successful source crawl."""

    required_images: int
    max_age: timedelta | None = None
    timeout_seconds: int = 15 * 60
    expected_images_stat: str | None = None
    freshness_fields: tuple[str, ...] = ("observation_time", "source_modified")


def parse_utc_datetime(value: object) -> datetime | None:
    """Parse an item timestamp into an aware UTC datetime."""
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


class CrawlOutcome:
    """Collect crawl errors so unattended runs return a useful exit code."""

    def __init__(
        self,
        policies: Mapping[str, CrawlPolicy] | None = None,
        *,
        now: Callable[[], datetime] | None = None,
    ):
        self.failed = False
        self._policies = dict(CRAWL_POLICIES if policies is None else policies)
        self._stored_images: dict[str, dict[str, datetime | None]] = {}
        self._now = now or (lambda: datetime.now(timezone.utc))

    def record_error(self, *args, **kwargs):
        self.failed = True

    def watch(self, deferred: Deferred[None]) -> None:
        """Mark the run failed when a crawl cannot finish bootstrapping."""
        deferred.addErrback(self.record_error)

    def record_item(self, item, response, spider):
        """Count unique images that completed every configured pipeline."""
        paths = {
            image.get("path") for image in item.get("images", []) if image.get("path")
        }
        policy = self._policies.get(spider.name)
        freshness_fields = (
            policy.freshness_fields
            if policy is not None
            else ("observation_time", "source_modified")
        )
        timestamp = None
        for field in freshness_fields:
            timestamp = parse_utc_datetime(item.get(field))
            if timestamp is not None:
                break
        stored_images = self._stored_images.setdefault(spider.name, {})
        for path in paths:
            stored_images[path] = timestamp

    def record_closed(self, spider, reason):
        if reason != "finished":
            self.failed = True
            return

        policy = self._policies.get(spider.name)
        stored_images = self._stored_images.get(spider.name, {})
        usable_images = len(stored_images)
        if policy is not None and policy.max_age is not None:
            now = self._now()
            cutoff = now - policy.max_age
            latest = now + FUTURE_TIMESTAMP_TOLERANCE
            usable_images = sum(
                timestamp is not None and cutoff <= timestamp <= latest
                for timestamp in stored_images.values()
            )
        required_images = policy.required_images if policy is not None else 0
        if policy is not None and policy.expected_images_stat is not None:
            crawler = getattr(spider, "crawler", None)
            stats = getattr(crawler, "stats", None)
            expected_images = (
                stats.get_value(policy.expected_images_stat, 0)
                if stats is not None
                else 0
            )
            required_images = max(required_images, int(expected_images or 0))
        if policy is not None and usable_images < required_images:
            spider.logger.error(
                "Crawl produced %d usable images; expected at least %d",
                usable_images,
                required_images,
            )
            self.failed = True

    @property
    def exit_code(self):
        return 1 if self.failed else 0


SPIDER_NAMES = ("goes19", "sfcana", "cimss", "trackthetropics", "uwyo")
CRAWL_POLICIES = {
    "goes19": CrawlPolicy(required_images=8, max_age=timedelta(hours=3)),
    "sfcana": CrawlPolicy(
        required_images=1, max_age=timedelta(hours=18), timeout_seconds=10 * 60
    ),
    "cimss": CrawlPolicy(
        required_images=22, max_age=timedelta(hours=24), timeout_seconds=20 * 60
    ),
    "trackthetropics": CrawlPolicy(
        required_images=1,
        max_age=timedelta(hours=1),
        timeout_seconds=30 * 60,
        expected_images_stat="wxwatch/expected_images",
        freshness_fields=("fetched_at",),
    ),
    "uwyo": CrawlPolicy(required_images=4, max_age=timedelta(hours=36)),
}


def build_feed_exports(output_dir, timestamp):
    """Build optional JSON feed settings for an individual crawl run."""
    if output_dir is None:
        return {}

    path = Path(output_dir) / f"%(name)s_{timestamp:%Y-%m-%d_%H-%M}.json"
    return {
        str(path): {
            "format": "json",
            "encoding": "utf-8",
            "overwrite": True,
        }
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run one or all wxwatch spiders")
    parser.add_argument(
        "source",
        choices=("all", *SPIDER_NAMES),
        help="Weather source to crawl; use 'all' only for a manual full run",
    )
    parser.add_argument(
        "--feed-dir",
        type=Path,
        help="Optionally export one timestamped JSON feed per spider",
    )
    args = parser.parse_args(argv)

    settings = get_project_settings()
    if args.feed_dir is not None:
        args.feed_dir.mkdir(parents=True, exist_ok=True)
    settings.set(
        "FEEDS",
        build_feed_exports(args.feed_dir, datetime.now(timezone.utc)),
    )

    process = CrawlerProcess(settings)
    outcome = CrawlOutcome()
    spider_names = SPIDER_NAMES if args.source == "all" else (args.source,)
    for spider_name in spider_names:
        crawler = process.create_crawler(spider_name)
        crawler.settings.set(
            "CLOSESPIDER_TIMEOUT",
            CRAWL_POLICIES[spider_name].timeout_seconds,
            priority="cmdline",
        )
        crawler.signals.connect(outcome.record_error, signal=signals.spider_error)
        crawler.signals.connect(outcome.record_error, signal=signals.item_error)
        crawler.signals.connect(outcome.record_item, signal=signals.item_scraped)
        crawler.signals.connect(outcome.record_closed, signal=signals.spider_closed)
        outcome.watch(process.crawl(crawler))
    process.start()
    return outcome.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
