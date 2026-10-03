# notifications domain — agent context

**Owner:** Barrels platform (ADR-0009 core). In-app inbox plus email outbox.

## How it works
- Modules register events in `events.py` (`register`, `register_sweep`) and call `service.notify(...)` **inside their own transaction**.
- Email is delivered later by the ARQ worker from `NotificationDelivery` rows (`send_notification_emails` every 30 s; daily `run_notification_sweeps`).
- Users manage email opt-outs per event; approval events (`email_mutable: false`) cannot be muted.
- Routes: `/api/v1/notifications` (list, unread count, mark read, read-all, preferences).

## Invariants
- Never send email synchronously from a request.
- Only a recipient can read or mark their own notifications (another person's → 404).
- Recipient policy and portal URLs come from `config.py` / deploy env.

## Tests
`tests/notifications/test_notifications.py`.

## Related
`src/worker/AGENTS.md`, `packages/email-templates/AGENTS.md`, `docs/api/contracts.md`.
