# FastAPI App Audit — health, best practices, and CAP migration

Read-only audit of `apps/api/fastapi`, focused on (1) overall up-to-date / best-practice
health and (2) the Django **capcomposer → FastAPI `src/cap`** migration. No code was
changed. Date: 2026-06-28.

> Context: `apps/api/fastapi/cap/` is the original Django/Wagtail **capcomposer**, kept
> git-ignored as a read-only parity reference. `src/cap/` is the FastAPI port. The goal is
> to finish converting capcomposer to FastAPI and harvest its important packages **without
> compromising FastAPI integrity** (async-first, two-layer models, typed, no sync frameworks).

---

## Executive summary (what actually matters)

| Pri | Finding | Why it matters |
|---|---|---|
| **P1** | **CAP model ↔ DB drift** | `src/cap` models diverge from the committed schema. Every `alembic revision --autogenerate` re-emits `cap.*` changes (FK `ondelete`, `alert.identifier` unique index, `TEXT`→`AutoString`). This already polluted the HR migrations and makes all future migrations error-prone. |
| **P1** | **OpenAPI contract drift** | `openapi.json` / api-client need regen (HR routes + any cap changes). CI fails on drift. |
| **P2** | **Publish/worker half of CAP is stubbed** | `CapJobEvent` rows are enqueued (`publish.mqtt/webhooks/pdf/static_map/social_image/wis2box`) but **nothing consumes them** — there is no task queue or scheduler in the app. Side-effects silently never run. |
| **P2** | **Heavy capcomposer packages not yet ported** | MQTT publish, PDF, static maps, XML signing, feed polling, translation are modeled/stubbed but not implemented (see parity matrix). |
| **P3** | Two observability stacks (ddtrace vs OTel), leftover capcomposer env samples in `src/cap`, secret `changethis` defaults | Hygiene; decide one tracing stack before porting OTel. |

**The good:** tooling is strong (mypy `strict`, broad ruff `select`, `pytest-asyncio`,
coverage with contexts). Structure follows the documented conventions. `src/cap` is a
genuine, substantial port — not a skeleton.

---

## CAP migration parity matrix

capcomposer capability → status in `src/cap`:

| capcomposer feature (pkg) | FastAPI `src/cap` status | Notes |
|---|---|---|
| Data model (alerts/info/area/resource/reference/incident) | ✅ ported | 16 `Cap*` tables, `models.py` (416 LOC) |
| API layer | ✅ ported | `router.py` (324), `schemas.py` (311), `service.py` (1208) |
| CAP XML build/parse (`xmltodict`, `lxml`, `djangorestframework-xml`) | ✅ ported | `xml.py` — native, no DRF dependency |
| CAP validation (`capvalidator`) | ⚠ reimplemented | `validation.py` (native, 64 LOC). **Decision:** native vs official `capvalidator` as source of truth |
| Geo / GeoJSON (`shapely`) | ✅ reimplemented | `geo.py` — native, avoids shapely C-dep |
| Feed import + RSS (`feedparser`) | ◑ partial | `CapFeedImport` model + RSS gen present; **no scheduler** to poll external feeds |
| Webhooks | ◑ modeled, not delivered | enqueued as `publish.webhooks`, no consumer |
| MQTT publish (`paho-mqtt`) | ◑ modeled, not implemented | `CapMqttBroker` exists; `paho` not a dep; `publish.mqtt` never runs |
| PDF export (`weasyprint`, `pdf2image`) | ✗ stub | `publish.pdf` enqueued only |
| Static map images (`staticmap`) | ✗ stub | `publish.static_map` enqueued only |
| XML digital signature (`signxml`) | ✗ not implemented | CAP alerts often require signing |
| Translation (`django-deep-translator`) | ✗ not ported | multi-language alerts |
| Background jobs (`celery`, `celery-beat`, `celery-singleton`, `django-redis`) | ✗ **no queue** | `tasks.py` is a durable-outbox stub awaiting a worker |
| Admin boundaries (`adm-boundary-manager`) | ◑ modeled | `CapPredefinedArea`; verify data source |
| Newsletter (`wagtail-newsletter`, `mailchimp`, `mrml`) | ✗ out of scope? | Wagtail CMS feature; confirm if needed |
| Auth hardening (`django-axes`, `wagtail-2fa`, `django-ipware`) | ◑ partial | FastAPI has `slowapi` rate-limit; no lockout/2FA |
| CMS / page editing (Wagtail) | ✗ N/A | Wagtail-specific; not a FastAPI concern |

