import argparse
from datetime import datetime, timezone
from pathlib import Path

from scrapy import signals
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings
from twisted.internet.defer import Deferred


class CrawlOutcome:
    """Collect crawl errors so unattended runs return a useful exit code."""

    def __init__(self):
        self.failed = False

    def record_error(self, *args, **kwargs):
        self.failed = True

    def watch(self, deferred: Deferred[None]) -> None:
        """Mark the run failed when a crawl cannot finish bootstrapping."""
        deferred.addErrback(self.record_error)

    def record_closed(self, spider, reason):
        if reason != "finished":
            self.failed = True

    @property
    def exit_code(self):
        return 1 if self.failed else 0


SPIDER_NAMES = ("goes19", "sfcana", "cimss", "trackthetropics", "uwyo")


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
    parser = argparse.ArgumentParser(description="Run all wxwatch spiders")
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
    for spider_name in SPIDER_NAMES:
        crawler = process.create_crawler(spider_name)
        crawler.signals.connect(outcome.record_error, signal=signals.spider_error)
        crawler.signals.connect(outcome.record_error, signal=signals.item_error)
        crawler.signals.connect(outcome.record_closed, signal=signals.spider_closed)
        outcome.watch(process.crawl(crawler))
    process.start()
    return outcome.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
