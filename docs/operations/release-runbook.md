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
  which builds changed images and deploys staging in one `needs:` chain.
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
- Spot-check app domains: `auth` / `admin` / `hurricane` / `spice` `.barrels.gd`.

## Rollback / redeploy

Re-deploying an existing release needs no builds: manually dispatch the
**Deploy** workflow (`deploy.yml`) with `environment=production` and the release
tag. `deploy-prod.yml` is a legacy dispatch-only fallback slated for deletion.
