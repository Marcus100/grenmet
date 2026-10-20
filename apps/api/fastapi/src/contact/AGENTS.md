# contact domain — agent context

**Owner:** Barrels platform. Public website contact forms for `ContactSite` values: `mbia` and `barrels`.

- `POST /api/v1/contact/public/{site_key}/messages` (public, 5/min per IP) is the contact form of an organisation's public site (`org.public_site`, PF1). 404 when the site is unknown, its organisation is suspended or `accepts_contact` is false. It stores a `contact_message` row (`site` = site key) and queues one transactional email to `site.contact_recipient`, falling back to `config.recipient_for` (environment, `barrels`/`mbia` only). It applies the site's Turnstile policy. Unset recipient: stored and logged only.
- `POST /api/v1/contact/messages` is **deprecated** (body field `site`, default `mbia`). It resolves the same site row when one exists, so recipients and Turnstile follow the site. Callers move to the site route; then delete it.
- `POST /api/v1/contact/data-requests` (public, 5/min per IP) is the GMS climate data request: a structured `contact_data_request` row (organisation, purpose, parameters, stations, period, format, intended use, `consent_at`). Emails `GMS_DATA_REQUEST_RECIPIENT` (unset: stored and logged only) and always queues a plain confirmation to the requester. Consent must be true; a filled honeypot `website` field is dropped silently with the normal 202. Tests: `tests/contact/test_data_request.py`.
- The email body is built with `html.escape`; visitor text is never rendered as HTML.
- Both endpoints call `src.turnstile.require_turnstile` first: with `TURNSTILE_ENABLED` a missing/rejected `turnstile_token` is 400 "Verification failed"; enabled without `TURNSTILE_SECRET_KEY` is 503; a Cloudflare outage fails closed (400). Disabled by default.
- Adding a site: create a public site (`POST /organisations/admin/sites`, `accepts_contact: true`, `contact_recipient`). Do not add `ContactSite` values or environment settings.

## Tests
`tests/contact/test_contact.py`.
