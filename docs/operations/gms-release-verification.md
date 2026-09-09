# GMS/core release candidate verification

Candidate checkout: /tmp/gms-core-release.
Release branch: release/gms-core-20260909 (baseline 2b3cd3c5).
Combined branch: integration/dev-gms-core-20260909, incorporating local dev
through c3e6682c. The original /workspace worktree remains untouched.
Local merge work is included; no pushes, remote merges or deployments occurred.

## Local commit inventory

- e36be9d9: core security, dependencies and migration-runtime fixes.
- 9766520c: core release scope, gates and environment isolation.
- 4d878f16: narrowed build inputs and measurement requirements.
- 2758f233: authored GMS products, grade policies, contracts and integrations.
- fdb33327: public proxy logout origin.
- cb9f533c: bounded GMS/admin test workers.
- 91525fb3: integration merge of local dev and the missing linked routes.

The integration preserves all seven additional local dev commits for the admin
home dashboard, HR forms/navigation, date controls and WXWatch gallery. The only
textual conflict was the date popover width: both branches shared the trigger
fix, and dev's Base UI --anchor-width correction was retained.

The source audit also found nine uncommitted files needed by linked destinations.
Climate, Resources, IT support, HR Reports, the existing mock settlement
transaction view, their shared OperationsHub, the legacy redirect and HR links
are included. The mock transaction view remains explicitly labeled.
Original SURFACE edits and the .turbo/config.json deletion remain excluded.
No environment files or credentials were added.

## Implemented scope

Core security/dependency and migration-runtime fixes; explicit core image scope
and deployment gates; narrowed application Docker build inputs; authored GMS
products and public snapshots; per-product authorization using ingested GMS grades;
admin proxy logout; CAP/feed, Sentry, PostHog, Stripe, email and storage deployment
configuration. Provider credentials belong in separate GitHub staging and
production environments, as listed in ../env.md.

CAP authorization and publication remain independent of authored products.
SURFACE, wis2box, WXWatch deployment, GMS ingest deployment and GeoNetCast remain
excluded. Collector compatibility was tested; collectors were not deployed.

## Recorded checks

- pnpm fix: passed, 27 warnings, no errors.
- pnpm type-check: 16/16 tasks passed after review corrections.
- GMS tests: 139 passed, 15.94 seconds.
- Combined pnpm test: 11/11 tasks passed, 2m40.873s, 10 cached tasks;
  admin 262 tests across 46 files passed in 158.18 seconds.
- FastAPI full suite: 308 passed, 737.64 seconds, isolated test database.
- Grade-policy and worker review regression: 15 passed, 86.46 seconds.
- WXWatch compatibility: 38 passed, 11.34 seconds.
- GMS ingest compatibility: 25 tests and 8 subtests passed, 40.17 seconds.
- Fresh/existing/repeated wxproducts migration integration: 2 passed,
  52.88 seconds; existing records preserved.
- Delivery tests: 57 passed, 2 skipped.
- Final full guardrail suite: 49 passed, 21.02 seconds.
- Final environment and release-scope regression: 8 passed, 8.17 seconds.
- API client regenerated through repository command; pnpm check:drift passed.
- Documentation links and portfolio checks passed; changed workflows passed actionlint
  with the existing self-hosted labels supplied through temporary linter configuration.
- Local GMS build passed before integration; merged admin production build
  passed with all route destinations, compiling in 81 seconds. This is a local
  Next build, not a Docker image benchmark or browser acceptance result.

Test logs are under /tmp/gms-*.log. These are local candidate checks, not evidence
that any remote deployment or provider delivery succeeded.

## Review corrections

Staging Sentry selection no longer falls through to the production key when its
key is missing. Environment selection covers staging calls without a tag.
A regression exercises the actual workflow expressions across staging and
production inputs. Product previews now flow continuously instead of estimating
pages from character counts, which clipped newline-heavy text. Browser print
pagination remains to be verified. Grade policy validation uses a domain error
and logs audited policy changes; API error documentation was regenerated.

## Measurement limits and remaining acceptance

Dependency installation reused 1,283 packages and took 28.3 seconds. This is not
a cold/warm image comparison. Docker daemon access is denied in this environment;
no candidate image scan, image smoke test or controlled build-cache timing was
performed. Installation, compilation, image load/export, scan, registry/cache
export, pull, migration and readiness timings must be collected separately on a
consistent Docker-capable runner for cold, warm, GMS-only and shared-change builds.
No speedup claim is made.

Chrome downloaded successfully but cannot launch due to missing system
libraries. Its dependency installer cannot invoke sudo here; package downloads
also fail because the container has no package index. Requested browser widths,
all 13 previews, representative printed PDFs and full publication browser flows
remain outstanding.

The user will add provider credentials to GitHub environment secrets when needed.
Unconfigured optional integrations remain disabled. Production additionally
needs its new database credentials and core infrastructure variables. No live
provider transaction or authenticated staging publication test has been performed.

Remaining release work: complete browser/PDF and image acceptance; run dev
and promotion CI on their exact SHAs; promote through the staging PR and verify
deployed revisions, migrations, grade access, publication transitions and logout.
Do not promote production or bypass image/security gates.

## Full-suite timeout correction

The first normal pnpm test run hit the existing five-second timeout in two
product-desk tests while four admin workers ran alongside GMS. Focused runs with
two workers passed. Both suites now cap workers at two; timeout values,
assertions and isolation are unchanged. The normal full test command then passed
all 11 tasks. It also passed after combining local dev and the missing routes.

Regenerating the API client after commit hooks produced identical content and
cleared the mtime-based drift check; no generated code was manually edited.

## User-managed dev push

The original dev worktree is intentionally unchanged and can still show dirty
copies of changes now preserved on the integration branch. Push from the clean
integration checkout, not from that older branch:

```sh
git -C /tmp/gms-core-release push origin HEAD:dev
```

Use the normal hooks and do not force-push. A concurrent remote update must be
integrated and revalidated first. Passing local checks authorizes a dev CI
checkpoint; it does not complete staging acceptance or authorize production.
