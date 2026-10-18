# Repository testing strategy

**Status:** Active reference

**Owner:** Barrels Grenada engineering

**Last updated:** 2026-10-13

## Purpose

Verify the behavior of the whole repository: web apps, FastAPI and workers,
shared packages, collectors, operational applications, deployment tooling and
configuration. A passing build, a passing unit suite and successful deployment
are different evidence. Report which checks ran, which used cached results,
which skipped, and which could not run.

Tests cannot establish that a missing requirement was implemented. Compare
routes, callers, documentation and operational requirements before treating
current behavior as correct. Track unknown requirements explicitly.

## Tools and responsibilities

| Surface | Appropriate checks |
| --- | --- |
| FastAPI | pytest/HTTPX requests, real isolated PostgreSQL databases, real authentication, permissions, persistence, validation, state transitions and failure handling |
| Worker and external integrations | Job behavior, retries, duplicate delivery and failure recovery; deterministic substitutes at external boundaries, plus separately scoped integration checks |
| Shared TypeScript logic | Vitest through exported behavior; consumer tests may cover shared modules |
| React interactions | Testing Library with user actions, accessible queries and observable results; MSW for controlled HTTP responses |
| Next.js workflows | Playwright against a running application for authentication, server rendering and complete browser-to-API flows |
| Generated API client | OpenAPI drift and serialization/error/credential-isolation tests; do not edit generated code |
| Payload CMS | Access rules, real database editorial workflows, migrations, public content and media behavior |
| Configuration-only packages | Consumer type checks, configuration validation and runtime image checks; no artificial unit suite required |
| Collectors | Existing pytest/unittest suites with recorded or synthetic weather input, temporary output and simulated network/hardware failures |
| SURFACE | Its Django test suite and dedicated PostGIS integration checks for maintained custom behavior |
| wis2box | Configuration and supported runtime ingestion/publication/recovery checks; software runs from upstream images |
| geonetcast and notebooks | Representative input/output and scientific invariants for operational transformations; classify exploratory notebooks separately |
| Repository scripts | Existing Node/Python tests for guardrails, environment rendering, migration orchestration, backups and verification lifecycle |

Do not add a runner to every package simply for consistency. Identify the owner
of each important behavior and the suite that verifies it. Avoid retesting
upstream UI libraries unless our composition or custom behavior introduces risk.

## Verification by stage

| Stage | Checks and limits |
| --- | --- |
| Local editing | Focused tests, formatting and types; watch mode where useful |
| Local release verification | Disposable backend/storage integration, drift and repository checks; run managed Docker commands on the host |
| Dev and pull-request CI | Unit/component/API/integration checks, contract drift, lint/types, required aggregate gates |
| Docker build | Check actual runtime imports, entrypoints, assets, migration dependencies and image vulnerabilities |
| Staging | Deployed readiness and representative authenticated workflows using owned synthetic data; verify PDF generation, storage and cross-app authentication |
| Production | Safe readiness/public checks, release-linked error monitoring and operational alerts; no general mutation/fuzzing suite against live business records |
| Scheduled operations | Restore drills, broader security checks and performance testing against designated test targets |

Share scripts where the checks are equivalent. Keep separate commands where
infrastructure, credentials, side effects or purpose differ. Required checks must
fail when required services/configuration are missing. An optional local skip
must not be reported as integration acceptance.

Staging and production currently build environment-specific artifacts. Delivery
checks image revision/environment labels and resolves digests before startup;
this is not a claim that the same binary image is promoted between environments.
Source-controlled workflows and GitHub's externally configured required checks
both matter. Review them together after changing job names or aggregate gates.

## Writing useful tests

For a bug, first reproduce the observed failure in a test. For new behavior,
agree on the expected result, write one failing test, implement it, then refactor
while keeping it passing. This is the TDD loop; it is useful without requiring
that every existing test was historically written first.

Prefer assertions about results, permissions and state visible through supported
interfaces. Direct database assertions are appropriate for database constraints,
migrations and persistence guarantees. Avoid coupling ordinary behavior tests
to private helper calls or exact incidental markup.

Use real internal paths when testing integration. Control time, randomness,
network services and hardware at explicit boundaries. A component test that
mocks its server action verifies that component, not backend authorization or
the complete workflow. Keep both kinds of evidence where the risk warrants it.

Test success and meaningful rejection paths: another user's records, expired
sessions, invalid input, conflicting revisions, duplicate requests, downstream
failure and partial work. Test data must be isolated between runs. Never use a
normal development, staging or production database as a disposable test target.

Coverage reports help locate unexecuted code. They do not prove requirements,
assertion quality or permission coverage. Do not pursue an arbitrary percentage
by adding tests that merely repeat the implementation.

## Coverage floors

Line and branch floors live in `scripts/guardrails/coverage-baseline.json`:
the API and five web apps (`auth`, `gaa-admin`, `gms`, `mbia`, `signal`).
Current floors (lines / branches): API 89 / 74; auth 79 / 71; gaa-admin 64.8 /
63.7; gms 90 / 79; mbia 23 / 38; signal 64 / 55. Measured values and their
source are in [quality-score](quality-score.md).

Where each floor is enforced:

- **API, in CI.** `ci-api.yml` runs the backend suite with pytest-cov
  (`scripts/verification/backend.sh`, which writes `apps/api/fastapi/coverage.xml`)
  and then `node scripts/guardrails/check-coverage.mjs --only api`. A drop below the
  floor fails the job. Coverage is branch-aware (`branch = true` in
  `apps/api/fastapi/pyproject.toml`); the floor check uses the Cobertura line and
  branch rates, so no separate `fail_under` is set in pyproject.
