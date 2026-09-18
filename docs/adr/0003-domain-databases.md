# ADR-0003: Keep Separate Domain Databases On Shared PostgreSQL

## Status

Accepted

## Context

Auth/HR data, weather image archive metadata, and structured weather products have different ownership, data models, and migration workflows.

## Decision

Run a shared PostgreSQL server per environment, but keep separate databases for FastAPI, `wxwatch`, `wxproducts`, `janitorial`, and `transport`.

## Consequences

- Domain schemas can evolve independently.
- FastAPI owns Auth, HR, and CAP tables through Alembic.
- FastAPI owns `wxproducts` schema migrations through its dedicated weather Alembic configuration; weather stays in a separate database.
- `janitorial` and `transport` retain their current Drizzle migrations during the remaining migration work. WxWatch now uses its own FastAPI Alembic history.
- The `janitorial` database backs the `/janitor` facilities cleaning-spec catalogue; it is self-contained and does not reference HR/CAP/wx tables.
- The `transport` database backs the `/bus` staff-transportation timetable (routes, shifts, stops, trips); it is self-contained and does not reference HR/CAP/wx tables.
- Cross-domain access should go through APIs or explicit jobs, not shared tables.
- Backup and restore procedures must cover all production databases.


## Weather ownership amendment — September 2026

The user selected FastAPI as the owner of operational backend rules and database
migrations and browser-facing authentication/API operations, with web/PWA apps
handling presentation. Hono is deferred; Payload remains unchanged for now. Weather authoring is the first write handover. Its Alembic
baseline supports fresh installation or verified adoption of the three existing
Drizzle revisions, retains records and the historical Drizzle journal, and rejects
untracked schema drift. FastAPI's main and weather metadata/history remain separate.
The old weather Drizzle runners are disabled. Legacy weather schemas remain in the
baseline; their unused web implementations are separate cleanup/migration work.


WxWatch ownership: FastAPI now owns metadata queries, ingestion, file authorization and migrations. Scrapy submits through a worker-authenticated API. Verified legacy Drizzle history is adopted without deleting records; the separate database is retained.
