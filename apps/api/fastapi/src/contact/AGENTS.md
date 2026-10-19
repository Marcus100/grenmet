# contact domain — agent context

**Owner:** Barrels platform. Public website contact forms for `ContactSite` values: `mbia` and `barrels`.

- `POST /api/v1/contact/messages` (public, 5/min per IP) stores a `contact_message` row, then queues one transactional email through the notifications outbox to the recipient of its `site` (`config.recipient_for`: `MBIA_CONTACT_RECIPIENT` or `BARRELS_CONTACT_RECIPIENT`). `site` defaults to `mbia`. Unset recipient: stored and logged only.
- `POST /api/v1/contact/data-requests` (public, 5/min per IP) is the GMS climate data request: a structured `contact_data_request` row (organisation, purpose, parameters, stations, period, format, intended use, `consent_at`). Emails `GMS_DATA_REQUEST_RECIPIENT` (unset: stored and logged only) and always queues a plain confirmation to the requester. Consent must be true; a filled honeypot `website` field is dropped silently with the normal 202. Tests: `tests/contact/test_data_request.py`.
- The email body is built with `html.escape`; visitor text is never rendered as HTML.
- Both endpoints call `src.turnstile.require_turnstile` first: with `TURNSTILE_ENABLED` a missing/rejected `turnstile_token` is 400 "Verification failed"; enabled without `TURNSTILE_SECRET_KEY` is 503; a Cloudflare outage fails closed (400). Disabled by default.
- Adding a site: add a `ContactSite` value, its recipient setting in `config.py` and a branch in `recipient_for`. `site` is the source column; no migration is needed.

## Tests
`tests/contact/test_contact.py`.
