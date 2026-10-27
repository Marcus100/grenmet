# ADR-0052: Shared, signed Turborepo remote cache for local runs and CI

## Status

Accepted — 2026-10-26. Amends the CI cache bullet of ADR-0019 ("A GitHub Actions
cache is enough: no remote-cache service, secrets or vendor").

## Context

The owner wants changes to reach dev, staging and production as fast as possible
(issue #750) and works from a laptop, cloud sessions and a phone. ADR-0019 cached
Turborepo task results per CI job in the GitHub Actions cache. That cache is not
shared between jobs, between CI and local runs, or between agent worktrees, so a
type-check or test an agent already ran locally runs again in CI, and every job
saves a fresh entry against the repository's 10 GB cache limit.

The owner decided on 26 October 2026 to use Vercel's free remote cache, with
signed artifacts, read-only for pull requests.

## Evidence

- **Facts:**
  - Turborepo 2.11.8 supports a remote cache through `TURBO_TOKEN` and `TURBO_TEAM`
    ([Turborepo CI docs](https://turborepo.dev/repo/docs/ci)), signed artifacts with
    `remoteCache.signature` and `TURBO_REMOTE_CACHE_SIGNATURE_KEY`, and cache modes
    through `TURBO_CACHE` (for example `local:rw,remote:r`). High.
  - Measured locally on 26 October 2026 with signing on: a task run from an empty
    local cache with `TURBO_CACHE=local:rw,remote:r` was a remote hit and replayed in
    1.7 s; with a wrong signing key the same artifact was refused and the task ran;
    with no key the task still passed and Turborepo only warned that it could not
    sign. High.
  - Vercel's remote cache has no charge on the account's plan. Medium (vendor
    terms can change).
- **Interpretation:**
  - Signing means only holders of the key can produce artifacts CI accepts, so a
    cache entry cannot be forged by anyone with only the Vercel token. Best practice.
  - Pull requests from this repository receive the secrets; forks and Dependabot do
    not, so they run with the remote cache off and are unaffected. Heuristic.
- **Uncertainty:** a same-repository pull request receives the signing key and could
  in principle sign a poisoned artifact. The repository's only contributors are the
  owner and the owner's agents, so this is accepted; revisit if outside contributors
  open pull requests from this repository. Medium.

## Options considered

1. **Keep the per-job GitHub Actions cache (ADR-0019).** No secrets or vendor; no
   sharing between jobs, CI and local runs; churns the 10 GB repository cache.
2. **Self-hosted or GitHub-cache-backed remote cache** (for example a cache server
   action). Free and in-house, but another component to run or trust, and local
   runs cannot reach a GitHub Actions cache.
3. **Vercel remote cache, signed, read-only for pull requests (chosen).** Shared by
   CI jobs, local runs and agent worktrees; one token and one key to manage; a
   vendor dependency that degrades to local caching if it is unavailable.

## Decision

Use Vercel's remote cache with `"remoteCache": { "signature": true }` in
`turbo.json`. CI sets `TURBO_TOKEN`, `TURBO_TEAM` and
`TURBO_REMOTE_CACHE_SIGNATURE_KEY` for the web workflow, with
`TURBO_CACHE=local:rw,remote:r` on pull requests and `local:rw,remote:rw` on
pushes. Local runs use `turbo login` and `turbo link` (main checkout) or
`TURBO_TEAM` (worktrees), with the signing key from a private file outside the
repository. The GitHub Actions cache of `.turbo/cache` (ADR-0019) stays as the
local layer.

## Consequences

- A task result produced anywhere with the key is reused everywhere: CI skips
  checks an agent already ran, and agents skip what CI already ran.
- Rotating the token or key is an owner task (Vercel account settings and the
  repository secrets); a rotated key invalidates existing artifacts, which only
  costs one cold run.
- If the remote cache is unreachable, Turborepo falls back to the local cache and
  runs the tasks; nothing fails.
