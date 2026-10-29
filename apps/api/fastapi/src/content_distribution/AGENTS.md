# content_distribution domain — agent context

**Owner:** Barrels platform (GMS editorial tools). Social posting for CMS posts:
Facebook Page and Instagram through the platform outbox, WhatsApp Channel as a
stored caption for an editor to copy. **Dry run only** until the owner adds Meta
accounts and tokens. No real network call exists in this domain yet.

## Tables
`content_distribution_delivery`: one row per post and platform. `dedupe_key` is
`cms:<collection>:<slug>:<platform>` (unique). Stored `status` is `pending`,
`scheduled`, `dry_run_sent` or `dead`. `failed` is never stored: it is shown while
the platform outbox retries a scheduled row (`service.display_status`). `payload`
holds the copy and link that were (or would be) posted. It is public content.

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
  `cms.article.social.manage`): per-platform status and error, newest first, with
  `slug` and `collection` filters and the usual pagination.

## Rules (refused with 422 unless noted)
- **No official warnings through social.** A post whose collection is in
  `WARNING_COLLECTIONS` or whose link path is under `/alerts`, `/warnings` or
  `/cap` is refused. CAP, the site and approved channels stay primary.
- Instagram needs `imageUrl`. Every requested platform needs its own caption.
- Duplicate platforms and non-HTTPS links are refused by the schema.
- No hazard-word filter: the owner removed it. Do not re-add one here.
- WhatsApp rows are stored and never released. Editors copy the caption by hand
  (`automated: false` in the staff list).

## Flow
1. **Intake:** the upsert is idempotent per dedupe key. A `pending` row takes all
   changes. A `scheduled` row takes new copy but keeps its time. A `dry_run_sent`
   or `dead` row is never changed, so a re-save never reposts.
2. **Release (worker, every minute, second 0):** `release_social_posts` queues due
   automated rows on the platform outbox as `social.post.<platform>` with
   dedupe key = the row's dedupe key, and marks them `scheduled`.
3. **Post (outbox handler, `outbox_handlers.py`):** `post_delivery` re-reads the
   row and does nothing unless it is still `scheduled`. `publish` records a dry
   run (`external_id` = `dry-run:<id>`) and marks it `dry_run_sent`. With
   `SOCIAL_POSTING_LIVE=true`, `publish` raises `SocialPostingNotConfigured`, so the
   outbox retries and then gives up.
4. **Give up:** after 5 attempts the outbox runs `dead_letter`, which marks the row
   `dead` with the error text for the editor.

The outbox (ADR-0026) gives at-least-once delivery. Handlers are idempotent by the
row status check above. `check_outbox_backlog` already watches the platform
outbox, so a stuck social topic is visible without a new check.

## Config and secrets
- `content_distribution/config.py`: `CMS_DISTRIBUTION_SECRET`, `SOCIAL_POSTING_LIVE`
  (default false), `SOCIAL_TOKEN_ENCRYPTION_KEYS` (Fernet keys, validated).
- `tokens.py` seals and opens platform tokens with `src/utils/secret_box.py`. No
  token is stored yet. Live posting must not start without the owner's accounts.

## Tests
`tests/content_distribution/test_content_distribution.py` (intake, rules, release,
dry-run and live-refusal handlers, staff view) and
`tests/content_distribution/test_config_and_tokens.py` (settings and sealing).
