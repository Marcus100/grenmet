# subscriptions domain — agent context

**Owner:** Barrels platform. Public mailing-list sign-up with double opt-in, reusable by any Barrels product through a list key (`constants.MAILING_LISTS`, origin in `SUBSCRIPTIONS_SITE_URLS`).

## Tables
`list_subscription` (unique `list_key` + lower-cased `email`; `status` pending/confirmed/unsubscribed; `requested_at`, `confirmed_at`, `unsubscribed_at` are the consent record).

## Flow
- `POST /api/v1/subscriptions/public/{site_key}` (public, 5/min per IP) subscribes to the list of an organisation's public site (`org.public_site`, PF1, `accepts_subscriptions`). The list key is the site key and the list name is the site name. 404 when the site is unknown, its organisation is suspended or it has no list. The site's Turnstile policy applies. `POST /api/v1/subscriptions` (`list_key` in the body) is **deprecated** and resolves the same site for Turnstile.
- Both always answer 202 with the same message: new, pending, confirmed, unsubscribed and suppressed addresses are indistinguishable. A pending address is not mailed again inside `SUBSCRIPTIONS_RESEND_MINUTES`; an unsubscribed one restarts double opt-in.
- The route verifies Turnstile first (`turnstile_token`, `src.turnstile`); enforced only when `TURNSTILE_ENABLED`, fails closed on a Cloudflare outage. The 400 is generic so it does not reveal list state.
- Confirmation email is queued in the notifications outbox (`transactional=False`, template `subscription-confirm`; React Email in `packages/email-templates`, Jinja fallback `email-templates/build/subscription_confirm.html`).
- `GET /subscriptions/confirm?token=` verifies a signed JWT (`purpose` claim; confirm expires) and 303-redirects to `<site>/subscribe/status?result=...`. A mail scanner that prefetches it can confirm, which is the accepted trade-off.
- Unsubscribe (ADR-0052): `GET /subscriptions/unsubscribe?token=` changes **nothing**; it 303-redirects to `GET /subscriptions/unsubscribe/confirm?token=`, an HTML page naming the list with a button. The button and the one-click mail target is `POST /subscriptions/unsubscribe?token=` (HTML result, 400 for an invalid token). Every list mail carries `List-Unsubscribe` and `List-Unsubscribe-Post` for the newsletter (`src/notifications/dispatch.py`). Pages are in `pages.py` and served by the API, so no product needs its own page.
- Spam complaints (Resend webhook) call `unsubscribe_address`; suppressed addresses never get a row or an email.
- **Climate newsletter (ADR-0052):** list `gms-newsletter` (`constants.py`, origin in `SUBSCRIPTIONS_SITE_URLS`), signed up through the deprecated `POST /subscriptions` as `gms-alerts` is. `newsletter.py` composes the digest (alerts in effect, then a two-day forecast summary, then flagged posts; empty days are skipped; hurricane-season mode from the `newsletter-hurricane-mode` feature flag keeps one forecast line and two posts). The fan-out and 07:30 job live in `src/worker/newsletter_digest.py`, off until `NEWSLETTER_DIGEST_ENABLED`. `POST /subscriptions/admin/newsletter/test` (`newsletter.send_test`) mails one **confirmed** address with a test notice; any other address gets 409. The posts feed is `NEWSLETTER_POSTS_FEED_URL` (contract in `newsletter.py`; the CMS flag is not built yet).

## Invariants
- Never reveal whether an address exists. Never send mail from a request. Redirect targets come only from config.
- A new product creates a public site with `accepts_subscriptions` and `site_url`; no code change. Confirm and unsubscribe redirects use `service.site_url_for` (the site row first, then `SUBSCRIPTIONS_SITE_URLS`). The CAP worker still uses the synchronous environment-only `site_url` (follow-up).
- `gms-alerts` ("GMS weather alerts") is the CAP list: confirmed addresses get one email per published, updated or cancelled alert from the worker (`src/worker/cap_email.py`). The GMS site redirects `/subscribe/status` to `/alerts/get-alerts` with the query kept, where the page shows the result.

## Tests
`tests/subscriptions/test_subscriptions.py`, `tests/webhooks/test_suppression.py`, `tests/subscriptions/test_newsletter.py` (list, safe unsubscribe, test send), `tests/subscriptions/test_newsletter_digest.py` (composition, feed, hurricane mode), `tests/worker/test_newsletter_digest.py` (fan-out, dedupe, pacing, the 07:30 cron).

- Email privacy: `email_hash` (HMAC-SHA256, `src/utils/email_hash.py`, secret `EMAIL_HASH_PEPPER`) is written for every row. Pending and confirmed rows keep the plaintext `email` (needed to send); unsubscribing nulls it and keeps only the hash. Lookups match hash or legacy plaintext. Pending rows older than 30 days are purged by `src/worker/retention.py`.
