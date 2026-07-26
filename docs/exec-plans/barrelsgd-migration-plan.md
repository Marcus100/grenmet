# Barrels Grenada Migration Plan

**Status:** Proposed — not yet started
**Recorded:** 2026-07-25
**Owner:** Repository maintainers
**Companion documents:**
[Barrels Grenada Platform Transition](barrelsgd-transition.md) (target
architecture),
[Barrels Grenada Product Strategy](../strategy/barrels-product-strategy.md)
(five-year direction)

## Purpose

This is the execution plan for turning the current `grenmet-monorepo` into the
Barrels Grenada monorepo. It sits above the transition document: the transition
document describes *what the destination looks like*, this document describes
*the order in which we get there, what must be true before each step, and what
stops the work*.

It covers four phases:

1. Freeze a verified baseline on `dev`.
2. Land the current 94-path working tree as eight reviewable commits and promote
   that baseline to `main`.
3. Execute the Barrels transition boundaries against fresh Barrels staging.
4. Cut over production DNS and retire legacy infrastructure.

This document authorizes nothing on its own. Commits, pushes, deployments, DNS
changes, secret creation, the GitHub repository rename, and resource deletion
each remain separately authorized human actions.

## Confirmed premises

These were decided on 2026-07-25 and override anything that contradicts them in
the transition document.

| Premise | Decision |
| --- | --- |
| Existing application data | No production users, rows, or sessions require migration. Fresh databases, one bootstrap owner, sessions intentionally reset. |
| `barrels.gd` DNS | Fully under our control. Staging and production records can be created as soon as infrastructure exists. |
| `apps/web/dowden`, `apps/web/gdbank` | Out of scope. Both are empty untracked directories; they move to their own repository and are never given Barrels package, port, host, or image identity here. |
| `apps/web/shop` | In the Barrels portfolio as **Barrels Shop** (ecommerce). Identity is reserved now; the product is built after the migration as its own initiative. |
| Python and ops workspaces | Same classification rule as TypeScript: rename identifiers that claim company or infrastructure ownership, keep GrenMet/GMS product names. Vendored `surface/` and `wis2box/` are not renamed. |
| Fresh staging timing | Provisioned early, in parallel with the code boundaries, so each boundary is validated against real infrastructure as it lands. |
| Canonical domain | Everything moves to `barrels.gd`. GrenMet is one product within Barrels, not the owner of the platform. |
| `weather.gd` | In acquisition, not yet controlled. GrenMet goes live on `weather.barrels.gd`; `weather.gd` later masks it as the public GMS face. |
| `apps/api/honoapi` | A health-endpoint stub intended as a future weather-data proxy. Identity reserved, implementation deferred. |
| SURFACE and wis2box | Operationally separate host and lifecycle; integrated by data contract through FastAPI. Never touched by platform deploys or infrastructure teardown. |
| Barrels HR | One multi-tenant HR product. GMS, MBIA, GAA, and future clients are tenants of a single codebase and deployment, with data scoped by organization. Future work, direction recorded now. |
| Execution model | One numbered boundary per session, checked and reported, then stopped for human review and commit. |

### Reserved identities added by this plan

Barrels Shop is reserved but not built. Allocating it now means the port map,
image list, DNS map, and Sentry project list never have to be re-cut later.

| Application | Package | Port | Production host | Image |
| --- | --- | ---: | --- | --- |
| Barrels Shop | `@barrelsgd/web-shop` | 3008 | `shop.barrels.gd` | `ghcr.io/marcus100/barrelsgd-web-shop` |
| Weather-data proxy (HonoAPI) | `@barrelsgd/api-hono` | 4000 | `proxy.barrels.gd` | `ghcr.io/marcus100/barrelsgd-api-hono` |

Port 3008 follows 3007 (GAA) in the `3000–3099` Next.js tier defined by
[docs/ports.md](../ports.md); 4000 is HonoAPI's existing allocation in the Node
API tier.

Reserving an identity means the name is spoken for in the port map, image list,
and DNS map so nothing needs re-cutting later. It creates no DNS record, image
build, Compose service, Traefik route, or Sentry project. Neither Shop nor the
proxy is built during this migration.

