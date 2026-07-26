# scrapy-wxwatch

One-shot Scrapy job that downloads weather imagery, stores the image bytes locally or in S3-compatible object storage, and records searchable metadata in PostgreSQL.

## Local development

Requires Python 3.13 and `uv`. Create a local `.env.local` from `.env.local.example` and set `DB_PASSWORD` before the first run.

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

## Required database configuration

The crawler writes directly to the existing `weather_images` table and exits unsuccessfully if a database write fails. Configure:

- `DB_HOST` (default `127.0.0.1`)
- `DB_PORT` (default `5432`)
- `DB_NAME` (default `wxwatch`)
- `DB_USER` (default `wxwatch`)
- `DB_PASSWORD` (required)

The table is owned by the admin app Drizzle migrations. Apply those migrations before running the crawler against a new database.

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

`STORAGE_OBJECT_ACL=private` is the safer default. Have the web application return signed URLs or proxy authorized requests. If every image may be public, use `public-read`, enable the Spaces CDN, configure CORS for the web origin, and build the asset URL from the CDN base plus the database `storage_path` value.

The current admin app helper still builds `/wxwatch/<storage_path>`. Point `apps/web/admin-gms/src/lib/wxwatch/utils.ts` at the CDN base, or add an authenticated image route for a private Space, as a separate web-app change.

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

Good deployment options are a cron or systemd timer on a DigitalOcean Droplet, a scheduled container job on the chosen platform, or a CI scheduler when its egress and runtime limits fit the crawl. Inject database and Spaces values through the platform secret store; do not bake credentials into an image or repository.

Overlapping runs of the same spider are rejected with a PostgreSQL advisory lock. Different spiders may run at the same time. Repeated URL/checksum pairs remain idempotent.

## Quality checks

```bash
uv run --frozen --package wxwatch ruff format --check .
uv run --frozen --package wxwatch ruff check .
uv run --frozen --package wxwatch mypy app run_crawlers.py scripts/import_json_to_db.py
uv run --frozen --package wxwatch pytest
```

See [pyproject.toml](pyproject.toml) for dependencies.
