# notifications domain — agent context

**Owner:** Barrels platform (ADR-0009 core). In-app inbox plus email outbox.

## How it works
- Modules register events in `events.py` (`register`, `register_sweep`) and call `service.notify(...)` **inside their own transaction**.
- Email is delivered later by the ARQ worker from `NotificationDelivery` rows (`send_notification_emails` every 30 s; daily `run_notification_sweeps`).
- Users choose the bell and the email separately for each event (`NotificationPreference.bell_enabled`, `email_enabled`; the event's `default_bell` and `default_email` apply until they choose). Approval events (`email_mutable: false`) cannot have email muted. **Urgent** events (`urgent=True`) always reach the bell, whatever was chosen, and the bell list shows the word Urgent. With the bell off but the email on, the row exists but is hidden (`in_bell` false) and never counted or listed.
- **Grouped** events (`grouped=True`, with `group_key`) fold repeats into the recipient's unread notification of the same key (the count goes up, the newest text wins, no second email). When both channels are off for a person no notification row exists, so `NotificationOccurrence` (`notification_occurrence`) remembers the item a grouped notification already counted, which keeps time-based sweeps idempotent.
- **GMS time-based sweeps** (`gms_sweeps.py`, registered with `register_sweep`) run in the worker job `run_gms_notification_sweeps` every 5 minutes: forecast overdue (15 minutes late; the 05:00 marine forecast is not covered yet because it has no scheduled product kind in `ISSUE_HOURS`), warning expiring, missing hourly observation (from 15 minutes past, manual hours only via the station schedule), failed sends, queries and new NHC products. Recipients come from department-scoped role grants; `duty_forecasters` batches its permission lookups.
- `notify(..., suppress_within=timedelta)` skips anyone already told about the same event and entity inside the window (use it for alerts that repeat; `dedupe_key` stays for exact once-only reminders). An unexpired `NotificationSnooze` (event, optionally one entity, per organisation) makes `notify` return 0 and log. Snoozes are managed under `/api/v1/notifications/snoozes` with `notifications.manage`.
- **Suppression list** (`EmailSuppression`, unique per lower-cased address): the Resend webhook adds hard bounces (`bounce.type == Permanent`) and spam complaints; replays are no-ops. `service.suppress_email` / `is_suppressed`. Complaints also call `subscriptions.service.unsubscribe_address`.
- **List headers (ADR-0052):** a `newsletter` row (non-transactional) sends `List-Unsubscribe` and `List-Unsubscribe-Post` (one click) built from its `unsubscribeLink` prop (`dispatch._list_headers`). `send_email(headers=)` passes them to Resend or SMTP. `enqueue_email_once(run_at=)` paces a batch.
- **Public-flow outbox** (`OutboundEmail`): `service.enqueue_email(...)` inside the caller's transaction; it also queues an `email.deliver` platform-outbox row (payload: the row id only), and `outbox_handlers.deliver_email` sends it via `dispatch.send_outbound_row`, so the platform outbox (`drain_outbox`) owns retry, backoff and dead-lettering (a dead mail ends `failed` with its content cleared). `OutboundEmail` is the delivery log: status sent/skipped/failed, `props` and `html` cleared once final. `enqueue_email_once` dedupes on `outbound_email.dedupe_key`. Rows queued before N4a (no `email.deliver` row) are still drained by `send_outbound_emails` -> `dispatch.process_outbound_emails`; remove that path once none remain (query in `src/worker/AGENTS.md`). The `email.send` topic (`outbox_handlers.enqueue_email`, used by bookings and webhooks) sends directly and logs an `OutboundEmail` row. `transactional=False` rows are skipped for suppressed addresses; transactional ones (contact notifications) ignore the list. Rendered templates are listed in `dispatch._OUTBOUND_JINJA` (React Email name to Jinja fallback; `subscription-confirm`, `organisation-invitation`). Pre-rendered `html` rows need no template; eRegister observation emails use that (`src/eregister/sends.py`). Props (which hold signed links) are cleared after sending or giving up.
- Routes: `/api/v1/notifications` (list, unread count, mark read, read-all, preferences).

## Invariants
- Never send email synchronously from a request.
- Only a recipient can read or mark their own notifications (another person's → 404).
- Recipient policy and portal URLs come from `config.py` / deploy env.

## Tests
`tests/notifications/test_notifications.py`; suppression: `tests/webhooks/test_suppression.py`; outbox: `tests/notifications/test_email_outbox.py`, `tests/subscriptions/test_subscriptions.py`.

## Related
`src/worker/AGENTS.md`, `packages/email-templates/AGENTS.md`, `docs/api/contracts.md`.

- `email_suppression` stores only `email_hash` for new rows (`email` is a nullable legacy column). `is_suppressed` and `suppress_email` hash the address and also match legacy plaintext rows. The plaintext-removal data migration is a separate, backup-gated step (docs/operations/release-runbook.md).
