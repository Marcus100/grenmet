# Staging promotion automation

**Status:** Built, off by default  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-31

The daily `dev` to `staging` promotion needs no human click. A person or agent
only reviews the result on staging. This covers `staging` only. `staging` to
`main`, release tags and production stay manual
(`docs/operations/release-runbook.md`).

## What runs

1. `promote-staging.yml` runs daily at 10:00 UTC (06:00 in Grenada) and on
   demand. It does nothing unless `PROMOTE_STAGING_ENABLED` is `true` and
   `PROMOTE_STAGING_HOLD` is not `true`. It then checks that `dev` is ahead of
   `staging`, that CI is green at the `dev` head (workflows `ci-api.yml`,
   `ci-web.yml`, `ci-api-client.yml`), creates or updates the one open
   `dev` to `staging` PR with a generated body (merged PRs by area and risk,
   added migrations, `risk:high` PRs and whether each has a Security review
   section, an "After merge" checklist) and turns on auto-merge.
2. GitHub merges the PR once the staging ruleset checks pass (`CI Success`,
   `Build Web Apps`, `api-client`, `Biome Check`, `Type Check`,
   `Peer Dependencies`).
3. The push to `staging` runs the Staging Pipeline and deploys.
4. `staging-smoke.yml` runs after the pipeline. On success it waits for the API
   health endpoint, runs `scripts/ops/staging-smoke.mjs` against the checks in
   `scripts/ops/staging-smoke.checks.json`, writes the job summary and comments
   the result on the promotion PR (or on the open `staging-smoke` issue). A
   failed check fails the workflow. If the pipeline itself failed, it opens or
   updates the issue "Staging deploy failed" with the run link.

Add a smoke check by appending an object to the JSON file (fields are listed in
its `_comment`); only `staging.barrels.gd` hosts are allowed.

## Why a token, not GITHUB_TOKEN

A PR created with the default `GITHUB_TOKEN` does not trigger other workflows,
so the required CI checks would never run on it and auto-merge would wait
forever. The workflow therefore uses the secret `PROMOTE_STAGING_TOKEN` and
stops with a clear error if it is missing. A GitHub App token works the same
way. The smoke workflow only comments and opens issues, so the default token is
enough there.

## Owner one-time setup

- [ ] Settings, General: enable **Allow auto-merge**.
- [ ] Create a fine-grained personal access token for this repository only:
      Contents read, Pull requests read and write, Actions read, Metadata read.
      Add it as the repository secret `PROMOTE_STAGING_TOKEN`. The token's user
      must be allowed to merge into `staging` under the ruleset. Do not give it
      admin rights or bypass.
- [ ] Optional: secret `STAGING_BASIC_AUTH` as `user:password`, if staging sits
      behind a basic-auth gate. The smoke test sends it only as a header.
- [ ] Variables: leave `PROMOTE_STAGING_HOLD` unset. Merge the PR that adds
      this automation, then set `PROMOTE_STAGING_ENABLED` to `true`.
- [ ] Run once by hand with dry run to read the body, then once for real.

## Operating it

- **Hold:** set the variable `PROMOTE_STAGING_HOLD` to `true`
  (`gh variable set PROMOTE_STAGING_HOLD --body true`). New runs stop. A PR
  already open with auto-merge on still merges; disable it with
  `gh pr merge <num> --disable-auto`. Clear the hold with
  `gh variable delete PROMOTE_STAGING_HOLD`.
- **Turn off:** `gh variable set PROMOTE_STAGING_ENABLED --body false`.
- **Run once by hand:** `gh workflow run promote-staging.yml` (add
  `-f dry_run=true` to only print the body, `-f ignore_enabled_switch=true` to
  run while the switch is off, `-f respect_hold=false` to run during a hold).
- **It skipped:** read the run summary. Usual reasons: switch off, hold on,
  `dev` not ahead, or dev CI not green or still running (the next day, or a
  manual run, retries).
- **The staging deploy failed:** open the "Staging deploy failed" issue and the
  linked run, fix on a task branch through `dev`, and set
  `PROMOTE_STAGING_HOLD=true` meanwhile. The workflows never set variables.
- **Smoke failed:** read the PR comment or the `staging-smoke` issue. Fix
  forward through `dev` or hold promotions.
- **Token expired or missing:** the run fails with "PROMOTE_STAGING_TOKEN is
  missing". Create a new token and update the secret.

## What a person still reviews

The smoke result (PR comment) and the signed-in checks with the staging test
account, including pages the smoke test cannot see. Nothing here counts as
acceptance.

## Proposed AGENTS.md wording

AGENTS.md is an owner-merge file, so this change is in its own commit that the
owner can accept or drop. Replace "(agents do not arm auto-merge)" with:

> (agents do not arm auto-merge, with one exception: the
> `promote-staging.yml` workflow arms auto-merge on the `dev` to `staging`
> promotion PR only, never on `main`, releases or production; see
> `docs/operations/staging-promotion-automation.md`)

## Safety rails

Staging only; refuses any other base. Default off. Minimal permissions
(contents read, pull requests write, issues write). Actions pinned by full SHA.
Concurrency groups prevent overlapping runs. No admin bypass; the owner's
ruleset checks still gate the merge. Guardrail tests:
`scripts/guardrails/staging-promotion.test.mjs`.
