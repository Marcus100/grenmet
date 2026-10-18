# contact domain — agent context

**Owner:** Barrels platform. Public website contact forms (currently MBIA only; `ContactSite`).

- `POST /api/v1/contact/messages` (public, 5/min per IP) stores a `contact_message` row, then queues one transactional email through the notifications outbox to `MBIA_CONTACT_RECIPIENT`. Unset recipient: stored and logged only.
- The email body is built with `html.escape`; visitor text is never rendered as HTML.
- `turnstile_token` is accepted and **not verified**. The seam is `service.verify_turnstile`; enforce there (Cloudflare Siteverify) when keys exist.
- Adding a site: add a `ContactSite` value and its recipient setting in `config.py`.

## Tests
`tests/contact/test_contact.py`.
