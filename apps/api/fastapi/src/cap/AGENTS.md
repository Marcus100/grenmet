# cap domain — agent context

**Owner:** GMS operational service (warnings). Barrels maintains the code; GMS owns warning policy and thresholds. Ported from WMO's cap-composer.

## Layout
`models.py` (alerts, areas, feeds, jobs, audit events, lifecycle enums), `service.py` (authoring, lifecycle, import, feeds; it re-exports the names below, so `service.<name>` still works), `common.py` / `mapping.py` (shared helpers, row-to-schema conversions), `public_queries.py` (public feed and warning queries), `admin_lists.py` (settings, catalogues, audit, integrations), `validation.py` + `xml.py` (CAP 1.2 XML), `sign.py` (XML signing), `geo.py`, `pdf.py`, `images.py`, `cache.py` (public feed cache), `tasks.py` (enqueue publish side-effects), `profiles.py`/`profile_router.py` (hazard profiles).
Routes: authenticated `/api/v1/cap/*` and `/api/v1/hazard-profiles/*`; **public, unauthenticated** `/api/cap/*` (`public_router`, no `/v1`).

## Invariants
- Lifecycle is self-publish per ADR-0013 (supersedes ADR-0007's approval gate): `DRAFT` → `PUBLISHED` → `EXPIRED`/`CANCELLED`. `SUBMITTED`/`APPROVED` remain in `CapLifecycleState` for existing records and are still editable; don't build new flows on them. Alerts link to their source bulletin.
- Public feeds only expose published, in-scope alerts (`tests/cap/test_cap_public_scope.py`). After any publish/withdraw, invalidate the cache keys in `cache.py`.
- XML must validate against CAP 1.2 before publish; signing uses `CAP_SIGNING_CERT`/`CAP_SIGNING_KEY` (`config.py`). Never log key material.
- Side effects (PDF, social image, static map, webhooks) run in the ARQ worker through `CapJobEvent` rows (`src/worker/publishers.py`) with retries. Don't run them inline in a request. Email and browser push (`publish.email`, `publish.push`) are the same kind of job and live in `src/worker/cap_email.py` and `cap_push.py`.
- Don't change thresholds, wording policy or dissemination targets without GMS approval.

## Module boundaries
Imports point one way: `common` and `mapping` ← `public_queries` and `admin_lists` ← `service`. Never import `service` from those modules. Tests patch `service.invalidate`, `service.public_warnings` and `service.public_latest_active`, so the lifecycle functions that call `invalidate` stay in `service.py`, and nothing in `public_queries.py` may call `public_warnings` or `public_latest_active` itself: a patch on `service` would not reach it.

## Tests
`tests/cap/` (state machine, validation/XML/geo, signing, feeds, public scope, PDF, images, pagination).

## Related
ADR-0007, ADR-0013, `docs/internal/warning-operations.md`, `docs/operations/gms-products.md`, `docs/fastapi-cap-audit.md`.
