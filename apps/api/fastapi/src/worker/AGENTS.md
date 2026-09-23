# worker domain — agent context

**Owner:** Barrels platform runtime. ARQ worker on Redis.

- `main.py` `WorkerSettings`: functions and cron jobs — `process_cap_jobs`, `ingest_cap_feeds`, `send_notification_emails` (every 30 s), `run_notification_sweeps` (10:00 daily).
- `dispatch.py`: due-job processing with exponential retry (`_retry_delay_seconds`). `publishers.py`: CAP side effects (webhooks, PDF, social image, static map).
- Rules: new jobs must be idempotent, retry-safe, logged, and monitored; persist job state in the database (like `CapJobEvent`) rather than relying on Redis alone.
- Tests: `tests/worker/` (`test_dispatch.py`, `test_health_import.py`).
- Related: `src/cap/AGENTS.md`, `src/notifications/AGENTS.md`.
