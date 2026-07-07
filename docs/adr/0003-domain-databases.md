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
- `wxwatch`, `wxproducts`, `janitorial`, and `transport` own Drizzle schemas (in admin-gms).
- The `janitorial` database backs the `/janitor` facilities cleaning-spec catalogue; it is self-contained and does not reference HR/CAP/wx tables.
- The `transport` database backs the `/bus` staff-transportation timetable (routes, shifts, stops, trips); it is self-contained and does not reference HR/CAP/wx tables.
- Cross-domain access should go through APIs or explicit jobs, not shared tables.
- Backup and restore procedures must cover all production databases.

