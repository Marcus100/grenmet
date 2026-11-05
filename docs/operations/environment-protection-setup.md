# GitHub environment protection: setup checklist (#970)

**Status:** Checklist; the settings below are not applied yet  
**Owner:** Barrels Grenada engineering (the clicks are the repository owner's)  
**Last updated:** 2026-11-05

Deploy credentials already live in GitHub **environments**, not repository secrets.
What is missing is a limit on which branch or tag may use each environment, and three
environments the workflows expect. Without the limit, a workflow run from any
branch can read that environment's secrets. This page lists the settings in the
order to do them. Open each with **Settings → Environments → (name)** in
`github.com/Marcus100/grenmet`.

## 1. Limit who can deploy

For each row choose **Deployment branches and tags → Selected branches and tags**,
**Add deployment branch or tag rule**, pick the type, enter the pattern, **Add rule**.

| Environment | Allow only | Type | Why |
| --- | --- | --- | --- |
| `production` | `v*` | Tag | Only a published release can reach production. A manual redeploy from a branch stops working; that is intended. |
| `staging` | `staging` | Branch | Staging deploys come from the `staging` branch only. |
| `production-backup` | `main` | Branch | Backup and restore-drill jobs run from `main`. |
| `build` | `dev` | Branch | Already set. |

## 2. Create the three missing environments

| Environment | Used by | Branch limit | Secrets |
| --- | --- | --- | --- |
| `staging-promotion` | `promote-staging.yml` (daily dev to staging PR) | `main` | `PROMOTE_STAGING_TOKEN` (fine-grained token: Pull requests read and write, Actions read, Metadata read; add Contents write if auto-merge needs it, see `staging-promotion-automation.md`) |
| `staging-monitoring` | `monitoring-daily.yml` (matrix `<env>-monitoring`) | `main` | the monitoring values that job reads |
| `production-monitoring` | same | `main` | same |

Do not set the repository variable `PROMOTE_STAGING_ENABLED` until the release that
carries `promote-staging.yml` has reached `main` and the dry run in
`staging-promotion-automation.md` has passed.

## 3. Optional secrets

The deploy hard-requires only the secrets listed in `REQUIRED_SECRETS` in
`scripts/production/render-env.py` (all present in both environments on
2026-11-05). Everything else switches a feature on: add `BILLING_*` and
`PAYMENTS_*` Stripe keys for payments, `META_PAGE_ACCESS_TOKEN` for social posting,
`TURNSTILE_SECRET_KEY` for form bot checks, `DO_SPACES_*` for the backup gate (also
set the repository variable `DEPLOY_BACKUP_GATE` to enforce it),
`CLOUDFLARE_ORIGIN_SECRET` before setting `CLOUDFLARE_PROXY_ENABLED=true` on
production. Names only; never paste a value into an issue or a log.

## 4. Check it

```bash
gh api repos/Marcus100/grenmet/environments --jq '.environments[] | "\(.name)\t\(.deployment_branch_policy)"'
gh secret list --env production
```

Every row of the table in step 1 should show a custom branch policy. Then run a
non-production workflow dispatch from a branch other than the allowed one and
confirm GitHub refuses it for that environment.
