# contact domain — agent context

**Owner:** Barrels platform. Public website contact forms for `ContactSite` values: `mbia` and `barrels`.

- `POST /api/v1/contact/messages` (public, 5/min per IP) stores a `contact_message` row, then queues one transactional email through the notifications outbox to the recipient of its `site` (`config.recipient_for`: `MBIA_CONTACT_RECIPIENT` or `BARRELS_CONTACT_RECIPIENT`). `site` defaults to `mbia`. Unset recipient: stored and logged only.
- The email body is built with `html.escape`; visitor text is never rendered as HTML.
- `turnstile_token` is accepted and **not verified**. The seam is `service.verify_turnstile`; enforce there (Cloudflare Siteverify) when keys exist.
- Adding a site: add a `ContactSite` value, its recipient setting in `config.py` and a branch in `recipient_for`. `site` is the source column; no migration is needed.

## Tests
`tests/contact/test_contact.py`.
