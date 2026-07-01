# Data Architecture

GrenMet currently uses a modular-monolith data model: several applications share one deployed PostgreSQL server, but each domain owns its database or schema boundary.

## Database Ownership

| Database | Owner | Main code | Migration tool | Notes |
| --- | --- | --- | --- | --- |
| FastAPI DB: local `app`, staging `app_staging`, production `app_prod` | FastAPI | `apps/api/fastapi/src` | Alembic | Auth, HR, and FastAPI CAP domain tables |
| `wxwatch` | `@grenmet/web-admin` (admin-gms) + Scrapy pipeline | `apps/web/admin-gms/src/db/wxwatch/schema.ts` | Drizzle Kit | Weather image archive metadata |
| `wxproducts` | `@grenmet/web-admin` (admin-gms) | `apps/web/admin-gms/src/db/wxproducts/schema/` | Drizzle Kit | Structured meteorological products and PDF/export foundations |

> Since the 2026-06 consolidation, the `wxwatch` and `wxproducts` databases (formerly owned by the standalone `wxwatch`/`wxproducts` web apps) are owned by **admin-gms**. Their migrations run in production via the `web-migrate` service (built from admin-gms's `migrate` Dockerfile stage). The databases and their backups are otherwise unchanged.

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

- Edit `apps/web/admin-gms/src/db/wxwatch/schema.ts` for schema changes.
- Run `pnpm db:wxwatch:generate` from `apps/web/admin-gms`.
- Run `pnpm db:wxwatch:migrate` from `apps/web/admin-gms`.
- Commit schema and generated migration output together.

The Scrapy pipeline writes weather image metadata into this database. Do not couple `wxwatch` data directly to FastAPI tables.

## WxProducts Database

`wxproducts` owns the structured meteorological product model. The schema barrel is `apps/web/admin-gms/src/db/wxproducts/schema/index.ts`.

Current schema families include:

- Morning, midday, and evening forecasts.
- Marine products.
- METAR/SPECI, TAF, SYNOP, BUFR, IWXXM primitives, and hourly observations.
- CAP and impact-based forecasting schema foundations.
- Tropical outlooks.
- Product metadata and suite grouping.

Rules:

- Edit files under `apps/web/admin-gms/src/db/wxproducts/schema/`.
- Run `pnpm db:wxproducts:generate` from `apps/web/admin-gms`.
- Run `pnpm db:wxproducts:migrate` from `apps/web/admin-gms`.
- Keep fixed-output PDF requirements in the document lane; do not force those dimensions into generic UI tokens.

## Backups

Production backup automation covers all three production databases:

- `app_prod`
- `wxwatch`
- `wxproducts`

The workflow uses custom-format `pg_dump`, verifies each dump by restoring into a temporary database, uploads to DigitalOcean Spaces, and keeps local files for 30 days. See [infrastructure.md](infrastructure.md#backups-and-restore).

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

---

## Data Governance and Interoperability Strategy

This section defines how GMS manages data as an institutional asset and how it enables interoperability with regional and international partners.

### Data Ownership

| Data domain | Owner | Classification |
| --- | --- | --- |
| Observations (AWS, manual) | Observations Unit | Public (aggregated); Restricted (raw / unaggregated) |
| Forecasts and warnings | Forecasting Unit | Public |
| Aviation products (METAR, SPECI, TAF) | Aviation MET Unit | Public / AFTN |
| HR and identity | HR / Admin | Confidential |
| CAP alerts and audit events | Warning Lead / DTO | Public (published alerts); Internal (audit trail) |
| Archive | DTO | Public (products); Internal (audit) |
| System logs | DTO | Internal |

### Metadata Requirements

Every dataset and product must carry the following minimum metadata:

| Field | Requirement |
| --- | --- |
| `productCode` | Unique identifier from the product catalogue |
| `issuedAt` | UTC timestamp |
| `issuedBy` | Forecaster user ID |
| `approvedBy` | Reviewer user ID |
| `validFrom` / `validTo` | UTC timestamps |
| `disseminationChannels` | Which channels received the product |
| `archiveStatus` | Confirmed archive location |
| `dataSource` | Input datasets (observations, NWP, satellite) |

### Data Quality

| Scenario | Handling rule |
| --- | --- |
| Missing observation data | Display gap explicitly — never interpolate silently |
| Suspect / flagged observation | Flag visible in dashboard; exclude from automated products until reviewed |
| Late data arrival | Accept and store with original observation timestamp; flag latency |
| Corrected product | Correction linked to original; original not deleted; reason recorded |
| Duplicate record | Deduplicate on CAP `identifier` and product code + issue time |

### Data Access Tiers

| Tier | Description | Authentication |
| --- | --- | --- |
| Public | Published forecasts, warnings, CAP feed, observations summary | None |
| Partner | Detailed observation data, structured API, agency dashboard | API key (planned) |
| Internal | Forecaster workbench, approval workflow, HR, full archive | Staff account + MFA |
| Restricted | Raw logs, security audit trail, system config | DTO / ISDS only |

### Data Formats for Interoperability

| Format | Use case | Status |
| --- | --- | --- |
| JSON / REST | Public API and internal API | Active |
| CAP 1.2 (XML) | Warnings — multi-channel dissemination | Active |
| GeoJSON | Warning polygons; mapping | Active |
| RSS 2.0 | Alert syndication feed | Active |
| BUFR | Observation exchange (WMO standard) | Schema exists; encoding pipeline gap |
| IWXXM | Aviation MET exchange (ICAO standard) | Schema foundations; encoding gap |
| WCMP2 metadata | WIS2 dataset discovery records | Not yet authored |
| GRIB / NetCDF | NWP model data | Not yet in scope |

### Retention Policy

| Data type | Retention | Basis |
| --- | --- | --- |
| Aviation products (METAR, SPECI, TAF, warnings) | Permanent | ICAO Annex 3 QMS requirement |
| Public warnings and CAP snapshots | Permanent | Official record |
| Public forecasts and bulletins | 10 years minimum | Archive and verification |
| Observation data | 30 years minimum | Climate record |
| Audit events | 10 years minimum | Accountability |
| HR data | Per employment law | Legal requirement |
| System logs | 1 year | Operational need |

Formal retention rules are not yet encoded in database cleanup jobs — this is a documented gap. No data within retention period should be deleted until formal retention policies are implemented and approved.

### WMO WIS 2.0 Readiness

WIS 2.0 is the WMO's next-generation information system for global meteorological data exchange. GMS's path toward WIS 2.0 compliance:

| Step | Status | Target |
| --- | --- | --- |
| CAP alerts available via public HTTPS endpoint | Implemented | — |
| WIGOS station identifiers registered for AWS stations | Gap | Q4 2026 |
| WCMP2 metadata records authored for core datasets | Gap | Year 2 |
| WIS2Box worker deployed for automated publication | Gap | Year 2 |
| Core observation data published to Global Cache | Gap | Year 2 |

### Licensing

| Data type | Default licence | Notes |
| --- | --- | --- |
| Published forecasts and warnings | Open — attribution required | GMS as source must be cited |
| CAP alerts | Open — attribution required | Standard CAP terms |
| Observation data | Open — attribution required | Review with WMO data policy |
| Aviation products | Restricted to aviation use | ICAO-governed dissemination |
| Historical climate data | Open on request — review for commercial use | Pending formal policy |

A formal data licence and terms of use policy document has not yet been produced. This is required before the public API is officially launched.

### Auditability

The principle is: for any official product, GMS must be able to answer — who issued it, when, what did it say, who approved it, and how was it disseminated.

| Domain | Audit coverage | Gaps |
| --- | --- | --- |
| CAP warnings | Full — create, edit, submit, approve, publish, cancel, expire | None |
| Aviation products | Partial — schema records author; no full lifecycle audit yet | Full audit trail gap |
| Public forecasts | Partial — timestamp and author on product records | No formal approval audit |
| HR | Partial — workflow and timesheet records | No general audit table |
| System configuration | None | Gap — no config change log |

The CAP domain audit model should be extended to all official product domains as they are built out.

---

### Related Documents

| Document | Relationship |
| --- | --- |
| [Compliance Traceability Matrix](./internal/compliance-traceability.md) | WIS 2.0, WIGOS, BUFR, IWXXM obligations |
| [Aviation Compliance Plan](./operations/aviation-compliance-plan.md) | Aviation data requirements and retention |
| [Cybersecurity and Continuity Plan](./operations/cybersecurity-continuity.md) | Data access controls and backup |
| [Warning Operations](./internal/warning-operations.md) | CAP audit trail implementation |
| [Infrastructure](./infrastructure.md) | Backup commands and restore procedures |

