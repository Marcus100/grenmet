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

Staging acceptance and timing measurements are pending for this patch. Do not
claim the ten-minute feedback target or cache savings until these runs exist.
Portable runtime configuration, verified release manifests, authenticated
synthetic-account tests, vulnerability baseline review/enforcement, and retained
manifest rollback remain later work. Existing vulnerability scans still report
findings without blocking publication; they do not yet enforce the planned
high/critical policy.
