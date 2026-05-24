---
description: Pre-merge verification — types, lint, Docker, env drift, API client sync, GH Actions pinning. Analysis only, no edits.
allowed-tools: Bash(pnpm *), Bash(turbo run *), Bash(gh *), Bash(git *)
---

## Pre-Merge Check

Run all checks in parallel. **Analysis only — list findings and show exact fix commands. Do not edit any files.**

**1. Types**
Run `pnpm type-check`. Report all errors grouped by package.

**2. Lint**
Run `pnpm check`. Report all violations grouped by file.

**3. Docker image names**
Read every `*.yml` file under `.github/workflows/`. Verify all Docker image names are lowercase and consistent between the `build` and `deploy` jobs. Flag any mismatch.

**4. Env drift**
For each app's `.env.local.example`, verify every variable is either referenced in `docker-compose.yml`, the relevant workflow, or the app's `env.ts`. Flag variables defined in `.env.local.example` but missing from runtime config, and vice versa.

**5. API client sync**
Compare the modification time of `apps/api/fastapi/openapi.json` against `packages/api-client/src/gen/`. If `openapi.json` is newer, flag as drift — regeneration is needed (`pnpm generate:api-client`).

**6. GitHub Actions pinning**
Grep all workflow YAMLs for `uses:` lines. Flag any action pinned to a tag (e.g. `@v3`) rather than a SHA.

---

**Output format:**
```
✅ Types — clean
❌ Lint — 3 violations in apps/web/spicewx/src/...
✅ Docker image names — consistent
⚠️  Env drift — AUTH_ALLOWED_RETURN_HOSTS missing from hr workflow
✅ API client sync — in sync
❌ GH Actions pinning — actions/checkout@v4 in deploy.yml (needs SHA)
```

List the exact commands or diffs to fix each failure. Do not apply any fixes. Wait for the user to approve and run them.

---

Current branch: !`git branch --show-current`
Changed files vs main: !`git diff --name-only main...HEAD`
