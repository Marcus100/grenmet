# ADR-0003: One main database, with separate databases only where the data differs

## Status

Accepted (rewritten 2026-10-21).

## Context

Barrels Grenada owns and controls all data on the platform, including the data it holds for Grenada Airports Authority (GAA) and the Grenada Meteorological Service (GMS). Nothing on the platform is live yet; everything runs in test.

Some data must change together. A ticket, its payment and the points it earns must save in one transaction. Other data has a different job: long-term weather records, or an operations tool with its own engine. Mixing the two kinds makes backups, retention and risk harder to manage.

## Decision

**One main database (APP)** holds everything that must transact together or that belongs to the Barrels product platform. It uses one Postgres schema per module (for example `bookings`, `events`, `payments`, `rewards`, `contacts`, `organisations`). A module never queries another module's tables directly. It goes through that module's service or an explicit job.

**A domain gets its own database only when** its data has a different owner or legal duty, a different retention period, a different risk profile, or runs its own engine.

| Database | What it holds | Migrations |
| --- | --- | --- |
| APP (main) | Auth, HR, CAP and the Barrels product modules | `apps/api/fastapi/alembic.ini` |
| WXWATCH | Weather image archive metadata | `src/wxwatch/alembic.ini` |
| WXPRODUCTS | Structured weather products | `src/wxproducts/alembic.ini` |
| EREGISTER | The paper-register tables and the observation store (ADR-0032), in a separate schema | `src/eregister/alembic.ini` |
| JANITORIAL | The `/janitor` cleaning-spec catalogue | `src/janitorial/alembic.ini` |
| TRANSPORT | The staff bus service | `src/transport/alembic.ini` |
| CMS | Payload CMS | Payload's own migrations |
| EVENTS | Barrels Events | `src/events/alembic.ini` |

EVENTS is moving into APP as the `events` schema (decided 2026-10-20). Nothing is live, so there is no data migration. The move removes Events' separate outbox and the `sync_event_rewards` job. Tickets, payments and points then save in one transaction. Until it lands, EVENTS stays in the table above.

**Why the weather and operations databases stay separate**, even though Barrels owns the data:
- Retention differs. Weather and observation records follow WMO and long-term archive needs, not product retention rules.
- Risk isolation. A fault or a bad migration in a product module must not touch operational weather data.
- Clean export. A separate database can be dumped, handed over or archived on its own.

Databases share one PostgreSQL server per environment. `infra/postgres/init-databases.sh` provisions them from the `<DOMAIN>_DB_NAME`, `_DB_USER` and `_DB_PASSWORD` variables. A domain with none of the three set is skipped.

## Consequences

- Product modules can join and transact freely inside APP, which keeps payments, bookings, events and rewards consistent.
- Schemas evolve independently per database. Each separate database has its own Alembic history; APP and the separate databases never share metadata.
- Cross-database access goes through APIs or explicit jobs, never shared tables.
- Backup and restore must cover every database that is provisioned.
- Adding a new separate database needs a stated reason from the list above.

## History

- The original decision (2026) kept separate databases for FastAPI, `wxwatch`, `wxproducts`, `janitorial`, `transport` and `events`, so each domain could evolve alone.
- September 2026: FastAPI became the owner of operational backend rules and migrations. Weather authoring was the first handover, with an Alembic baseline that adopts the three earlier Drizzle revisions and keeps their history.
- WxWatch, `janitorial` and `transport` moved to FastAPI Alembic histories. The web-owned Drizzle migrations are historical only. Hono was retired by ADR-0015.
- `eregister` joined as its own database for the manual observation register.
- 2026-10-20: the owner decided Events moves into APP, and the rule was restated as "one main database unless the data differs".
