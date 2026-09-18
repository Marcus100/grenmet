# scrapy-wxwatch

One-shot Scrapy job that downloads weather imagery, stores the image bytes locally or in S3-compatible object storage, and sends searchable metadata to FastAPI, which owns the separate WxWatch PostgreSQL database.

## Local development

Requires Python 3.13 and `uv`. Create a local `.env.local` from `.env.local.example` and configure the archive API before the first run.

```bash
cd scripts/scrapy-wxwatch
uv sync --frozen --package wxwatch
uv run --frozen --package wxwatch python run_crawlers.py goes19
```

Images default to `data/images`. JSON feeds are disabled by default; enable them only when needed:

```bash
uv run --frozen --package wxwatch python run_crawlers.py goes19 --feed-dir data/feeds
```

Run one source with `uv run --frozen --package wxwatch python run_crawlers.py <spider_name>`, or use `./run_spider.sh <spider_name>`. Available spiders are `goes19`, `sfcana`, `cimss`, `trackthetropics`, and `uwyo`. A source is required; pass `all` explicitly only for a manual run of every source.

## Required archive API configuration

Set `WXWATCH_INGEST_TOKEN` to the same random secret (at least 32 characters) in the collector and FastAPI environments. Generate it locally with `openssl rand -hex 32`; never commit it. The collector default `WXWATCH_API_URL` is `http://127.0.0.1:8000/api/v1/wxwatch`. Use HTTPS for remote connections.

Only FastAPI needs `WXWATCH_DATABASE_URL`. Old collector `DB_*` values are unused. FastAPI prestart runs `alembic -c src/wxwatch/alembic.ini upgrade head`; this installs fresh databases or adopts verified legacy Drizzle history without deleting images.

Local Docker API mounts `data/images` read-only at `/app/wxwatch-images`. Recreate the API container after updating Compose. Outside Docker, set FastAPI `WXWATCH_LOCAL_IMAGES_DIR` to this directory. Production uses private object storage when that local directory is unset. Do not expose a public symlink to the archive.

## DigitalOcean Spaces

Set the following secrets in the runtime that executes the crawler:

```bash
STORAGE_ENDPOINT_URL=https://nyc3.digitaloceanspaces.com
STORAGE_REGION=nyc3
STORAGE_BUCKET=your-space
STORAGE_ACCESS_KEY_ID=your-spaces-key
STORAGE_SECRET_ACCESS_KEY=your-spaces-secret
STORAGE_PREFIX=wxwatch
STORAGE_OBJECT_ACL=private
```

Replace `nyc3` with the Space region. The four endpoint, bucket, key, and secret values are all-or-nothing; startup fails on a partial cloud configuration instead of silently writing to local disk.

Keep `STORAGE_OBJECT_ACL=private` and `STORAGE_PREFIX=wxwatch`. gaa-admin routes image requests to FastAPI, which validates the staff session and returns either local bytes or a short-lived signed object URL. New downloads preserve original bytes and include a content hash in their path so corrections cannot overwrite earlier files.

## Online scheduling

`run_crawlers.py` intentionally runs once and returns a non-zero status when a spider, item pipeline, database operation, freshness check, required-product check, timeout, or overlap check fails. Unchanged images still count as healthy when they are present and current. That makes the command suitable for an external scheduler with retries and alerting.

Windows Task Scheduler only runs while that Windows host is available. In production, schedule this command where the crawler is deployed:

```bash
uv run --frozen --package wxwatch python run_crawlers.py goes19
```

Create a separate scheduler entry for each spider so each source can have its own cadence. For example, schedule `goes19` frequently, slower-changing products less often, and `uwyo` after its expected synoptic data is available. The scheduler owns the clock; this project owns one bounded, observable crawl attempt.

| Source | Successful output | Freshness | Timeout |
| --- | --- | --- | --- |
| `goes19` | 8 products | 3 hours | 15 minutes |
| `sfcana` | 1 product | 18 hours | 10 minutes |
| `cimss` | 22 products | 24 hours | 20 minutes |
| `trackthetropics` | Every eligible image on the live page | Fetched during the current run | 30 minutes |
| `uwyo` | 4 station/cycle products | 36 hours | 15 minutes |

HTTP caching is disabled for these production runs so frequent schedules see newly published imagery.

Good deployment options are a cron or systemd timer on a DigitalOcean Droplet, a scheduled container job on the chosen platform, or a CI scheduler when its egress and runtime limits fit the crawl. Inject archive API and Spaces values through the platform secret store; do not bake credentials into an image or repository.

FastAPI rejects overlapping runs of the same source using a database-backed 45-minute lease. Runs are recorded as finished, failed, or expired (when a later run reclaims the lease). Different spiders may run at the same time. Repeated URL/checksum pairs remain idempotent.

## Quality checks

```bash
uv run --frozen --package wxwatch ruff format --check .
uv run --frozen --package wxwatch ruff check .
uv run --frozen --package wxwatch mypy app run_crawlers.py scripts/import_json_to_db.py
uv run --frozen --package wxwatch pytest
```

See [pyproject.toml](pyproject.toml) for dependencies.
