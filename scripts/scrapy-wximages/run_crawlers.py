import os
from datetime import datetime

from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings


def main():
    # Get project settings from settings.py
    settings = get_project_settings()

    # Create data directory if it doesn't exist
    os.makedirs("data", exist_ok=True)

    # Timestamp for this run (e.g., 2024-12-05_09-00)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")

    # Configure separate JSON output per spider with timestamp
    settings.set("FEEDS", {
        f"data/%(name)s_{timestamp}.json": {
            "format": "json",
            "encoding": "utf-8",
            "overwrite": True,
        }
    })

    # Create a CrawlerProcess with project settings
    process = CrawlerProcess(settings)

    # Schedule all spiders to run
    process.crawl("goes19")
    process.crawl("sfcana")
    process.crawl("cimss")
    process.crawl("trackthetropics")
    process.crawl("uwyo")

    # Start crawling (blocks until all spiders finish)
    process.start()


if __name__ == "__main__":
    main()
