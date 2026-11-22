# Environment settings drift check (#1146)

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-21

`staging` and `production` hold their deploy settings as GitHub environment
secrets and variables. Nothing kept the two lists aligned, so names drifted
(for example `DO_SPACES_*` on staging and `STORAGE_*` on production). The
check below compares the **names** in each environment with a checked-in
manifest. It never prints a value. The API never returns secret values. It does
return each variable's value; `gh` filters the response with `--jq` so only the
name reaches the script, and the value is discarded.

## Run it

```bash
pnpm ops:environment-settings          # text report; exit 1 on drift
node scripts/ci/check-environment-settings.mjs --json
```

| Exit code | Meaning |
| --- | --- |
| 0 | Every environment matches the manifest. |
| 1 | Real drift (`MISSING` or `UNEXPECTED`), or an invalid manifest. |
| 2 | The check could not run: `gh` or the API failed (not logged in, token lacks scope, network), or an argument was wrong. The reason is on stderr. This is not evidence of drift. |

It needs a `gh` login, or a `GH_TOKEN`, that can list environment secrets and
variables: repository admin, or the fine-grained token below. The default
Actions `GITHUB_TOKEN` cannot list them.

## Daily run

`.github/workflows/environment-settings-drift.yml` runs the check every day at
06:41 UTC, and on demand. It reads the token from the repository secret
`ENVIRONMENT_SETTINGS_TOKEN`. Until that secret exists, the job prints a notice
and passes.

### The token

The script calls two endpoints per environment, nothing else:
`GET /repos/Marcus100/grenmet/environments/<env>/secrets` and
`GET /repos/Marcus100/grenmet/environments/<env>/variables`. GitHub lists both
under the fine-grained permission **Environments: read**. Create it at
**Settings → Developer settings → Fine-grained tokens** (owner account):

| Field | Value |
| --- | --- |
| Resource owner | `Marcus100` |
| Repository access | Only select repositories: `Marcus100/grenmet` |
| Repository permissions | **Environments: Read-only**; **Metadata: Read-only** (GitHub adds it to every token) |
| Everything else | No access. **Secrets** and **Variables** cover repository-level settings, which the check does not read |
| Expiry | The shortest you will renew; the job then prints a notice until the new token is saved |

Save it as the repository secret `ENVIRONMENT_SETTINGS_TOKEN`
(**Settings → Secrets and variables → Actions → New repository secret**). A
token without Environments read makes the job exit 2 ("could not run"), not 1.

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
- **pending:** each run lists these. Resolve one by aligning the environments,
  then move the name to `shared` or `only`. Application storage reads
  `STORAGE_*` everywhere; staging's five `STORAGE_*` are pending until the owner
  adds them (deploys fall back to `DO_SPACES_*` with a notice until then).
  `DO_SPACES_BUCKET`, `_ENDPOINT` and `_REGION` stay in both environments as
  the backup store. Names pending as "leftover: delete from both environments"
  pass whether or not they are still there.

Environment-level names only: repository-level secrets, and the
`*-monitoring`, `production-backup` and `build` environments, are not compared.
To compare one of those, add it to `environments` and give it a section.
