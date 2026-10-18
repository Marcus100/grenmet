# worker domain — agent context

**Owner:** Barrels platform runtime. ARQ worker on Redis.

- `main.py` `WorkerSettings`: functions and cron jobs — `process_cap_jobs`, `ingest_cap_feeds`, `send_notification_emails` (every 30 s), `send_outbound_emails` (every 30 s, public-flow outbox), `drain_events_outbox` (every 30 s, offset; Events outbox to notifications, no-op unless `EVENTS_DATABASE_URL` is set, see `src/events/AGENTS.md`), `send_wis2_publications` (every 30 s; eRegister CSV transfer to wis2box, no-op unless `WIS2BOX_*` is set, retry state on `eregister_send`), `run_notification_sweeps` (10:00 daily), `send_invoice_reminders` (11:00 UTC daily = 07:00 Grenada; idempotent per invoice and stage, see `src/billing/AGENTS.md`), `poll_flights` (minutes 5 and 35; no-op unless `FLIGHTS_OPENSKY_ENABLED`, see `src/flights/AGENTS.md`).
- `dispatch.py`: due-job processing with exponential retry (`_retry_delay_seconds`). `publishers.py`: CAP side effects (webhooks, PDF, social image, static map). `last_known_good.py` (job `publish.last_known_good`, queued with the other CAP side effects) rewrites `alerts/last-known-good.json` and `.html` in storage from the active public alerts for storm resilience; skips when storage is unconfigured. Runbook: `docs/operations/cloudflare-storm-cache.md`.
- `check_nhc_failures` (every 5 min) reads failed `archive_nhc_jobs` read-only and notifies `nhc.pull_failed` (`wxwatch/alerts.py`); `check_alert_outbox` (every 15 min) fails when due emails sit unsent for 10 minutes so job metrics show the alert path is stuck.
- Rules: new jobs must be idempotent, retry-safe, logged, and monitored; persist job state in the database (like `CapJobEvent`) rather than relying on Redis alone.
- Health probes must load only settings and Redis dependencies; load task/database/image dependencies during startup or job execution.
- Tests: `tests/worker/` (`test_dispatch.py`, `test_last_known_good.py`, `test_health_import.py`).
- Related: `src/cap/AGENTS.md`, `src/notifications/AGENTS.md`.

- `nhc.py` owns queue `grenmet:nhc`. Its dispatcher drains persisted WxWatch pull/point requests only; never install automatic NHC collection. Preserve archive locking, conditional requests, bounded downloads, coalescing and recoverable leases.