- **Web, locally.** Each of the five apps sets `coverage.thresholds` in its
  `vitest.config.ts`, so `pnpm --filter <app> test:coverage` (or `vitest run --coverage`)
  fails below the floor. `pnpm coverage:check` then compares the
  `coverage/coverage-summary.json` reports with the baseline. Apps without a report
  are skipped.
- **Web, in CI.** `ci-web.yml` runs the `web-coverage` job: one matrix entry per
  app in `coverageApps` (`scripts/ci/select-images.mjs`: `auth`, `gms`, `mbia`,
  `signal`), each running `pnpm -C <app> run test:coverage` and then
  `node scripts/guardrails/check-coverage.mjs --only web`. It runs beside the
  TypeScript Tests job and is part of the `build` aggregate gate. Dev PRs and dev
  pushes run only the apps whose files changed (shared packages and root files
  select all, as in image selection); promotion PRs and pushes run all four. A
  skipped matrix leaves the gate green only when selection succeeded.
- **gaa-admin is not in CI coverage.** Its full run takes about 40 minutes locally
  and hit a 30 s test timeout under instrumentation, so its floor is enforced only
  by `pnpm -C apps/web/gaa-admin run test:coverage` on a developer machine. Add it
  to `coverageApps` only after a measured CI run fits the job timeout.

Raising a floor (floors only rise; lowering one needs a human review and a stated
reason, because `coverage-baseline.json` is a high-risk path in `risk-tier.mjs`):

1. Measure. API: the backend suite in CI or `scripts/verification/backend.sh` on a
   disposable Postgres. Web: `pnpm --filter <app> test:coverage`. Use the run's
   reported line and branch percentages.
2. Set the new value to the measured percentage rounded down to a whole number,
   and never below the current floor. Put it in `coverage-baseline.json` and in
   that app's `coverage.thresholds` (web only). The two places are not generated
   from each other, so change both together. `pnpm coverage:check -- --write`
   also raises the baseline, but it uses measured minus 0.5 and does not touch the
   vitest thresholds.
3. Run `pnpm coverage:check` and `pnpm test:guardrails`, then update the figures in
   quality-score.md.

Thresholds are only as honest as the measurement. The web figures on 2026-10-18
were measured on the default coverage scope of each app (files the suite loads),
except mbia and signal, which use `src/**` as configured. Keep the scope
unchanged when raising a floor; changing it moves the number. gaa-admin's floor was
not re-measured on 2026-10-18 because a full coverage run there took about 41
minutes locally and hit a 30 s test timeout under instrumentation, so its floor
stays at the committed value.

`cms`, `elections`, `events` and `docs` have no coverage provider yet; adding one is
a separate change.

## Current gaps and follow-up

The September 2026 review found existing suites outside the default workspace
command, optional CMS integration, and an OpenAPI guard that missed included
routers. Repairs to these checks must be verified before claiming acceptance.

Further work remains:

- Map every FastAPI operation, including hidden routes, to behavior and permission
  evidence; review documented unfinished workflows with domain owners.
- Replace the auth browser suite's assumed credentials with isolated setup and
  specific success assertions; add representative workflows across the apps.
- Review custom theme persistence, email rendering and shared UI behavior; retain
  useful GMS/UI tests already owned by consuming apps.
- Explicitly assign operational acceptance and CI coverage to SURFACE, wis2box,
  geonetcast, notebooks and standalone data tools.
- Verify live GitHub environment settings, DigitalOcean runtime configuration,
  backup restore readiness and monitoring separately from source review.

No statement in this document certifies every feature or production environment.

## Error monitoring and analytics

Sentry SDK configuration exists in all eight web apps, FastAPI and the ARQ worker.
FastAPI/worker initialization is conditional on a DSN and a non-local environment.
Browser/server/edge web configuration and build-time source-map upload are separate
checks. Verify actual event receipt and usable stack traces per environment; SDK
files, credentials and a successful upload do not establish delivery from every
runtime. Operational tools need their own coverage review.

PostHog providers currently wrap auth, gaa-admin, docs and gms. The shared provider
allows restricted page-section counts; auth also sends anonymous outcome events.
Person profiles, autocapture and session recording are deliberately disabled.
CMS, events, mbia and signal do not currently mount that provider. Extending
analytics requires an explicit measurement purpose and review of the event data.

The integration diagnostic in `scripts/integrations/check.mjs` distinguishes
credential presence from verified provider read access. Neither proves event
ingestion. Its tests run with verification tooling locally and in web CI, without
live provider credentials. Live verification should establish receipt of an
approved synthetic event without introducing real user data.

## Commands and references

- [Managed verification commands](../scripts/verification/README.md)
- [API development](api/development.md) and [backend test conventions](../apps/api/fastapi/TESTING.md)
- [Web development](web/development.md)
- [Release promotion](operations/release-runbook.md)
- [Vendored applications](../VENDORED.md)
- [FastAPI async tests](https://fastapi.tiangolo.com/advanced/async-tests/)
- [pytest fixtures](https://docs.pytest.org/en/stable/how-to/fixtures.html)
- [Next.js testing](https://nextjs.org/docs/app/guides/testing)
- [Testing Library principles](https://testing-library.com/docs/guiding-principles/)
- [Vitest network mocking](https://vitest.dev/guide/mocking/requests)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
