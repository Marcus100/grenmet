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

The owner decided on 26 October 2026 to use Vercel's free remote cache with
signed artifacts. A security review the same day found that a stored Vercel token
would let any pull-request job act on the owner's whole Vercel team (which also
hosts a client site), and that a "read-only" setting in the workflow is only a
request. The owner then chose short-lived OIDC tokens limited to trusted branches
(option 4 in the review thread).

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
  - Vercel's OIDC login exchanges a GitHub OIDC token for a short-lived Turborepo
    access token that "only grants access to Vercel Remote Cache" and is associated
    with the team, not a person ([Vercel docs](https://vercel.com/docs/monorepos/remote-caching/external-ci-cd)).
    A policy can be restricted to a repository and a branch or workflow. High.
- **Interpretation:**
  - A pull-request run carries a `pull_request` OIDC subject, so policies limited to
    the `dev` and `staging` branches never issue it a token: it cannot write to the
    cache whatever its workflow says. Best practice (the same design Next.js uses).
  - Signing means entries without the owner's key are refused, so a leaked token alone
    cannot plant results. Best practice.
  - Forks and Dependabot receive no secrets and no OIDC permission and run with the
    local cache only. Heuristic.
- **Uncertainty:** how Vercel matches the branch claim in its policy form (exact
  branch or pattern); release runs (`refs/tags/*`) have no policy yet and fall back to
  the local cache; the signing key is still a repository secret readable by any
  same-repository pull request, but without a token it cannot be used to write.
  Medium.

## Options considered

1. **Keep the per-job GitHub Actions cache (ADR-0019).** No secrets or vendor; no
   sharing between jobs, CI and local runs; churns the 10 GB repository cache.
2. **Self-hosted or GitHub-cache-backed remote cache** (for example a cache server
   action). Free and in-house, but another component to run or trust, and local
   runs cannot reach a GitHub Actions cache.
3. **Vercel remote cache, signed, with short-lived OIDC tokens on trusted branches
   (chosen).** Shared by CI jobs, local runs and agent worktrees; no stored Vercel
   token; one signing key to manage; a vendor dependency that degrades to local
   caching if it is unavailable.

## Decision

Use Vercel's remote cache with `"remoteCache": { "signature": true }` in
`turbo.json`. In CI, the three jobs that run Turborepo (type-check, TypeScript tests,
gaa-admin tests) log in with `vercel/setup-turborepo-remote-cache-action`, pinned to a
commit, through the shared `setup-node` action (`turbo-remote-cache: "true"`), only on
events other than `pull_request`, and never fail the job if the login is refused. The
Vercel team has one Turborepo CLI policy per trusted branch (`dev`, `staging`). Those
runs set `TURBO_CACHE=local:rw,remote:rw` and the signing key; pull requests set
`TURBO_CACHE=local:rw` and no key. `pipeline-staging` and `pipeline-prod` grant
`id-token: write` to the web CI they call. No Vercel token is stored in GitHub. Local
runs use `turbo login` and `turbo link` (main checkout) or `TURBO_TEAM` (worktrees),
with the signing key from a private file outside the repository. The GitHub Actions
cache of `.turbo/cache` (ADR-0019) stays as the local layer.

## Consequences

- A task result produced on a trusted branch or on the owner's machine is reused
  everywhere trusted: promotions skip checks `dev` already ran, and local runs skip
  what CI already ran.
- Pull requests do not get remote hits; they keep the per-branch GitHub cache.
- Adding a trusted branch or the release tags means adding a Vercel policy; until then
  those runs use the local cache.
- Rotating the signing key is an owner task (repository secret and the private key
  file); a rotated key invalidates existing artifacts, which only costs one cold run.
- If the remote cache or the login is unavailable, Turborepo falls back to the local
  cache and runs the tasks; nothing fails.
