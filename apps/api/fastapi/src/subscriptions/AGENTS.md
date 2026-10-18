# subscriptions domain — agent context

**Owner:** Barrels platform. Public mailing-list sign-up with double opt-in, reusable by any Barrels product through a list key (`constants.MAILING_LISTS`, origin in `SUBSCRIPTIONS_SITE_URLS`).

## Tables
`list_subscription` (unique `list_key` + lower-cased `email`; `status` pending/confirmed/unsubscribed; `requested_at`, `confirmed_at`, `unsubscribed_at` are the consent record).

## Flow
- `POST /api/v1/subscriptions` (public, 5/min per IP) always answers 202 with the same message: new, pending, confirmed, unsubscribed and suppressed addresses are indistinguishable. A pending address is not mailed again inside `SUBSCRIPTIONS_RESEND_MINUTES`; an unsubscribed one restarts double opt-in.
- The route verifies Turnstile first (`turnstile_token`, `src.turnstile`); enforced only when `TURNSTILE_ENABLED`, fails closed on a Cloudflare outage. The 400 is generic so it does not reveal list state.
- Confirmation email is queued in the notifications outbox (`transactional=False`, template `subscription-confirm`; React Email in `packages/email-templates`, Jinja fallback `email-templates/build/subscription_confirm.html`).
- `GET /subscriptions/confirm?token=` and `/unsubscribe?token=` verify a signed JWT (`purpose` claim; confirm expires, unsubscribe does not) and 303-redirect to `<site>/subscribe/status?result=...`. Links are GET by design (one click from an email); mail scanners that prefetch can confirm, which is the accepted trade-off.
- Spam complaints (Resend webhook) call `unsubscribe_address`; suppressed addresses never get a row or an email.

## Invariants
- Never reveal whether an address exists. Never send mail from a request. Redirect targets come only from config.
- A new product adds its list in `constants.py` and its origin in `SUBSCRIPTIONS_SITE_URLS`; no schema change.

## Tests
`tests/subscriptions/test_subscriptions.py`, `tests/webhooks/test_suppression.py`.

- Email privacy: `email_hash` (HMAC-SHA256, `src/utils/email_hash.py`, secret `EMAIL_HASH_PEPPER`) is written for every row. Pending and confirmed rows keep the plaintext `email` (needed to send); unsubscribing nulls it and keeps only the hash. Lookups match hash or legacy plaintext. Pending rows older than 30 days are purged by `src/worker/retention.py`.
