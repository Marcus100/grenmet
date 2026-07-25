# Scrapy settings for app project
#
# For simplicity, this file contains only settings considered important or
# commonly used. You can find more settings consulting the documentation:
#
#     https://docs.scrapy.org/en/latest/topics/settings.html
#     https://docs.scrapy.org/en/latest/topics/downloader-middleware.html
#     https://docs.scrapy.org/en/latest/topics/spider-middleware.html

import os
from pathlib import Path

from dotenv import load_dotenv
from app.config import ImageStorageConfig

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=_PROJECT_ROOT / ".env.local")

BOT_NAME = "app"

SPIDER_MODULES = ["app.spiders"]
NEWSPIDER_MODULE = "app.spiders"

ADDONS: dict[str, object] = {}


# Crawl responsibly by identifying yourself
USER_AGENT = "wxwatch/1.0 (Weather Image Archiver)"

# Obey robots.txt rules
ROBOTSTXT_OBEY = True

# Concurrency and throttling settings
CONCURRENT_REQUESTS_PER_DOMAIN = 1
DOWNLOAD_DELAY = 1

# Disable cookies (enabled by default)
# COOKIES_ENABLED = False

# Disable Telnet Console (enabled by default)
# TELNETCONSOLE_ENABLED = False

# Override the default request headers:
# DEFAULT_REQUEST_HEADERS = {
#    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
#    "Accept-Language": "en",
# }

# Enable or disable spider middlewares
# See https://docs.scrapy.org/en/latest/topics/spider-middleware.html
# SPIDER_MIDDLEWARES = {
#    "app.middlewares.AppSpiderMiddleware": 543,
# }

# Enable or disable downloader middlewares
# See https://docs.scrapy.org/en/latest/topics/downloader-middleware.html
# DOWNLOADER_MIDDLEWARES = {
#    "app.middlewares.AppDownloaderMiddleware": 543,
# }

# Enable or disable extensions
# See https://docs.scrapy.org/en/latest/topics/extensions.html
# EXTENSIONS = {
#    "scrapy.extensions.telnet.TelnetConsole": None,
# }

# Configure item pipelines
# See https://docs.scrapy.org/en/latest/topics/media-pipeline.html
# Pipeline order matters: identify the source, then download/inspect, then record.
ITEM_PIPELINES = {
    "app.pipelines.SpiderNamePipeline": 100,  # Add spider name to items
    "app.pipelines.MinutePathImagesPipeline": 200,  # Download images
    "app.pipelines.PostgresPipeline": 300,  # Write to PostgreSQL
}

# Local development stores images under this project; a complete STORAGE_*
# configuration switches Scrapy to its native S3-compatible storage adapter.
_STORAGE = ImageStorageConfig.from_env(
    os.environ, default_local_store=_PROJECT_ROOT / "data" / "images"
)
IMAGES_STORE = _STORAGE.images_store
AWS_ENDPOINT_URL = _STORAGE.endpoint_url
AWS_REGION_NAME = _STORAGE.region
AWS_ACCESS_KEY_ID = _STORAGE.access_key_id
AWS_SECRET_ACCESS_KEY = _STORAGE.secret_access_key
FILES_STORE_S3_ACL = _STORAGE.object_acl

# Allow redirects for image downloads (fixes http->https redirects)
MEDIA_ALLOW_REDIRECTS = True

# Retry configuration
RETRY_ENABLED = True
RETRY_TIMES = 3
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

# Enable and configure the AutoThrottle extension
# See https://docs.scrapy.org/en/latest/topics/autothrottle.html
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 1
AUTOTHROTTLE_MAX_DELAY = 10
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0

# Keep production one-shot runs fresh. Developers may opt in with
# `-s HTTPCACHE_ENABLED=1` when invoking Scrapy directly.
# See https://docs.scrapy.org/en/latest/topics/downloader-middleware.html#httpcache-middleware-settings
HTTPCACHE_ENABLED = False
HTTPCACHE_EXPIRATION_SECS = 3600  # 1 hour
HTTPCACHE_DIR = ".scrapy/httpcache"
HTTPCACHE_IGNORE_HTTP_CODES = [500, 502, 503, 504]
HTTPCACHE_STORAGE = "scrapy.extensions.httpcache.FilesystemCacheStorage"

# Logging
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s [%(name)s] %(levelname)s: %(message)s"

# Set settings whose default value is deprecated to a future-proof value
FEED_EXPORT_ENCODING = "utf-8"

# PostgreSQL database connection settings
# Used by PostgresPipeline for direct database writes
# On Windows, use 127.0.0.1 instead of localhost for Docker connections
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "wxwatch")
DB_USER = os.getenv("DB_USER", "wxwatch")
DB_PASSWORD = os.getenv("DB_PASSWORD")
