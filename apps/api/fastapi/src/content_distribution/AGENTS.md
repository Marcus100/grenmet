# content_distribution domain — agent context

**Owner:** Barrels platform (GMS editorial tools). Social posting for CMS posts:
Facebook Page and Instagram through the platform outbox, WhatsApp Channel as a
stored caption for an editor to copy. **Live posting exists but is off**: it runs
only when the feature flag `social-live-posting` is on AND the Meta settings and
token are present. Otherwise the worker records a dry run and says why. The owner's
checklist for going live is `docs/operations/social-live-posting.md`.

## Tables
`content_distribution_delivery`: one row per post and platform. `dedupe_key` is
`cms:<collection>:<slug>:<platform>` (unique). Stored `status` is `pending`,
`scheduled`, `dry_run_sent`, `posted`, `skipped` or `dead`. `failed` is never
stored: it is shown while the platform outbox retries a scheduled row
(`service.display_status`). `external_id` is the Meta post id (`posted`) or
`dry-run:<id>`. `reason` says why a row was a dry run or skipped. `error` says why
a row is `dead` (or failed while retrying). `publish_started_at` is the in-flight
marker (see "At most once"). `payload` holds the copy and link. It is public
content.

## Routes
- `POST /api/v1/content-distribution/internal/posts` (CMS hook, `X-CMS-Secret`
  header, compared in constant time with `CMS_DISTRIBUTION_SECRET`). 503 when the
  secret is unset or shorter than 32 characters; 401 when it is wrong. Body in
  camelCase: `collection`, `slug`, `url`, `title`, `summary`, `captions`
  (`facebook`, `instagram`, `whatsapp`), `platforms`, `publishAt`, `imageUrl`.
  Answers 202 with one outcome per platform (`created`, `updated`, `unchanged`).
  This route is machine-authenticated, like the wxwatch ingest route, so it has no
  `require_permission`.
- `GET /api/v1/content-distribution/admin/posts` (staff, permission
  `cms.article.social.manage`): per-platform status, `external_id`, `reason`,
  `error`, newest first, with `slug` and `collection` filters and the usual
  pagination. No web app reads it yet; the staff list is this endpoint.

## Rules (refused with 422 unless noted)
- **No official warnings through social.** A post whose collection is in
  `WARNING_COLLECTIONS` or whose link path is under `/alerts`, `/warnings` or
  `/cap` is refused. CAP, the site and approved channels stay primary.
- Instagram needs `imageUrl`. Every requested platform needs its own caption.
  (A stored Instagram row with no image is still skipped by the handler, with the
  reason, as a backstop.)
- Duplicate platforms and non-HTTPS links are refused by the schema.
- The link (`url`) and the image (`imageUrl`) must be on an approved host: the hostnames
  in `SOCIAL_LINK_HOSTS` and `SOCIAL_IMAGE_HOSTS`. Otherwise 422 (`SocialHostNotAllowed`,
  the message names the host). The lists are empty by default, which refuses every post
  until the owner sets them. The CMS sends posts through this route, so an unset list
  shows as a CMS report, not a publishing failure.
- A slug is `/`-separated segments (`stories/2026/10/title`), each lowercase
  letters, digits and hyphens. No empty segment, no leading or trailing slash, max
  200 characters. The longest dedupe key (`cms:` + 60-character collection + slug
  + `:whatsapp`) fits the 300-character column; a test pins this.
- `publishAt` null or missing means now (UTC): the row is due at the next release.
- No hazard-word filter: the owner removed it. Do not re-add one here.
- WhatsApp rows are stored and never released. Editors copy the caption by hand
  (`automated: false` in the staff list).

## Flow
1. **Intake:** the upsert is idempotent per dedupe key. A `pending` row takes all
   changes. A `scheduled` row takes new copy but keeps its time. A row that is
   `dry_run_sent`, `posted`, `skipped` or `dead` is never changed, so a re-save
   never reposts.
2. **Release (worker, every minute, second 0):** `release_social_posts` queues due
   automated rows on the platform outbox as `social.post.<platform>` with
   dedupe key = the row's dedupe key, and marks them `scheduled`.
3. **Post (outbox handler, `outbox_handlers.py` → `service.post_delivery`):**
   re-reads the row and does nothing unless it is still `scheduled`. Then, in order:
   - a row with `publish_started_at` set and no `external_id` is an earlier attempt
     whose answer was lost: it goes `dead` with `ERROR_OUTCOME_UNKNOWN`, unsent;
   - an Instagram row with no image goes `skipped` (`REASON_NO_IMAGE`);
   - if the flag `social-live-posting` is off (`flags` audience, see below) or the
     platform's settings or token are missing, it goes `dry_run_sent` with
     `external_id` = `dry-run:<id>` and `reason` = `REASON_FLAG_OFF` or
     `REASON_NOT_CONFIGURED`;
   - otherwise `_publish_live` sends it through `meta_graph.py` and records the answer.
4. **Give up:** after 5 attempts the outbox runs `dead_letter`, which marks the row
   `dead` with the error text for the editor (the Meta message when there is one).

### Live answers (`meta_graph.py`)
- Success: `posted`, `external_id` = the Meta id (a photo post's `post_id`, else the
  feed or media id). Handler returns normally, so the outbox row is `done`.
- `GraphRejected` (a 4xx other than a rate limit): `dead`, `error` = Meta's code and
  message with the token redacted. Never retried.
