# feature_flags domain — agent context

**Owner:** Barrels platform (ADR-0020, slice PF7). Runtime switches with a recorded success metric. Not a GAA/GMS module.

- Table `flags.feature_flag` in the main database (`flags` is in `_TRACKED_SCHEMAS`): immutable kebab-case `key`, `description`, `enabled` (default off), `exposed` (client-visible), `audience` JSONB validated by `FeatureFlagAudience`, `success_metric`, `owner`, `expires_at`, `review_by`.
- **Audience (`rules.py`, pure):** `environments` allowlist gates everything (empty = any); then any of `everyone`, `organisation_ids`, `user_ids`, `percentage` includes the subject. Empty audience includes nobody. Percentage buckets `sha256("<flag key>:<subject>")` mod 100 by user when known, else organisation, so a rollout only grows as the percentage rises. Changing the hash reshuffles live rollouts; the pinned test guards it.
- **Evaluation (`service.is_enabled(session, key, organisation_id=, user_id=)`):** unknown flag is off. All flags load into one in-process snapshot cached 30 s (like `organisations.verification`); admin routes call `clear_cache()` after commit, other workers catch up within the TTL. A flag past `expires_at` evaluates off; past `review_by` it only appears in the stale list.
- **Rules of writes:** enabling outside `ENVIRONMENT=local` needs a non-blank `success_metric` (422, on create and PATCH, including clearing the metric while enabled). Services flush; routers commit then clear the cache. Every write is audited under `feature_flag` (readable with `feature_flags.manage`).
- **Routes (`/feature-flags`):** `admin` zone (superuser plus `feature_flags.manage`): `GET/POST /admin`, `GET /admin/stale`, `GET/PATCH/DELETE /admin/{flag_id}`. `GET /public/evaluate?keys=a,b` (no auth, max 20 kebab-case keys else 422, `limiter` 600/minute per IP because server-side callers such as Vercel share egress IPs; callers must cache the response (Next `revalidate` ~60 s), not call per visitor, and treat 429 or any error as flag off, i.e. fail closed; `Cache-Control: public, max-age=30`): exposed flags only, anonymous subject so only environment and `everyone` rules can be on; unknown and non-exposed keys are absent (never revealed); reuses `service.evaluate_public` over the shared snapshot. `GET /org/evaluate` (`OrgMember`) and `GET /me/evaluate` (`AccountUser`) return `{flags: {key: bool}}` for **exposed flags only**; internal flags never leak.
- **Gating routes:** `dependencies.require_flag(key)` (no subject) and `require_org_flag(key)` (organisation and user; resolves membership first). Both answer 404 when off. Document the 404 in the route's `responses`.
- Evaluation is never logged with subject ids; no analytics are stored (no evaluation counts).

## Tests
`tests/feature_flags/`: `test_rules.py` (rules, bucketing stability and distribution), `test_flags.py` (CRUD, success-metric rule, stale list, expiry, cache, exposed-only, public anonymous evaluation and key validation, cross-organisation isolation, permission denial, audit, `require_flag`), `test_migration.py`.

## Related
ADR-0020, ADR-0025, `src/organisations/AGENTS.md`, `docs/exec-plans/barrels-foundations-plan.md` (PF7).
