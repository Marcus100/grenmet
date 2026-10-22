# ADR-0038: One background-job runner

## Status

Accepted (owner decision, 2026-10-20).

## Context

Several domains need work that runs without a user request: sending email, publishing alerts, fetching outside data, cleaning up. The one runner for all of this is already the ARQ worker on Redis in `apps/api/fastapi/src/worker/main.py`. Nothing writes this down, so a new feature could add a second system (a cron container, Celery, a timer in a Next.js app) without anyone deciding to.

Today `WorkerSettings.functions` lists 21 jobs and `cron_jobs` schedules them, with `job_timeout = 300` and `max_tries = 1`. Per-job retries and backoff live on the durable outbox rows, not in ARQ.

## What runs there today

Names are from `src/worker/main.py`.

| Category | Jobs |
| --- | --- |
| Sending | `send_notification_emails`, `send_outbound_emails`, `enqueue_booking_reminders`, `enqueue_event_reminders`, `send_invoice_reminders`, `run_notification_sweeps` |
| Publishing and safety | `process_cap_jobs`, `send_wis2_publications`, `check_nhc_failures`, `check_alert_outbox` |
| Clean-up | `expire_unpaid_bookings`, `expire_unpaid_event_orders`, `purge_expired_data` |
| Fetching | `ingest_cap_feeds`, `poll_flights`, `fetch_marine_environment`, `fetch_air_environment`, `fetch_model_guidance` |
| Outbox drains | `drain_outbox` (platform outbox, ADR-0026), `drain_events_outbox`, `sync_event_rewards` |

`check_outbox_backlog` also runs here (see decision 4).

## Decision

1. **ARQ on Redis is the only background-job runner for every domain.** A new job is an `async def` in the worker's job set (or, once ADR-0031 lands, a worker job in its domain manifest), added to `functions` and, if periodic, to `cron_jobs`.
2. **A second job system needs a new ADR.** That includes cron containers, Celery, timers or scheduled functions inside Next.js apps, and GitHub Actions schedules that do application work. (CI and agent-routine schedules are not application work.)
3. **Jobs follow the existing shape.** Do the work in the domain's `service.py`, keep the job thin, make it idempotent, and put retry state on a database row (the outbox pattern), because ARQ-level tries are set to 1. No synchronous network calls in a job (root `AGENTS.md`).
4. **A stuck worker must be visible.** The worker already watches itself: `check_alert_outbox` (is the email outbox draining), `check_outbox_backlog` (dead and overdue rows in the platform and Events outboxes) and `check_nhc_failures`. New outbox-backed work must be covered by one of these checks or add its own.
5. **Events moves into the main API.** When the Events domain moves into the main app database ([ADR-0003](0003-domain-databases.md)), `drain_events_outbox` and `sync_event_rewards` go away: its work uses the platform outbox (`drain_outbox`), and `check_outbox_backlog` stops watching a separate Events outbox.

## Consequences

- One place to look when something did not send or publish: the worker log and the outbox tables.
- One Redis and one worker deployment to keep healthy. If the worker is down, every category stops together, so the health check (`health_check_interval = 30`) and the backlog checks are load-bearing.
- A long fetch can occupy a worker slot, so slow jobs set their own `timeout` (marine 900 s, air 1800 s, models 3600 s).
- Domains cannot choose a "simpler" scheduler for a small feature; the cost is writing a job in this worker.
- ADR-0031 changes where jobs are registered, not that they run here.
