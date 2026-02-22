# scrapy-wxwatch

Weather images downloader (Scrapy). Part of the Grenmet monorepo. Requires Python 3.13+.

## Setup and run

From repo root:

```bash
cd scripts/scrapy-wxwatch
uv sync
uv run python run_crawlers.py
```

To run a single spider:

```bash
uv run scrapy crawl <spider_name>
```

Spiders live in `app/spiders/`. Output is written to `data/`. To import JSON into the database, see `scripts/import_json_to_db.py`.

See [pyproject.toml](pyproject.toml) for dependencies.
