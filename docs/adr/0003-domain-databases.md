# ADR-0003: Keep Separate Domain Databases On Shared PostgreSQL

## Status

Accepted

## Context

Auth/HR data, weather image archive metadata, and structured weather products have different ownership, data models, and migration workflows.

## Decision

Run a shared PostgreSQL server per environment, but keep separate databases for FastAPI, `wxwatch`, and `wxproducts`.

## Consequences

- Domain schemas can evolve independently.
- FastAPI owns Auth, HR, and CAP tables through Alembic.
- `wxwatch` and `wxproducts` own Drizzle schemas.
- Cross-domain access should go through APIs or explicit jobs, not shared tables.
- Backup and restore procedures must cover all three production databases.