- `GraphRetryable` (connection never opened, 429 or a rate-limit code after the
  client's own retries, or a 5xx on a non-publish call after its retries; or an
  Instagram container not ready): the handler clears
  `publish_started_at`, stores `error`, commits and raises, so the outbox retries
  with backoff. Nothing was published.
- `GraphOutcomeUnknown` (a publish request was sent and no usable answer came back,
  including a **5xx on the publish call itself, which is not retried**, or a 2xx without
  an id): `dead` with `ERROR_OUTCOME_UNKNOWN`, logged at error level
  so it reaches Sentry. Never sent again. A person checks the page.

### At most once
The handler commits `publish_started_at` and pushes its outbox row's
`next_attempt_at` 10 minutes ahead (`IN_FLIGHT_LEASE`) before the Meta call. The
commit releases the outbox row lock, so the lease stops a second worker taking the
row mid-call. A crash or lost answer after that point leaves the marker set, and the
retry gives the row up instead of sending it again. Only a Meta answer that clearly
did not publish (retryable) clears the marker.

A 5xx on a publish call is not retried, in the call or by the outbox: Meta may have
accepted the post before failing, so it is an unknown outcome for the editor to check.
Meta's 429 and rate-limit codes (4, 17, 32, 613) are answered before anything is
created, so those are retried. A 5xx on a non-publish call (container creation or
status reads) is retried, since nothing is published by those calls.

The outbox (ADR-0026) gives at-least-once delivery. Handlers are idempotent by the
row status and the marker above. `check_outbox_backlog` watches the platform outbox.
A give-up written by a handler (`skipped`, `dead` from an answer) returns normally,
so it does **not** increment the outbox dead-letter metric; the staff list and the
error log are the signals for those.

### Feature flag (the one live switch)
`SOCIAL_LIVE_FLAG` = `social-live-posting`, read through `src/feature_flags`. It is
off unless a flag row exists, is enabled and its audience includes the environment
(the `environments` allowlist gives the staging-first rollout). Enabling it outside
`ENVIRONMENT=local` needs a success metric (feature flag rules). Evaluation is cached
for 30 seconds in each worker.

## Config and secrets
- `content_distribution/config.py`: `CMS_DISTRIBUTION_SECRET`,
  `SOCIAL_TOKEN_ENCRYPTION_KEYS` (Fernet keys, validated), and the Meta settings:
  `META_GRAPH_API_VERSION` (pinned, default `v24.0`, checked against
  `^v\d{1,2}\.\d{1,2}$`), `META_PAGE_ID` and `META_INSTAGRAM_ACCOUNT_ID` (numbers
  only, because they become URL path segments), `META_PAGE_ACCESS_TOKEN` (a
  `SecretStr`). `platform_credentials(platform)` returns what a live post needs, or
  None. The token is stripped of surrounding whitespace first, and a value that is not
  one unbroken run of token characters (`TOKEN_PATTERN`) is treated as unset with the
  reason `REASON_TOKEN_MALFORMED`, which never shows the value. `SOCIAL_LINK_HOSTS` and
  `SOCIAL_IMAGE_HOSTS` (comma-separated hostnames, empty refuses every post) are the
  approved hosts checked at intake. The API container (not the worker) receives them.
- A Meta-returned Instagram container id must be digits only (`CONTAINER_ID_PATTERN`):
  it becomes a URL path segment in the next call. Anything else is refused.
- The Graph host is a constant (`graph.facebook.com`), never configuration, so the
  token can only go to Meta. The token is sent in the `Authorization` header, never
  in a URL. Nothing logs ids, captions, titles, links or response bodies; logs carry
  the platform and delivery id only.
- Deploy: `META_PAGE_ID` and `META_INSTAGRAM_ACCOUNT_ID` are GitHub environment
  variables, `META_PAGE_ACCESS_TOKEN` a secret. `render-env.py` passes them through,
  and refuses non-numeric ids before deploy, so a bad value cannot crash the worker
  at import. The worker is the only container that receives them.
- `tokens.py` seals and opens platform tokens with `src/utils/secret_box.py`. Not
  used by live posting, which reads the token from the environment.

## Known limits
- Meta's documentation specifies **JPEG** images for Instagram containers. A PNG
  URL is expected to be refused, and the row is then `dead` with Meta's reason.
  The intake does not check the format; check the first live post.
- A photo post on Facebook cannot carry a clickable link, so the link is written into
  the text.
- Live posting has not been run against Meta. Every Graph path and field name is
  covered by mocked tests only; the first real run is staging, with the owner's
  Meta app and token.

## Tests
- `tests/content_distribution/test_content_distribution.py`: intake, rules, release,
  the dry-run handler, the staff view's shape and the CMS body contract.
- `tests/content_distribution/test_live_posting.py`: the flag and credential switch,
  each publish path, Instagram skip, retries, rejections, the lost-answer and crash
  cases (never sent twice), the token never in logs, stored reasons or URLs, and the
  staff list. Real intake, release, outbox and database; Meta answered by an
  `httpx.MockTransport`.
- `tests/content_distribution/test_meta_graph.py`: the client's outcomes, retries,
  Retry-After, redaction and request shape, transport-level.
- `tests/content_distribution/test_config_and_tokens.py`: settings, validation,
  per-platform credentials and sealing.
