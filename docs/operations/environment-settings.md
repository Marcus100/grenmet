# Environment settings drift check (#1146)

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-08

`staging` and `production` hold their deploy settings as GitHub environment
secrets and variables. Nothing kept the two lists aligned, so names drifted
(for example `DO_SPACES_*` on staging and `STORAGE_*` on production). The
check below compares the **names** in each environment with a checked-in
manifest. It never reads or prints a value.

## Run it

```bash
pnpm ops:environment-settings          # text report; exit 1 on drift
node scripts/ci/check-environment-settings.mjs --json
```

It needs a `gh` login, or a `GH_TOKEN`, that can list environment secrets and
variables. That means repository admin, or a fine-grained token with
**Environments: read**, **Secrets: read** and **Variables: read**. The default
Actions `GITHUB_TOKEN` cannot list them.

## The manifest

`scripts/ci/environment-settings.json` lists the expected names per kind
(`secrets`, `variables`):

| Section | Meaning | When the name is missing | When the name is present |
| --- | --- | --- | --- |
| `shared` | Required in every listed environment | fails | passes |
| `only.<env>` | Required in that environment alone; each name has a reason | fails | passes; fails in any other environment |
| `pending.<env>` | Known drift, tolerated until someone resolves it; each name has a reason | listed | listed |

Any name that is in an environment but not in the manifest fails as
`UNEXPECTED`. A name listed twice for the same environment, an invalid name,
or an unknown environment makes the manifest invalid.

## When it fails

- **UNEXPECTED:** someone added a setting. If it is meant to exist, add it to
  `shared` (and to the other environment), or to `only.<env>` with the reason.
  If not, remove it from the environment.
- **MISSING:** a required setting was removed or never added. Add it to the
  environment, or move it out of `shared` with a reason.
- **pending:** each run lists these. Resolve one by aligning the environments
  (for example, rename `DO_SPACES_*` to `STORAGE_*` once the backup workflows
  read the new names), then move the name to `shared` or `only`.

Environment-level names only: repository-level secrets, and the
`*-monitoring`, `production-backup` and `build` environments, are not compared.
To compare one of those, add it to `environments` and give it a section.
