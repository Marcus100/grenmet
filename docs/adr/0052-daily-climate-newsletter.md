# ADR-0052: Daily climate newsletter by email (supersedes the newsletter deferral)

## Status

Proposed — 2026-10-28. Built behind a switch that is **off**: `NEWSLETTER_DIGEST_ENABLED`
defaults to false, so the 07:30 job queues nothing until the owner turns it on. Test list
only until then. Supersedes the deferral of newsletters in
`docs/exec-plans/gaa-modular-monolith-implementation.md` and
`docs/exec-plans/product-and-hardening-handoff.md`, which deferred newsletters (and WhatsApp).
The WhatsApp part of that deferral is not changed by this ADR.

## Context

The owner asked for a daily email from the Grenada Meteorological Service (GMS) climate and
weather desk. It carries, on days with news: weather alerts in effect, a short forecast summary
and posts from the desk that the CMS editor has flagged for the newsletter.

Before this ADR the platform already had the parts it needs:

- Resend sending (`src/email.py`) and a React Email template path with a Jinja fallback.
- The subscriptions domain: double opt-in, signed confirm and unsubscribe links, and suppression
  of bounces and complaints from the Resend webhook (`src/subscriptions`, `src/webhooks`).
- The CAP email fan-out (`src/worker/cap_email.py`) and the platform outbox with retries (ADR-0026).

Nothing in that machinery is tracking. The newsletter must not add open or click tracking
(ADR-0045 still applies).

## Decision

1. **A new mailing list** `gms-newsletter` ("GMS climate newsletter") in
   `src/subscriptions/constants.py`, with its own sign-up and consent wording on
   `/climate/newsletter`. Double opt-in applies. The confirmation link expires after
   `SUBSCRIPTIONS_CONFIRM_TTL_DAYS` (7 days); an unconfirmed address is purged after 30 days.
2. **One daily digest at 07:30 Grenada time** (11:30 UTC; Grenada does not observe daylight
   saving), an ARQ cron job `send_daily_newsletter` (`src/worker/newsletter_digest.py`). ARQ is
   the only scheduler, so no new scheduler ADR is needed (ADR-0038).
3. **Content and order:** weather alerts in effect (the public CAP list), then a two-day
   forecast summary (high and low in degrees Celsius), then posts flagged for the newsletter.
   **A day with no alerts and no posts sends nothing.** A forecast alone does not make news.
4. **Hurricane-season mode** is the feature flag `newsletter-hurricane-mode` (`src/feature_flags`,
   off by default, switched by staff). It keeps one forecast line and at most two posts, and
   the digest heading becomes "Hurricane season update". The alert list is unchanged, and alerts
   were already first.
5. **Fan-out** follows the CAP pattern: confirmed and unsuppressed subscribers only, one row per
   (day, subscriber) through the `dedupe_key`, so a repeated run never mails twice, and the
   platform outbox handles retries and dead-lettering. Batches are paced with `run_at`
   (`NEWSLETTER_BATCH_SIZE`, default 50 per `NEWSLETTER_BATCH_INTERVAL_SECONDS`, default 60).
6. **Every mail carries one-click unsubscribe headers** (`List-Unsubscribe` and
   `List-Unsubscribe-Post`, RFC 2369 and RFC 8058). The footer link opens a confirmation page.
7. **Unsubscribing is never a GET.** A mail scanner that opens the emailed link cannot unsubscribe
   anyone. The link redirects (303) to a confirmation page on the API, which names the list and
   posts the change. This applies to every mailing list, not only the newsletter, because the
   old GET-only action was the reason.
8. **Staff test send:** `POST /api/v1/subscriptions/admin/newsletter/test` with the permission
   `newsletter.send_test` (no role grants it by default; superusers pass). It mails one address
   that has confirmed the newsletter, with a notice that it is a test. Any other address gets a
   409, so the test cannot be used to mail someone who has not agreed.
9. **Posts source:** the CMS does not yet have an "include in newsletter" flag. The digest reads
   a JSON feed from `NEWSLETTER_POSTS_FEED_URL` (contract in `src/subscriptions/newsletter.py`).
   Until the CMS adds the flag and the feed, the digest has no posts section.
10. **Email signing secret:** Resend webhook signing (`RESEND_WEBHOOK_SECRET`) must be set in
    staging and production so bounces and complaints suppress addresses. Runbook:
    `docs/operations/integration-readiness.md`. No `.env` file is written by the project.

## Consequences

- Readers can sign up, confirm and stop the list with one click from any mail client.
- The unsubscribe GET no longer changes state for any list. Existing links in mail already sent
  still work: they now show a confirmation page first (one extra click). Signal and Barrels keep
  their sign-up and status pages unchanged.
- The newsletter does not track opens or clicks. It stores the confirmation time and the keyed
  hash of a stopped address as the consent record (`docs/security.md`, retention table).
- Sending needs Resend. Without a sending domain and a working webhook the list still works but
  bounces are not suppressed.

## Not decided (owner action)

- **Grenada marketing-email law.** The repository does not state the rules for commercial or
  informational bulk email in Grenada. Legal review is required before the switch goes on. This ADR
  does not assume that double opt-in meets those rules.
- **Frequency beyond daily,** a second send time, and per-topic choices. Only the daily digest
  exists.
- **Posts flag in the CMS.** The "include in newsletter" checkbox and the feed are a follow-up for
  the web team.
- **Sending from production.** Staging is throwaway; the owner decides when the switch goes on.
- **WhatsApp.** Still deferred.
