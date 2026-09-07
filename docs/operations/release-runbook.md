# Release Promotion Runbook

How a change ships from `dev` to production. Agents (Claude Code / Codex) may run
the verification and PR-creation steps; **merging PRs and publishing the release
are human actions** (see the Never tier in `CLAUDE.md`).

Branch flow: `dev → (PR) → staging → (PR) → main → (release vN.M) → prod`.
Direct commits go to `dev`; promotion is always via PR. Rulesets enforce the
required checks on `staging` and `main` PRs.

## 1. Pre-flight on dev

- `pnpm fix` then `pnpm type-check` — both clean.
- Run the `/pre-merge` check (types, lint, Docker names, env drift, API-client
  sync, Actions pinning). Fix findings before promoting.
- `git status` clean, `dev` pushed.

## 2. Promote dev → staging

- `gh pr create --base staging --head dev --title "chore: promote dev to staging"`
- Wait for required checks: `gh pr checks <num> --watch`
- **Human merges the PR.** The push to `staging` triggers `pipeline-staging.yml`,
  which builds and smoke-tests a complete core image set alongside CI, then deploys only after every gate succeeds.
- Verify the staging deploy job succeeded: `gh run list --workflow=pipeline-staging.yml --limit 1`

## 3. Promote staging → main

- `gh pr create --base main --head staging --title "chore: promote staging to main"`
- Wait for required checks, then **human merges**. Merging to `main` does NOT
  deploy prod — prod is release-gated.

## 4. Publish the release (deploys prod)

- Tag convention: `vN.M`, strictly increasing (…v0.10, v0.11). The tag IS the
  image tag — it must be new.
- Draft notes from merged changes, then **human publishes**:
  `gh release create vN.M --target main --title "vN.M" --notes "…"`
- Publishing triggers `pipeline-prod.yml`: builds ALL images at the tag, then
  deploys via `deploy.yml` on the self-hosted `production` runner. The runner
  must be online or the job queues silently — check with
  `gh run list --workflow=pipeline-prod.yml --limit 1`.

## 5. Verify prod

- API health: `curl -fsS https://api.barrels.gd/api/v1/utils/health-check/`
- Spot-check app domains: `auth` / `admin` / `docs` / `weather` / `signal` / `mbia` / `events` / `hapi` `.barrels.gd`.

## Rollback / redeploy

Re-deploying an existing release needs no builds: manually dispatch the
**Deploy** workflow (`deploy.yml`) with `environment=production` and the release
tag. For a release before the domain migration, select that release tag as the
workflow ref too, so its matching Compose definition is used. The
`deploy-prod.yml` and `deploy-staging.yml` entries delegate to the same Deploy
workflow; they no longer use separate legacy Compose files.


## CI acceleration rollout acceptance

Phase 1 must pass a real staging deployment before runtime configuration or
manifest promotion changes release behaviour. Local regression tests do not
satisfy that gate. Confirm the run belongs to the reviewed commit, all required
checks pass, migrations and runtime permissions succeed, and external readiness
and page-content smoke checks pass (including the auth form at `/`).

Retain the workflow run URL, commit, runner type, image set, BuildKit build
records and timestamped logs for comparable cold-cache and warm-cache runs.
Record these measurements separately; parallel job durations must not be added
together as end-to-end elapsed time:

| Measurement | Evidence |
| --- | --- |
| Build | BuildKit compilation vertices, excluding image export; record cache hits per image |
| Export | Docker load/export and registry push vertices in BuildKit records |
| Queue | Workflow/job timestamps and runner/environment approval waiting time, separately from execution |
| Migration | Timestamped log interval for each of `prestart`, `web-migrate`, and `cms-migrate` |
| Startup | Timestamped interval from application start to Compose readiness |
| Functional verification | External readiness and page-content smoke interval |
| Feedback and deployment | Commit-to-required-check completion and trigger-to-successful-deployment elapsed times |

The first successful staging run and its timing evidence are recorded below.
A comparable cold-cache/warm-cache pair is still required before claiming
performance improvement or consistent ten-minute feedback.
Portable runtime configuration, verified release manifests, authenticated
synthetic-account tests, vulnerability baseline review/enforcement, and retained
manifest rollback remain later work. Existing vulnerability scans still report
findings without blocking publication; they do not yet enforce the planned
high/critical policy.


### Phase 1 staging evidence — 7 September 2026