Legend: ✅ done · ◑ partial/modeled · ✗ not yet · ⚠ divergent approach

### The central gap: no task runtime

`src/cap/tasks.py:enqueue_publish_side_effects` writes `CapJobEvent` rows for a worker
"once Redis/Celery dependencies are enabled." That worker does not exist. So **the entire
publish pipeline (MQTT, webhooks, PDF, static map, social image, wis2box) is dormant.**
Finishing the migration largely means standing up this runtime and the publishers.

### Packages to harvest — FastAPI-integrity-preserving choices

| Need | capcomposer used | Recommended for FastAPI | Why |
|---|---|---|---|
| Task queue + schedule | Celery + beat + Redis | **arq** (or Celery if you prefer) | async-native (asyncio/Redis), matches the async stack; the outbox table already fits a worker poller |
| MQTT | `paho-mqtt` | `aiomqtt` (asyncio wrapper) or `paho-mqtt` in worker | keep network I/O in the worker, not the event loop |
| PDF | `weasyprint` | `weasyprint` (same) | pure-python; run in worker/threadpool |
| Static maps | `staticmap` | `staticmap` (same) | run in worker |
| XML signing | `signxml` | `signxml` (same) | standards-compliant CAP signing |
| Feed parsing | `feedparser` | `feedparser` (same) | for `CapFeedImport` ingestion |
| Validation | `capvalidator` | decide: keep native `validation.py` or adopt `capvalidator` | one source of truth |

Avoid pulling in: Wagtail, Django-* packages, `django-redis`, and the OpenTelemetry stack
(you already standardized on ddtrace) — those would fracture FastAPI integrity.

---

## App-wide best-practice findings

**P1 — reconcile CAP drift.** Generate one dedicated migration that brings the DB in line
with `src/cap/models.py` (FK `ondelete`, `alert.identifier` unique, column types). Until
then, every autogenerate must be hand-stripped of `cap.*` noise (as was done for the two
HR migrations).

**P1 — regenerate the API contract** after HR + any cap changes:
`uv run python -c "from src.main import app; import json; json.dump(app.openapi(), open('openapi.json','w'), indent=2)"` then `pnpm generate:api-client`.

**P2 — decide the worker story now.** Either (a) add `arq` + a `worker.py` consuming
`CapJobEvent`, or (b) explicitly document that publish side-effects are deferred so the
outbox doesn't look "wired" when it isn't.

**P2 — one tracing stack.** Keep ddtrace; do not port capcomposer's OpenTelemetry deps.

**P3 — hygiene.** Move `src/cap/.env.standalone.sample` (capcomposer leftover) into docs or
remove; keep the git-ignored `cap/` reference as-is (your choice); confirm ruff/mypy never
traverse `cap/` (currently safe — they target `src`/`tests`).

**Tooling/health (no action needed):** mypy strict ✓, ruff broad select incl. `B`,`UP`,`ARG001`,`T201` ✓, async test mode ✓, Sentry + ddtrace + JSON logging wired ✓, `requires-python >=3.10` consistent ✓.

---

## Suggested order (when you're ready — all gated on your approval)

1. **Reconcile CAP DB drift** (P1) — unblocks clean migrations everywhere.
2. **Regenerate OpenAPI + api-client** (P1) — clears contract drift.
3. **Stand up the task runtime** (arq + worker) consuming `CapJobEvent` (P2) — turns the dormant outbox on.
4. **Port publishers incrementally**: webhooks → MQTT → static map → PDF → signing, each behind the worker.
5. **Feed polling scheduler** for `CapFeedImport`.
6. Revisit translation / newsletter only if in scope.

This audit is analysis only. Tell me which item to start and I'll plan it properly.
