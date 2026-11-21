---
name: pre-merge
description: "Runs the pre-merge checklist (types, lint, Docker image names, env drift, OpenAPI and API client sync, GitHub Actions SHA pinning) and reports each failure with its exact fix; applies the fixes when the agent is landing its own branch, and stays read-only when asked for a review. Use when about to merge or promote a branch, or when the user asks whether a branch is ready to merge."
allowed-tools: Bash(pnpm *), Bash(turbo run *), Bash(gh *), Bash(git *), Bash(uv run *), Bash(cd apps/api/fastapi *)
---

## Pre-Merge Check

Run the checks one heavy command at a time (on the shared machine they go through `~/.local/bin/heavy`; the hooks enforce it). **First pass is analysis only — list findings and show exact fix commands.**

**1. Types**
Run `pnpm type-check`. Report all errors grouped by package.

**2. Lint**
Run `pnpm check`. Report all violations grouped by file.

**3. Docker image names**
Read every `*.yml` file under `.github/workflows/`. Verify all Docker image names are lowercase and consistent between the `build` and `deploy` jobs. Flag any mismatch.

**4. Env drift**
For each app's `.env.local.example`, verify every variable is either referenced in `docker-compose.yml`, the relevant workflow, or the app's `env.ts`. Flag variables defined in `.env.local.example` but missing from runtime config, and vice versa.

**5. API client sync**
Two layers — `pnpm check:drift` only covers the first, so check both:
- a. **Spec ↔ generated client**: run `pnpm check:drift`.
- b. **Code ↔ spec** (the known blind spot): generate the spec in memory and
  compare it with the working-tree file without editing either one —
  `cd apps/api/fastapi && uv run --frozen --package fast-back python -c "from src.main import app; import difflib, json, pathlib, sys; path = pathlib.Path('openapi.json'); committed = path.read_text(encoding='utf-8'); generated = json.dumps(app.openapi(), indent=2); diff = ''.join(difflib.unified_diff(committed.splitlines(keepends=True), generated.splitlines(keepends=True), fromfile=str(path), tofile='generated from src')); print(diff, end=''); sys.exit(committed != generated)"`.
  A nonzero exit means a route changed without regeneration — flag it and show
  the generated diff. The check must never overwrite or restore
  `apps/api/fastapi/openapi.json`.

**6. GitHub Actions pinning**
Grep all workflow YAMLs for `uses:` lines. Flag any action pinned to a tag (e.g. `@v3`) rather than a SHA.

---

**Output format:**
```text
✅ Types — clean
❌ Lint — 3 violations in apps/web/gms/src/...
✅ Docker image names — consistent
⚠️  Env drift — AUTH_ALLOWED_RETURN_HOSTS missing from hr workflow
✅ API client sync — in sync
❌ GH Actions pinning — actions/checkout@v4 in deploy.yml (needs SHA)
```

List the exact commands or diffs to fix each failure. Then:

- **Landing your own branch** (a `/commit` or routine flow): apply the fixes inside the task's scope, rerun the failed checks and report the new table. Stop at the root `AGENTS.md` Ask First and Never boundaries.
- **Asked for a review** ("is this ready to merge?", a review-only request, someone else's branch): edit nothing; the table and the fix list are the deliverable.

---

Live context (Claude Code fills these in; in Codex, run the commands):

Current branch: !`git branch --show-current`
Changed files vs dev: !`git diff --name-only origin/dev...HEAD`