[Staging run 34163246536](https://github.com/Marcus100/grenmet/actions/runs/34163246536)
completed successfully for merge commit
`20702e69f5522f6f07ac096da967423938af1bf5`, promoted by
[PR #236](https://github.com/Marcus100/grenmet/pull/236).
The run started at 21:28:09 UTC and completed at 21:42:44 UTC.
Image builds used GitHub-hosted Ubuntu runners and `linux/amd64`; deployment
used the self-hosted `grenmet-staging-01` runner.

All code checks, core storage integration, twelve image verification/publishing
jobs, reference validation, and core deployment succeeded. The image set was
FastAPI, auth, gaa-admin, docs, gms, signal, mbia, events, CMS, Hono, and the
separate gaa-admin/CMS migration targets. Weather delivery was disabled and its
publication/deployment jobs were skipped. Duplicate image checks in reusable
CI were intentionally omitted because publishing jobs performed verification.

The [core deployment log](https://github.com/Marcus100/grenmet/actions/runs/34163246536/job/101870299875)
records successful API migrations, all four admin-domain migration/baseline
checks, CMS migration completion, and verified FastAPI runtime login/schema
access. Application startup followed those gates. At 21:42:39.859 UTC it reports
`External functional smoke passed`.
That script checks CMS public content, API/admin/CMS readiness, the auth form
at `/`, and `<main` content on docs/weather/signal/mbia/events, rejecting HTTP
and streamed rendering errors. A separate read-only rerun from the agent
workspace also passed. This establishes the automated core staging deployment
acceptance gate; it does not establish authenticated user-flow or rollback
acceptance.

#### Deployment timings

These are elapsed wall times from job metadata and timestamped phase markers,
rounded to the nearest tenth where useful. They are not CPU time.

| Interval | Duration | Measurement boundary |
| --- | --- | --- |
| Pipeline | 14m35s | Workflow creation to completion |
| Web aggregate feedback | 1m37s | Workflow creation to web aggregate success |
| API aggregate feedback | 5m45s | Workflow creation to API aggregate success |
| Initial scheduling | About 3s | Workflow creation to first jobs starting; not an isolated runner-queue measurement |
| Deploy scheduling | About 2s | Reference-validation job completion to deploy job start; approval wait cannot be separated from this metadata |
| Core deployment job | 8m02s | 21:34:41–21:42:43 UTC |
| Image resolution, pull and label validation | 4m26.4s | Resolve/pull marker to database provisioning marker |
| Database provisioning | 2.2s | Provisioning marker to migration marker |
| Migrations and catalogue initialization | 1m05.3s | Migration marker to runtime-permission marker |
| API prestart | About 19.8s | Migration marker to web-migrate container creation; includes invocation overhead |
| Admin migrations/baselines | About 22.0s | web-migrate creation to cms-migrate creation; includes invocation overhead |
| CMS migration | About 23.5s | cms-migrate creation to runtime-permission marker; includes invocation overhead |
| Runtime permissions | 2.2s | Permission marker to application-start marker |
| Application startup/readiness | 2m09.6s | Application-start marker to external smoke marker |
| External functional verification | 5.8s | External smoke marker to success message |

The API test job finished at 21:33:49, after the last image job at 21:33:27;
code checks therefore remained on the pre-deployment critical path in this run.
The feedback figures use workflow creation, not commit creation, and do not
establish a general commit-to-feedback guarantee.

#### Build and export timings

Values below are BuildKit vertex durations in seconds, not full action durations.
Compilation excludes dependency installation and image assembly. Export vertices
can overlap, so **do not sum the columns** to reconstruct elapsed time.

| Image | Application build | Docker export/load | Registry export/push | GHA cache export |
| --- | --- | --- | --- | --- |
| FastAPI | N/A; uv install vertices 4.0 + 1.3 | 18.0 | 8.9 | 62.9 |
| auth | 30.5 | 4.3 | 3.8 | 82.1 |
| gaa-admin | 35.8 | 5.8 | 5.0 | 96.2 |
| docs | 36.3 | 4.3 | 5.4 | 127.7 |
| gms | 31.4 | 4.7 | 4.0 | 86.0 |
| signal | 22.6 | 3.9 | 3.8 | 79.1 |
| mbia | 23.7 | 4.3 | 3.9 | 79.8 |
| events | 16.5 | 4.0 | 3.9 | 84.8 |
| CMS | 29.8 | 6.1 | 4.8 | 121.8 |
| Hono | 0.4 | 2.7 | 2.9 | 82.2 |
| gaa-admin migration | No application compilation | 44.6 | 6.0 | 100.9 |
| CMS migration | No application compilation | 42.8 | 6.6 | 159.3 |

All nine web/Hono application-build vertices were `CACHED` during publishing;
FastAPI's two uv installation vertices were also `CACHED`. This confirms reuse
within each build/test/publish job. It does not prove cross-environment image
reuse or a fully warm run. Initial application compilation still executed.

GitHub lists 24 unexpired `.dockerbuild` artifacts for this run, one per
verification/publishing build. Download the run logs and artifacts from the
linked run before retention expires. The investigation retained job metadata,
13 job logs, all 24 raw build artifacts and extracted vertices locally under
`/tmp/grenmet-staging-34163246536`; temporary workspace storage is not a durable
release archive. GitHub CLI's automatic artifact extraction reported an invalid
ZIP; separate raw downloads succeeded and matched the listed byte sizes. Measurements above
come from job logs, not decoded build records.

#### Remaining evidence and next investigation

- Obtain comparable cold-cache and warm-cache runs with the same source, runner
  class, image set and configuration. This run alone proves no speedup ratio.
- Measure true runner queue and environment approval time separately if either
  becomes material; current metadata only provides scheduling bounds.
- Investigate cache-export cost and staging image-pull time before buying more
  compute. They are measured costs here, not yet proven reducible overhead.
- Complete dedicated synthetic-account flows and a schema-compatible rollback
  exercise. Neither is established by public smoke checks.
- Keep vulnerability baseline review/enforcement and Phase 2 runtime portability
  as explicit outstanding work. Passing report-only scans is not security-policy
  acceptance, and production has not been used as a test target.


#### Follow-up: worker probes and migration extraction

Operator diagnostics on `grenmet-staging-01` after the successful run showed
1.9 GiB RAM, 637 MiB available, 535 MiB swap used, and root storage 43% used.
Swap occupancy alone does not establish active swapping or explain deployment
latency. Container block-I/O totals are cumulative, not instantaneous throughput.
Five healthy worker probes took 9.7–11.7 seconds each; API probes took
0.08–0.21 seconds. These were steady-state probes around 21:55–21:58 UTC,
not startup measurements.

The worker settings module loaded CAP publishing and database dependencies for
every `arq --check` invocation. Task imports now happen inside the task functions,
with an `on_startup` hook warming and validating them once in the real worker.
The existing host-specific Redis heartbeat, expiry behavior, intervals and CLI
remain intact. This uses arq's documented
[startup hook and health-check mechanisms](https://arq-docs.helpmanual.io/).
Regression tests exercise the actual CLI with present/missing heartbeat values,
and startup with available/missing task dependencies, in fresh Python processes.

Five fresh-process settings imports on the same local workspace had a median
of 1.851 seconds before and 0.320 seconds after the change (about 83% lower).
This measures imports only, not Redis round trips or staging deployment time.
Recheck the deployed worker's health logs after promotion before claiming a
staging speedup. Local database integration tests could not bootstrap because
the available role lacks CREATE DATABASE; the full CI database suite remains
required. Local Docker daemon access was denied, so real container acceptance
also remains required in CI/staging.

The CMS migration dependency layer finished downloading at 21:36:20.829 UTC
and completed extraction at 21:39:11.670 UTC: approximately 171 seconds of
extraction, inside the measured image-pull interval. Registry metadata reports
162,048,837 compressed bytes for that layer. Review migration-only dependency
requirements and measure storage/CPU/memory pressure during deployment before
changing image contents or purchasing compute.

The API suite passed 302 tests in 283.30 seconds in the recorded CI run. CI now
prints its slowest 20 setup/call/teardown durations using
[pytest's duration reporting](https://docs.pytest.org/en/stable/how-to/usage.html#profiling-test-execution-duration).
Keep database isolation intact when considering parallel execution.

Keep BuildKit cache `mode=max` until a comparison proves a better choice:
[Docker documents](https://docs.docker.com/build/cache/backends/) that `min`
exports final-image layers, while `max` also retains intermediate stages.
Changing the mode solely to shorten export risks losing expensive builder cache.

For the next staging deployment, capture `vmstat 1 60` and, if already installed,
`iostat -xz 1 60` during image extraction and startup. Ignore the initial
since-boot sample; correlate subsequent swap-in/out, I/O wait, CPU steal and disk
latency with workflow timestamps. These read-only measurements help distinguish
resource contention from image size and file-count overhead.