`apps/api/honoapi` today serves only `GET /health`, is consumed by no
application, and is not started by `pnpm start`. It keeps its workspace and gets
the scope rename in boundary 2; it does not get a deployment. Its
`.env.staging.example` and `.env.production.example` files stay, since baseline
commit 6 already aligns them.

### Documents this supersedes

[docs/weather-gd-golive.md](../weather-gd-golive.md) records a 2026-07-11
coexistence decision that predates the Barrels company decision. It assigns
`api.weather.gd` as the canonical public API host and `hurricane.weather.gd` to
the standalone Hurricane Plan app. Both are now wrong: `api.barrels.gd` is
canonical, and Hurricane Plan folds into GrenMet `/sops`. Its still-correct
content is the cookie constraint — authenticated surfaces cannot span
registrable domains, so `/admin`, `/signin`, and `/auth/*` stay canonical on
`*.barrels.gd` even after `weather.gd` arrives. That constraint is already
reflected in the transition document's GrenMet host behavior section.

### Execution model

Work runs one numbered boundary per session. Each session implements a single
boundary, runs `pnpm fix`, `pnpm type-check`, its focused tests, and the
Blast-Radius Gate, then stops and reports. The human reviews and commits. No
session touches files outside its boundary's approved set; a boundary that
cannot be landed without doing so is reported, not widened.

## Phase 1 — Freeze the baseline

The current `dev` branch is the source baseline: 8 commits ahead of `origin/dev`
and 0 behind, with `origin/dev` and `origin/staging` pointing at identical trees.
Nothing in the transition may start until this baseline is green and promoted.

### Rebuild and verify

1. Stop the running stack, then run `pnpm start` from the host. `prestart`, the
   API, Redis, and the worker must all reach a healthy state. Web apps run on the
   host; infrastructure and FastAPI run in Docker.
2. Run the full FastAPI suite inside the rebuilt container against `app_test`.
3. Run the WxWatch and Sutron suites.

**Verified 2026-07-25.** All three counts confirmed against the working tree.

| Suite | Expected | Actual | Also run |
| --- | ---: | ---: | --- |
| FastAPI (`app_test`) | 262 passing | 262 passing (8:53) | Ruff, mypy |
| WxWatch (`scripts/scrapy-wxwatch`) | 27 passing | 27 passing | Ruff, mypy |
| Sutron (`scripts/sutron-collector`) | 8 passing | 8 passing | Ruff, strict mypy |

If `app_test` does not exist, create it once as the `postgres` superuser — the
`app` role lacks `CREATEDB`.

#### The FastAPI baseline must be taken in-container

Step 2 says "inside the rebuilt container" and that is a hard requirement, not a
preference. Running the suite from the devcontainer against
`host.docker.internal` puts a network hop on every database and Redis call: the
same 262 tests take 20–27 minutes instead of ~9, and the added latency produces
**non-deterministic failures**. Two such runs on this identical tree gave
disjoint failure sets — `TimeoutError` in `test_cap_pagination`,
`test_profile`, and `test_dispatch` in one; assertion failures in `test_login`,
`test_workflow`, and `test_shift_catalog` in the other. All six pass in
isolation. None are real.

The command, run from a host terminal (Docker is not reachable from the
devcontainer):

```bash
docker compose -p grenmet-api --env-file .env.local -f docker-compose.yml \
  exec api uv run --frozen --package fast-back pytest
```

Treat a red FastAPI run from the devcontainer as unproven, not as a failure.
Re-run it in-container before investigating anything.

Note for Phase 3: the `-p grenmet-api` project name appears here and in
`docs/api/testing.md`. Renaming it orphans local volumes — see the Compose
project trap.

#### Finding: the worker does not restart (2026-07-25)

