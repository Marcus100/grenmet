# Contributing

This guide covers everything you need to contribute to the Grenmet monorepo — branching, commits, what to run before you push, and the conventions the codebase enforces.

## Prerequisites

Make sure you have the full dev environment set up first. See the [Quick Start](README.md#quick-start) in the root README, then the [Technical Overview](docs/technical-overview.md) for how the pieces connect.

---

## Branching strategy

```
main          ← production; protected; never commit directly
staging       ← pre-production; deploy target for staging environment
dev           ← integration branch; all feature work merges here first
feature/*     ← your working branch; always branch off dev
```

**Day-to-day flow:**

```bash
git checkout dev
git pull origin dev
git checkout -b feature/your-feature-name

# ... do your work ...

git push origin feature/your-feature-name
# open a PR → dev
```

Merges go: `feature/* → dev → staging → main`. Never merge directly to `main` or `staging`.

> **Workflow-trigger note:** the staging pipeline (`pipeline-staging.yml`) and
> everything it calls run from the **pushed ref**, so staging workflow changes take
> effect on the branch itself. The exceptions are `schedule`/`workflow_run`-triggered
> workflows (`backup-database.yml`, `smokeshow.yml`) and `workflow_dispatch` defaults —
> GitHub executes those from **`main`**, so promote changes to them before expecting
> effect.

---

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change with no behaviour change |
| `chore` | Dependency updates, config, tooling |
| `style` | Formatting (no logic change) |
| `test` | Adding or updating tests |
| `perf` | Performance improvement |

**Scope** is the app or package affected: `admin-gms`, `spicewx`, `auth`, `ui`, `api-client`, `fastapi`, `ci`, etc.

**Examples:**

```
feat(admin-gms): add midday forecast PDF export
fix(auth): redirect loop when session cookie is missing
docs(env): document return-host allowlist
chore(deps): bump next to 16.1.2
```

Keep the subject line under 72 characters. Add a body when the why isn't obvious from the what.

---

## Before you commit

Always run these two commands before pushing:

```bash
pnpm fix          # auto-fix lint and formatting (Biome via Ultracite)
pnpm type-check   # TypeScript across all packages
```

To scope to just the package you changed (faster):

```bash
turbo run check:fix type-check --filter=@grenmet/web-admin
```

If you changed FastAPI:

```bash
cd apps/api/fastapi
./scripts/format.sh
./scripts/lint.sh
```

**CI will fail** if either `pnpm check:ci` or `pnpm type-check` fail. Fix locally before pushing.

### Git hooks

`pnpm install` runs Husky's `prepare` script and installs the repository hooks.
If hooks are missing after an install, run `pnpm prepare`.

The pre-commit hook keeps commit-time checks staged and fast:

| Staged paths | Check |
|---|---|
| JS, TS, JSON, and CSS | Biome check and formatting through lint-staged |
| `apps/api/fastapi/**/*.py` | Ruff fixes and formatting |
| All staged paths | Blast-radius companion rules |

lint-staged temporarily protects unstaged edits while it formats the staged
version, then restores those edits. The repository's nested
`apps/api/fastapi/.pre-commit-config.yaml` remains available to developers who
run the Python `pre-commit` tool directly.

For an intentionally partial local commit, bypass only the blast-radius rule:

```bash
SKIP_BLAST_RADIUS=1 git commit -m "wip: partial change"
```

This does not bypass Biome or Ruff. It has no effect on CI range checks.

The pre-push hook runs the complete TypeScript validation:

```bash
pnpm type-check
pnpm test
```

If either command fails, the push stops. Fix the failure and rerun the failing
command before pushing again.

### Blast-radius checker

Use the same checker directly when preparing a commit or pull request:

```bash
pnpm guardrails:staged
pnpm guardrails --base <base-sha> --head <head-sha>
pnpm test:guardrails
```

The checker blocks these incomplete changes:

- FastAPI routers, schemas, or `src/main.py` without a changed
  `openapi.json`, generated API client, and `docs/api/contracts.md`
- A changed `openapi.json` without generated files under
  `packages/api-client/src/gen/`
- A janitorial, transport, wxproducts, or wxwatch Drizzle schema without a
  change in its matching `apps/web/admin-gms/drizzle/<family>/` directory

Auth and shared UI changes print consumer-validation reminders. Auth validation
covers auth, admin-gms, hurricaneplan, spicewx, and signal, including the
`AUTH_API_URL` delegation paths in hurricaneplan and spicewx. Consolidated
admin route changes similarly require checking cap, hr, wxwatch, wxproducts, and
salesbus. Drizzle schema changes also remind you to verify the `web-migrate`
production service and the wxwatch and wxproducts databases. CI supplies the
mechanical enforcement available to the repository by requiring the full
type-check, test, and build jobs.

A failure names the rule, every triggering file, missing companion paths, and a
recovery command. Follow the reported action, stage or commit the companion
changes, and rerun the same checker command. If Git cannot resolve a supplied
SHA, fetch the base and head commits before retrying; comparison errors never
pass silently.

---

## Pull requests

- Open PRs against `dev`, not `main` or `staging`
- Keep PRs focused — one feature or fix per PR
- Fill in the PR description: what changed, why, how to test it
- Link any related issue if one exists
- Make sure the PR title follows the commit convention (GitHub squash-merges use it)

The CI pipeline runs automatically on every PR:
- Biome lint and format check
- TypeScript type check
- Repository blast-radius guardrails
- Documentation local-link and heading checks
- Design-system generated-block drift and warning contrast checks
- TypeScript unit tests across all workspace packages
- Build (all apps)
- For FastAPI: lint, type check, tests

All checks must pass before merging.

---

## Code conventions

These are enforced by Biome and TypeScript — you'll get errors if you break them.

### TypeScript

| Rule | Detail |
|---|---|
| No `any` | Use `unknown` and narrow. Biome flags `any`. |
| No `forwardRef` | React 19: pass `ref` as a prop directly |
| Server Components by default | Only add `"use client"` when you need interactivity or browser hooks |
| No `process.env` directly | Use the typed `env` object from the app's `src/env.ts` |
| Path aliases | Use `@/` (maps to `src/`) not relative `../../` for cross-directory imports |

### Dependencies

| Rule | Detail |
|---|---|
| Shared deps use `catalog:` | Reference versions from `pnpm-workspace.yaml` catalog, never hardcode |
| UI from `@grenmet/ui` | Don't reimplement primitives; import from the shared library |
| API calls via `@grenmet/api-client` | Don't write raw fetch calls to FastAPI endpoints in web apps |

### Database (owned by admin-gms)

| Rule | Detail |
|---|---|
| Schema changes → always regenerate | After editing `apps/web/admin-gms/src/db/<family>/schema.ts` or `schema/`, run `pnpm db:<family>:generate` from `apps/web/admin-gms` for janitorial, transport, wxproducts, or wxwatch |
| Never edit `src/gen/` manually | These are generated by Kubb from `openapi.json`; regenerate via `pnpm generate:api-client` |

### Generated files

`packages/api-client/src/gen/` is committed. When FastAPI routes change:

1. Update `apps/api/fastapi/openapi.json`
2. Run `pnpm generate:api-client` from the repo root
3. Update `docs/api/contracts.md`
4. Commit `openapi.json`, `src/gen/`, and the contract documentation

CI checks that these stay in sync. If the check fails, regenerate and commit.

---

## Adding a new web app

If you're ever scaffolding a new app:

1. Copy an existing simple app (e.g. `spicewx`) as a starting point
2. Add it to `pnpm-workspace.yaml`
3. Add a `turbo.json` task entry if needed
4. Add its dev script to the root `package.json`
5. Add it to the workspace layout table in `README.md`
6. Add its env vars to `docs/env.md`
7. Create a `README.md` following the [app README template](#app-readme-template)

### App README template

```markdown
# AppName (`@grenmet/web-appname`)

One-paragraph description of what this app does and who it's for. Port **XXXX**.

## Development

From repo root:

\```bash
pnpm install
cp apps/web/appname/.env.local.example apps/web/appname/.env.local
pnpm dev:web:appname
\```

The app runs on `http://localhost:XXXX`.

## Run from app directory

\```bash
cd apps/web/appname
pnpm dev
\```

## Environment Variables

See `.env.local.example` for required values:

- `VARIABLE_NAME` — description

## Quality Commands

\```bash
pnpm check
pnpm check:ci
pnpm type-check
\```
```

---

## Getting help

- **Architecture and how things connect:** [docs/technical-overview.md](docs/technical-overview.md)
- **Environment variables:** [docs/env.md](docs/env.md)
- **Something broken:** [docs/troubleshooting.md](docs/troubleshooting.md)
- **Design system:** [docs/design-system.md](docs/design-system.md)
