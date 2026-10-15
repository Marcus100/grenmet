# wxwatch domain — agent context

**Owner:** GMS (weather imagery archive). Barrels maintains the code.

## Data
Separate PostgreSQL database with its own Alembic history (`alembic.ini`, `migrations/`); image objects in S3-compatible storage.

## Layout
`router.py` (`/api/v1/wxwatch/*`: gallery, catalogue, metadata), `ingestion.py` (worker-only archive writes), `catalogue.py`, `derivations.py`, `assets.py`, `service.py` (UTC gallery selection in three-hour floor buckets), `nhc_import.py`.

## Invariants
- Ingestion is **worker-only**: bearer token `INGEST_TOKEN` (≥32 chars) compared with `hmac.compare_digest`, per-source expiring leases, idempotency keys. The Scrapy collector (`scripts/scrapy-wxwatch`) submits through this API; it has no database credentials.
- `GET /api/v1/wxwatch/ready` is anonymous and returns only 204/503.
- Image bytes are served through authenticated storage routes, never public bucket URLs.

- NHC reads and durable operator requests live in `nhc_router.py`/`nhc_service.py`; only the dedicated NHC worker collects/imports. Meteorological times remain separate from retrieval/check times. Source editions and assets are immutable; failed pulls retain previous successful data.

- `alerts.py` only reads NHC job state to notify; it never writes the archive. Set `WXWATCH_ALERT_ORGANISATION_ID` (default `gaa`) and `nhc.pull_failed` goes to `cap-admin` and `management` by default; an admin can change the roles in notification settings (and with none chosen nobody is told).

## Tests
`tests/wxwatch/` (archive, assets, catalogue, gallery, ingestion, migration, NHC import).

## Related
`docs/exec-plans/wxwatch-archive-model.md`, ADR-0003, `scripts/scrapy-wxwatch/README.md`.