At baseline verification the `worker` container was found `Exited (1)`, dead for
19 hours after running healthy for one. Cause: `redis.exceptions.TimeoutError`
raised inside arq's cron heartbeat (`worker.py heart_beat → run_cron →
enqueue_job → pipe.watch`). No application code appears in the traceback and
`tests/worker/test_dispatch.py` passes 9/9, so this is not a code regression —
most likely a WSL2/Docker Desktop suspend stalling the connection.

The durable defect is that `worker` is declared `restart: "no"` while `api` and
`redis` are `restart: unless-stopped`. Any transient Redis blip kills the worker
permanently, and `docker compose ps` hides exited containers, so it fails
silently. Proposed fix: `restart: unless-stopped`, landed in commit 6. Not yet
applied — `docker-compose.yml` is outside the approved edit set.

Consequence for verification: `docker compose ps` is not sufficient to confirm
worker health. Use `ps -a` and check for `Exited`.

### Standing constraints for the baseline

- Sutron stays a tested, experimental Phase 1 collector. No ingestion, spooling,
  deployment, scheduling, or hardware work is in scope.
- WxWatch stays automation-ready but unscheduled. Scheduling waits until its
  production database, object storage, secrets, alerting, and operational
  ownership are validated.

## Phase 2 — Land the working tree as eight commits

Agents must not commit or push. The mapping below is derived from the actual
working tree so an authorized human can stage each boundary precisely. Files
marked *mixed* contain hunks belonging to more than one boundary and need
hunk-level staging (`git add -p`).

Each commit must leave the workspace runnable. Run `pnpm fix` then
`pnpm type-check` before each, and the relevant focused suite where the boundary
touches testable code.

**Lesson from execution (2026-07-25).** Commit 2's boundary was under-specified.
The `uv run` → `uv run --frozen --package fast-back` change reached far more
files than the plan enumerated — `README.md`, `AGENTS.md`, `CLAUDE.md`,
`docs/api/development.md`, `docs/api/testing.md`, `docs/troubleshooting.md`, and
`tests/billing/test_billing.py` all carry it, and in most of them it is
interleaved with content belonging to other boundaries. Because commit 2 lands
early and seals quickly, later commits inherit orphaned fragments of it.

Two consequences, both applied above: files dominated by a later boundary are
staged whole into that boundary rather than split retroactively, and the
governing rule is **split only when a piece is both cleanly separable and an
independently revertable decision**.

Operational note: run interactive commands such as `git add -p` **alone**, never
pasted with following lines. `git add -p` reads its answers from stdin, so any
text after it in the paste buffer is consumed as hunk answers. This silently
staged commit 6 content into commit 2 on the first attempt and required a
`git reset --soft`.

### 1. `chore(sutron): preserve phase-one collector snapshot`

New collector only: `scripts/sutron-collector/` (source, fixture, README,
`pyproject.toml`, and its 8 tests).

### 2. `chore(python): centralize uv workspace on Python 3.13`

Add the root `pyproject.toml`, `.python-version`, and `uv.lock`. Remove the
member lockfiles and version files: `apps/api/fastapi/.python-version`,
`apps/api/fastapi/uv.lock`, `geonetcast/uv.lock`, `notebooks/.python-version`,
`notebooks/uv.lock`, `scripts/scrapy-wxwatch/.python-version`,
`scripts/scrapy-wxwatch/uv.lock`.

Update the toolchain surface: `apps/api/fastapi/pyproject.toml`, `Dockerfile`,
`Dockerfile.prod`, the two new `*.dockerignore` files, `docker-compose.yml`, and
`scripts/{dev,format,lint,prestart}.sh`; plus `.github/workflows/ci-api.yml`,
`.github/workflows/build-api-image.yml`, `.github/dependabot.yml`, and
`.github/labeler.yml`.

Include the Python 3.13 typing adjustments and workspace command callsites:
`apps/api/fastapi/src/worker/main.py`, `scripts/import_roster.py`,
`scripts/seed_hr_leave_demo.py`, `tests/conftest.py`, `tests/cap/conftest.py`,
`tests/hr/test_exchange_service.py`, `tests/worker/test_dispatch.py`,
`scripts/wis2-setup/seed-surface-obs.py`, and `notebooks/README.md`.

Declare Sentry as `>=2.64.0,<3.0.0`; the lock stays at 2.66.0.

**Corrected 2026-07-25 after reading the diffs.** The "stage only the
Python-workspace hunks" instruction was wrong for three of the four files:

- `.github/workflows/pipeline-staging.yml` is **not mixed**. Its single hunk adds
  `pyproject.toml`, `uv.lock`, and the member `pyproject.toml` paths to the API
  change-filter so CI rebuilds the API when the shared lock moves. Stage whole.
- `docs/api/development.md` and `docs/api/testing.md` are **not separable at hunk
  granularity**. The compose-invocation fix (`-p grenmet-api --env-file
  .env.local -f docker-compose.yml`) and the workspace command form (`--frozen
  --package fast-back`) occur on the *same lines*. They are also the same change:
  this commit moves the Docker build context from `.` to the repo root and
  remaps every volume to `/app/apps/api/fastapi/…`, because the uv workspace root
  is now the repo root. Neither file declares a compose `name:`, so the old
  bare `docker compose exec api` resolved to project `fastapi` while the real
  containers are `grenmet-api-*` — the old commands were already broken. Staging
  only the `--frozen --package fast-back` half would ship a command that does not
  run, violating "each commit must leave the workspace runnable". Stage whole,
  minus the exception below.
- The `pnpm reset` change in `docs/api/testing.md` (hunk 6, second half) and
  `docs/troubleshooting.md` (hunk 1) is a **behavioural warning**, not a command
  form — "do not run unless the data loss is intentional". It is its own
  decision and belongs to commit 6 in both files.

Net: commit 2 takes `development.md` and `pipeline-staging.yml` whole,
`testing.md` minus its `pnpm reset` half-hunk, and only the `seed_data` hunk of
`troubleshooting.md`.

### 3. `fix(api): isolate billing tests from ambient Stripe configuration`

`apps/api/fastapi/tests/billing/test_billing.py` only. Explicitly clear Stripe
settings in the tests that verify fail-closed behavior. Production billing
behavior is unchanged.

**Note 2026-07-25.** This file also carries five `Generator[X, None, None]` →
`Generator[X]` annotations, which are commit 2 material. They were left here
deliberately: three hunks are pure typing but the fourth has the annotation on
the `def` line and the Stripe fix immediately below, so a clean split would
require amending commit 2 with hand-edited patches. Nothing breaks either way —
the three-argument form remains valid on 3.13 — so reverting this commit still
leaves a working file.

Rule applied throughout Phase 2: split a hunk out only when it is **both**
cleanly separable **and** an independently revertable decision. Entangled lines
stay together.

### 4. `feat(wxwatch): harden unattended crawler runs`

`scripts/scrapy-wxwatch/` — `run_crawlers.py`, `run_spider.sh`, `app/config.py`,
`app/pipelines.py`, `app/settings.py`, `app/spiders/trackthetropics.py`,
`README.md`, and the tests (`tests/test_pipelines.py`, plus the new
`tests/test_run_crawlers.py` and `tests/test_spiders.py`).

Covers explicit source selection, freshness and product-count policies, timeouts,
advisory locks, reliable exit codes, disabled HTTP caching, and complete image
archival.

### 5. `ci(docs): enforce documentation and design-system drift`

Add `scripts/docs/` (the Markdown link and heading checker plus its three test
files). Add the blocking documentation and design-system drift jobs to
`.github/workflows/ci-web.yml`. Include the repaired links,
`docs/quality-score.md`, and `scripts/design-system/design-system-audit.mjs`.

From `package.json` (*mixed*), stage only the `docs:check-links` and `test:docs`
script entries.

### 6. `docs(env): align local setup and deployment configuration`

Environment examples: `apps/api/fastapi/.env.local.example`,
`apps/api/honoapi/.env.{local,staging,production}.example`, and the four
`apps/web/*/.env.local.example` files. Compose deployment corrections:
`infra/docker/docker-compose.{deploy,prod,staging}.yml`. Setup guidance:
`apps/api/fastapi/README.md`, `apps/api/honoapi/README.md`,
`packages/api-client/README.md`, `docs/api/deployment.md`.

From `package.json` (*mixed*), stage the `start` script's `--build` change — it
splits cleanly from the commit 5 script entries at hunk level.

**Corrected 2026-07-25.** `README.md` is mixed across *three* boundaries, not
two: commit 2 content (the new "Python workspace" section, the root
`pyproject.toml`/`uv.lock` tree entries, the sutron-collector line), commit 6
content (env-file setup, Compose commands), and material belonging to none of
the eight (mbia, `@grenmet/email-templates`/`mdx`/`theme`, geonetcast). With
commit 2 already sealed, splitting it would mean rewriting a 41-file commit.
Stage `README.md` whole here — it is descriptive documentation, so no
intermediate state can break.

Also takes the `pnpm reset` warning left behind by commit 2: the second half of
hunk 6 in `docs/api/testing.md`, and hunk 1 of `docs/troubleshooting.md` (which
also carries the `docker compose -p grenmet-api … logs api` correction).

Never add a populated `.env.local`.

### 7. `chore(tooling): add diagnosis and release playbooks`

`.claude/commands/release.md`, `.claude/skills/stack-doctor/`,
`.claude/skills/teach/`, the removal of `.claude/skills/ci-fix/SKILL.md`, the
edits to `.claude/commands/{ci-triage,pre-merge}.md`,
`docs/operations/release-runbook.md`, `.devcontainer/devcontainer.json`,
`.vscode/settings.json`, `.lintstagedrc.mjs`, `.gitignore`, and `CONTRIBUTING.md`.

**Corrected 2026-07-25.** `AGENTS.md` and `CLAUDE.md` are mixed, but their
non-playbook hunks are commit 2 command-form updates (`uv run` → `uv run
--frozen --package fast-back`, `uv sync --package geonetcast`) and commit 2 is
sealed. Both files are dominated by playbook content. Stage whole — same
reasoning as `README.md` in commit 6.

### 8. `docs(strategy): record Barrels Grenada product strategy`

`docs/strategy/barrels-product-strategy.md` only — documentation, no code.

### 9. `docs(platform): add Barrels Grenada migration plan`

Added 2026-07-25 during execution. This plan did not exist when the eight
boundaries were derived, so its own output has no home among them:

- `docs/exec-plans/barrelsgd-migration-plan.md` (new — this file)
- `docs/exec-plans/barrelsgd-transition.md` (reserved identities, Python/ops
  classification, ops-stack exclusion, multi-tenant HR wording, dowden/gdbank
  exclusion)
- `docs/weather-gd-golive.md` (superseded banner; `api.barrels.gd` is canonical,
  Hurricane Plan folds into GrenMet `/sops`, the cookie constraint carried
  forward)

Documentation only. Land it last so it records the eight commits that precede it.

### Remaining paths, classified

Read on 2026-07-25 and assigned to commits 1–8.

| Path | Commit | Why |
| --- | ---: | --- |
| `docs/data-architecture.md` | 2 | `uv run` → `uv run --frozen --package fast-back` |
| `docs/fastapi-cap-audit.md` | 2 | same workspace command form |
| `docs/hr/adding-a-form-module.md` | 2 | same workspace command form |
| `docs/staging-prep.md` | 2 | same workspace command form |
| `apps/api/fastapi/CLAUDE.md` | 2 | `uv sync`/`uv run` → `--frozen --package fast-back` |
| `scripts/scrapy-wxwatch/README.md` | 4 | crawler hardening docs (required source argument, exit codes, per-spider scheduling); its `--package wxwatch` command edits are inseparable from the reworked examples |
| `docs/architecture.md` | 5 | link repair to `./internal/service-catalogue.md` |
| `docs/internal/service-catalogue.md` | 5 | relative-path repairs after the file moved under `internal/` |
| `docs/technical-overview.md` | 5 | anchor repair to `#database-owned-by-admin-gms` |
| `docs/env.md` | 6 | env-file guidance and per-app example rewrite |
| `docs/troubleshooting.md` | 2 and 6 (*mixed*) | the `--frozen --package fast-back` seed command is boundary 2; the `pnpm reset` warning and the Compose logs command are boundary 6 |

### Landed (2026-07-25)

All eight boundaries committed on `dev`, on top of `490e657`. Commit 9 follows
and carries this record.

| # | SHA | Commit | Files | +/− |
| ---: | --- | --- | ---: | --- |
| 1 | `b198ed9` | `chore(sutron): preserve phase-one collector snapshot` | 12 | +714 |
| 2 | `accd2de` | `chore(python): centralize uv workspace on Python 3.13` | 41 | +5612 / −7580 |
| 3 | `14c5b7c` | `fix(api): isolate billing tests from ambient Stripe configuration` | 1 | +13 / −6 |
| 4 | `ebc7940` | `feat(wxwatch): harden unattended crawler runs` | 10 | +496 / −22 |
| 5 | `b3ce7db` | `ci(docs): enforce documentation and design-system drift` | 11 | +491 / −28 |
| 6 | `2fb39d5` | `docs(env): align local setup and deployment configuration` | 20 | +313 / −77 |
| 7 | `85c94d6` | `chore(tooling): add diagnosis and release playbooks` | 15 | +373 / −26 |
| 8 | `fd00a44` | `docs(strategy): record Barrels Grenada product strategy` | 1 | +401 |

Commit 2 was made twice: the first attempt (`b9c20fa`, abandoned) swallowed
commit 6 content because `git add -p` answers were consumed from a pasted
buffer. It was undone with `git reset --soft HEAD~1` before anything was pushed,
the commit 6 hunks were stripped from the working tree with an editor, and the
boundary was recommitted as `accd2de`. The stripped text was restored to the
working tree afterwards and landed in `2fb39d5` as intended.

Every commit passed the `guardrails:staged` blast-radius check via the
pre-commit hook. That hook runs guardrails automatically — a separate
`pnpm guardrails --staged` is redundant.

### Baseline acceptance gate

After the nine commits, `git status` must be clean, and all of the following
must pass:

- `uv lock --check` and `git diff --check`
- `pnpm fix` and `pnpm type-check`
- `pnpm test:docs`, `pnpm docs:check-links`, `pnpm design-system:check`,
  `pnpm test:guardrails`, `pnpm guardrails`
- FastAPI 262 tests + Ruff + mypy
- WxWatch 27 tests + Ruff + mypy
- Sutron 8 tests + Ruff + strict mypy

Then push `dev`, wait for CI, and promote `dev` → `staging` → `main` through
human-reviewed pull requests, verifying staging between each. Do **not** publish
a production release to establish the baseline; production release remains a
separately authorized action.

#### Gate result (2026-07-25) — passed

Every item green against the committed tree: `git status` clean, `uv lock
--check` 287 packages, `git diff --check` clean, `pnpm fix` 1895 files with no
fixes applied, `pnpm type-check` 13/13, `pnpm test` 7/7, `pnpm test:docs`,
`pnpm docs:check-links` 201 files, `pnpm test:guardrails`,
`pnpm design-system:check` in sync, FastAPI 262 passed in-container (7:42) plus
ruff/format/mypy clean, WxWatch 27 passed, Sutron 8 passed with strict mypy.

Pushed `beb2e18..aeb6135` to `dev`. All three workflows succeeded — `CI`,
`CI — Web Apps`, `API Client Generation` — with all seven `CI — Web Apps` jobs
green, including the new `Repository Drift` job on its first CI run.

#### Open: the new drift checks are not yet enforcing

Commit 5 describes the documentation and design-system checks as *blocking*, and
they are not. It added a genuinely new job (`drift` / name `Repository Drift`);
it renamed nothing, so the ruleset trap was **not** triggered and the six
existing required names are intact: `Biome Check`, `Type Check`,
`Peer Dependencies`, `Repository Guardrails`, `TypeScript Tests`,
`Build Web Apps`.

But a job only blocks a merge when the branch ruleset lists it as required.
Until `Repository Drift` is added to the required checks on `staging` and
`main`, commit 5 is advisory: it will go red without stopping anything. Adding
it is a GitHub settings change needing Administration scope on the PAT, not
Contents/Workflows/Pull-requests. It has now passed one clean CI run, which was
the precondition for making it required.

## Phase 3 — Execute the transition

[barrelsgd-transition.md](barrelsgd-transition.md) holds the 21 numbered
implementation boundaries and the acceptance criteria for each. This section adds
what that document does not: the ordering constraints, the traps found in the
current tree, and how the boundaries interleave with infrastructure.

### Ordering constraints

- The baseline must be on `main` before boundary 2 (workspace scope rename)
  starts. A half-renamed tree racing a promotion PR is the one state this plan
  refuses to enter.
- Fresh Barrels staging is provisioned as soon as the baseline is frozen, and
  each subsequent boundary is deployed to it as it lands.
- The GitHub repository rename (boundary 18) stays late and stays a separately
  authorized external operation.
- The production DNS cutover happens only after every boundary is validated on
  staging.

### Traps in the current tree

These are specific to this repository and are not visible from the transition
document alone.

**The `web-admin` name is already taken.** `apps/web/admin-gms` is published as
`@grenmet/web-admin`, but the transition allocates `@barrelsgd/web-admin` to a
brand-new Barrels-wide control plane. The scope rename in boundary 2 must **not**
map `@grenmet/web-admin` → `@barrelsgd/web-admin`. `admin-gms` is being folded
into the GMS Dashboard, so rename it to a transitional product-explicit name
(`@barrelsgd/web-admin-gms`) and leave `@barrelsgd/web-admin` unclaimed until
boundary 11 creates it.

**GAA does not exist as an app yet.** `apps/web/gaa` is an empty untracked
directory; the GAA content lives inside `apps/web/mbia`
(`src/app/airports`, `src/components/airport-page.tsx`, `src/lib/nav.ts`).
Boundary 12 is an extraction, not a rename, and `@barrelsgd/web-gaa` /
port 3007 / `gaa.barrels.gd` have no existing implementation behind them.

**Branch rulesets pin status check names, not workflow names.** `staging` and
`main` require six named checks. Those names come from each job's `name:` field
— `Biome Check`, `Type Check`, `Peer Dependencies`, `Repository Guardrails`,
`Repository Drift`, `TypeScript Tests`, `Build Web Apps`, `Code Quality`,
`Security Scan`, `Run Tests` — not from the workflow's `name:`. Boundary 15
renames workflow identities; if it also changes a required job's `name:`, every
open PR blocks forever on a check that will never report. Either keep required
job names stable, or update the rulesets in the same authorized operation.

**Renaming Compose projects destroys local dev state.** `pnpm start` uses
`-p grenmet` and `-p grenmet-api`. Renaming these to `barrelsgd` orphans the
local Postgres and Redis volumes. That is acceptable — the no-data premise
applies locally too — but it must be an announced boundary with a documented
`pnpm reset` and re-seed, not a surprise.

**Drift checking does not catch an API title change on its own.**
`pnpm check:drift` compares `packages/api-client/src/gen/` against
`apps/api/fastapi/openapi.json`; it does not compare `openapi.json` against the
FastAPI source. Changing the OpenAPI title to `Barrels Grenada API` requires
regenerating `openapi.json` from code first, then the client, then running the
drift check. Regenerating in the wrong order produces a green check over stale
output.

**Token changes are dual-landed.** Any `--gm-*` token move into
`@barrelsgd/grenmet` must land in Figma and
`packages/ui/src/styles/globals.css` together, and needs approval before it
starts.

### Python and ops workspace classification

Apply the same rule used for TypeScript. Rename what claims company or
infrastructure ownership; keep what names the GrenMet product or a GMS domain
concept.

| Workspace | Treatment |
| --- | --- |
| `apps/api/fastapi` | OpenAPI title becomes `Barrels Grenada API`. CAP identifiers (`urn:grenmet:cap`), GMS route and schema terminology, and module names stay. |
| `scripts/scrapy-wxwatch` | WxWatch is a GrenMet capability name — keep it. Rename only infrastructure identifiers (bucket prefixes, container names, database roles) that claim company ownership. |
| `scripts/sutron-collector` | Parked at Phase 1. No rename, no scope change. |
| `scripts/wis2-setup`, `geonetcast`, `notebooks` | Ops tooling. Rename infrastructure identifiers only. |
| `surface/`, `wis2box/` | Vendored. Not renamed — see [VENDORED.md](../../VENDORED.md). Renaming here increases divergence from upstream for no ownership gain. |

### Scope exclusions to record

`apps/web/dowden` and `apps/web/gdbank` are empty untracked directories moving to
their own repository. Remove the empty directories locally, add nothing for them
to the port map, image list, or DNS map, and note them in the boundary-17 remnant
audit as intentionally absent rather than missing.

## Phase 4 — Infrastructure and rollout

The transition document holds the full DigitalOcean, backup, Sentry, and DNS
specification. The sequencing that this plan fixes:

1. Provision fresh `barrelsgd-staging` in NYC3 with empty databases and new
   Barrels-owned project, VPC, firewall, networks, volumes, secrets, and Sentry
   projects. Copy no old volumes, databases, Redis state, sessions, or
   certificates.
2. Create the `*.staging.barrels.gd` records. DNS control is confirmed, so this
   is not blocked.
3. Deploy each boundary to staging as it lands, rather than accumulating an
   unvalidated stack.
4. Validate on staging: health checks, product-aware authentication, redirects,
   TLS, Sentry events from every service, backup production, and a real restore
   into an isolated temporary database.
5. Provision production and deploy **without** touching public DNS.
6. Lower TTLs only after production smoke tests pass.
7. Cut over `*.barrels.gd` and verify the full platform.
8. Destroy legacy infrastructure only after every acceptance check passes and the
   owner explicitly confirms destruction. The GrenMet product continues; only the
   infrastructure named for it is retired.
9. Add `weather.gd` and `gaa.gd` later as independent cutovers. MBIA stays a
   distinct passenger site and is never redirected to GAA.
10. Schedule WxWatch sources only after its production database, object storage,
    secrets, alerting, and ownership are validated.

### Meteorological ops stacks

SURFACE and wis2box stay on their own host with their own lifecycle and their own
Compose stacks. They are upstream WMO and CDMS software on independent release
cycles, and SURFACE carries a live TimescaleDB; coupling their upgrades to
platform deploys buys nothing.

- Integration happens at the data layer only. FastAPI is the single seam through
  which the platform reads or ingests their data.
- Barrels ownership applies at the DigitalOcean project, backup, and monitoring
  layer — not in container topology, Compose project names, or the platform
  deployment pipeline.
- Neither stack is renamed. See [VENDORED.md](../../VENDORED.md).
- The step 8 legacy teardown explicitly excludes this host. Destroying
  infrastructure named for GrenMet must not reach the WIS2 sandbox.

### Barrels HR direction

Recorded so the eventual GMS HR extraction does not paint us into a corner:
Barrels HR is **one multi-tenant product**, not one deployment per business. GMS,
MBIA, GAA, and future clients are organizations within a single codebase and
deployment, with data scoped by tenant. "Main HR" is the product; "sub HR" is
each tenant's scoped view of it.

This is future work. GMS HR, roster, and the related organization-wide modules
stay inside the GMS Dashboard until a replacement covers their workflows, and no
extraction work starts under this migration.

## Boundaries and stop conditions

- Every boundary leaves the workspace runnable and passes `pnpm fix`,
  `pnpm type-check`, its focused tests, and the Blast-Radius Gate.
- Public interface changes in this migration are: `@grenmet/*` →
  `@barrelsgd/*`, the new Barrels and GrenMet hostnames, product-aware
  authentication, `grenmet_session` → `barrelsgd_session`, redirects for migrated
  routes, and the Barrels API title.
- Any public FastAPI or OpenAPI change requires a `docs/api/contracts.md` update,
  OpenAPI regeneration, API-client regeneration, and `pnpm check:drift`.
- Barrels Events, Barrels Tickets, reusable Barrels HR, and Barrels Shop are
  post-migration product initiatives. They are not hidden scope here.
- Sutron stays parked at Phase 1.
- DNS changes, secret creation, the repository rename, infrastructure
  provisioning, deployment, release publication, and resource deletion each
  require separate explicit authorization.

### Stop conditions

Stop and re-plan rather than proceeding if any of these become true:

- Real application data or active sessions turn out to need migration. The
  no-data premise is load-bearing for the entire infrastructure phase; if it
  breaks, a dedicated data-migration and rollback plan comes first.
- The baseline test counts do not match and the difference is not explained.
- A boundary cannot be landed without also editing files outside its approved
  set. Report the finding and ask; do not widen the boundary silently.
