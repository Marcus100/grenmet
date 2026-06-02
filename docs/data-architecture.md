# Data Architecture

GrenMet currently uses a modular-monolith data model: several applications share one deployed PostgreSQL server, but each domain owns its database or schema boundary.

## Database Ownership

| Database | Owner | Main code | Migration tool | Notes |
| --- | --- | --- | --- | --- |
| FastAPI DB: local `app`, staging `app_staging`, production `app_prod` | FastAPI | `apps/api/fastapi/src` | Alembic | Auth, HR, and FastAPI CAP domain tables |
| `wxwatch` | `@grenmet/web-wxwatch` and Scrapy pipeline | `apps/web/wxwatch/src/db/schema.ts` | Drizzle Kit | Weather image archive metadata |
| `wxproducts` | `@grenmet/web-wxproducts` | `apps/web/wxproducts/src/db/schema/` | Drizzle Kit | Structured meteorological products and PDF/export foundations |

The databases are provisioned by `infra/postgres/init-databases.sh` on first PostgreSQL volume initialization.

## FastAPI Database

FastAPI uses SQLModel and async SQLAlchemy for request handling. `apps/api/fastapi/src/database.py` imports all model modules so Alembic can see metadata.

Current FastAPI domains:

- Auth: users, sessions, roles, permissions, role assignments.
- HR: profiles, employment, rosters, leave, timesheets, workflows, status reports, absentee reports, shift swaps.
- CAP: alerts, info, areas, resources, references, incidents, snapshots, settings, hazards, predefined areas, integrations, job events, audit events.

Rules:

- Use Alembic for schema changes.
- Run `docker compose exec api uv run alembic upgrade head` to apply migrations in the API container.
- Run API tests after migration changes.
- Keep migration files committed with the model change.

## WxWatch Database

`wxwatch` owns a Drizzle table named `weather_images` with indexes for observation time, spider/fetch time, fetch time, and URL/checksum lookup.

Rules:

- Edit `apps/web/wxwatch/src/db/schema.ts` for schema changes.
- Run `pnpm db:generate` from `apps/web/wxwatch`.
- Run `pnpm db:migrate` from `apps/web/wxwatch`.
- Commit schema and generated migration output together.

The Scrapy pipeline writes weather image metadata into this database. Do not couple `wxwatch` data directly to FastAPI tables.

## WxProducts Database

`wxproducts` owns the structured meteorological product model. The schema barrel is `apps/web/wxproducts/src/db/schema/index.ts`.

Current schema families include:

- Morning, midday, and evening forecasts.
- Marine products.
- METAR/SPECI, TAF, SYNOP, BUFR, IWXXM primitives, and hourly observations.
- CAP and impact-based forecasting schema foundations.
- Tropical outlooks.
- Product metadata and suite grouping.

Rules:

- Edit files under `apps/web/wxproducts/src/db/schema/`.
- Run `pnpm db:generate` from `apps/web/wxproducts`.
- Run `pnpm db:migrate` from `apps/web/wxproducts`.
- Keep fixed-output PDF requirements in the document lane; do not force those dimensions into generic UI tokens.

## Backups

Production backup automation covers all three production databases:

- `app_prod`
- `wxwatch`
- `wxproducts`

The workflow uses custom-format `pg_dump`, verifies each dump by restoring into a temporary database, uploads to DigitalOcean Spaces, and keeps local files for 30 days. See [operations.md](operations.md#backups-and-restore).

## Data Governance Rules

- Do not share tables across domains. Use APIs, generated clients, or explicit import/export jobs.
- Do not let frontend code connect directly to FastAPI's database.
- Do not store raw session secrets. FastAPI stores hashed session tokens.
- Treat HR and identity data as sensitive.
- Treat CAP warning records, snapshots, and audit events as official operational records.
- Prefer append-only audit/history records for official products and warning lifecycle actions.
- Document retention and deletion behavior before implementing destructive cleanup.

## Current Gaps

- No repo-level ER diagram.
- No formal data retention policy encoded in migrations or cleanup jobs.
- No automated restore drill workflow.
- No cross-domain data lineage catalogue.
- No general audit table outside the CAP domain.

These are governance and operations gaps, not hidden implementation details.

