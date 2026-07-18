# scrapy-wxwatch

One-shot Scrapy job that downloads weather imagery, stores the image bytes locally or in S3-compatible object storage, and records searchable metadata in PostgreSQL.

## Local development

Requires Python 3.13 and `uv`. Create a local `.env.local` from `.env.local.example` and set `DB_PASSWORD` before the first run.

```bash
cd scripts/scrapy-wxwatch
uv sync
uv run python run_crawlers.py
```

Images default to `data/images`. JSON feeds are disabled by default; enable them only when needed:

```bash
uv run python run_crawlers.py --feed-dir data/feeds
```

Run one source with `uv run scrapy crawl <spider_name>`. Available spiders are `goes19`, `sfcana`, `cimss`, `trackthetropics`, and `uwyo`.

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

`run_crawlers.py` intentionally runs once and returns a non-zero status when a spider, item pipeline, or database operation fails. That makes it suitable for an external scheduler with retries and alerting.

Windows Task Scheduler only runs while that Windows host is available. In production, schedule this command where the crawler is deployed:

```bash
uv run python run_crawlers.py
```

Good deployment options are a cron or systemd timer on a DigitalOcean Droplet, a scheduled container job on the chosen platform, or a CI scheduler when its egress and runtime limits fit the crawl. Inject database and Spaces values through the platform secret store; do not bake credentials into an image or repository.

Do not run overlapping jobs. The database pipeline is idempotent for repeated URL/checksum pairs, but a single active crawl avoids unnecessary requests and storage traffic.

## Quality checks

```bash
uv run ruff format --check .
uv run ruff check .
uv run mypy app run_crawlers.py scripts/import_json_to_db.py
uv run pytest
```

See [pyproject.toml](pyproject.toml) for dependencies.
