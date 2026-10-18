# push domain — agent context

**Owner:** Barrels platform. Browser Web Push (VAPID, `pywebpush`) for published CAP alerts. Public, no accounts.

## Tables
`push_subscription` (unique `list_key` + `endpoint`; `p256dh`, `auth`, `created_at`, `last_success_at`, `failure_count`). No personal data is stored.

## Flow
- `GET /api/v1/push/vapid-public-key` returns `enabled` and the key. `POST /api/v1/push/subscriptions` (10/min per IP) upserts a browser; `DELETE` removes it by endpoint. Both answer 503 / no-op safely when keys are unset.
- The endpoint must be https on a known push service (`constants.ALLOWED_ENDPOINT_SUFFIXES`): the worker POSTs to it, so never widen this to arbitrary hosts (SSRF).
- On CAP publish the worker job `publish.push` (`src/worker/cap_push.py`) sends `{title, body, url, tag}` to every `gms-alerts` browser. A 404/410 deletes the subscription; other failures count in `failure_count` (dropped at `WEBPUSH_MAX_FAILURES`) and fail the job so the dispatcher retries only browsers not yet in `job.result["delivered"]`.
- Settings: `WEBPUSH_VAPID_PUBLIC_KEY`, `WEBPUSH_VAPID_PRIVATE_KEY` (secret), `WEBPUSH_CONTACT`. Generate a pair with `python -m src.push.cli generate-vapid` (prints only; never write `.env`).

## Invariants
- Push is a copy of CAP, not a source. Never send from a request; background work stays in the ARQ worker.
- Never log the private key or endpoints.

## Tests
`tests/push/test_push.py`, `tests/worker/test_cap_channels.py`.
