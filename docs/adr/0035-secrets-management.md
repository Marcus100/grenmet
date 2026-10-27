# ADR-0035: Secrets management

## Status

Accepted (owner decision, 2026-10-20).

## Context

Secrets live in several places. Staging and production secrets come from GitHub Environments and are written to a temporary `.env` on the runner during deployment (`docs/security.md`, `docs/infrastructure.md`). Elections and Babydoll run on Vercel and keep their own variables there (`docs/env.md`, `apps/web/babydoll/AGENTS.md`). The repository is public.

## Decision

1. One source of truth per environment.
   - GitHub environment secrets feed the droplets.
   - Vercel holds only the secrets of sites hosted there, such as Babydoll.
2. No copies on laptops beyond gitignored local-development `.env` files. Those hold no production values.
3. Stripe keys are restricted keys with only the permissions needed.
4. Rotate every secret yearly, and immediately after any suspected leak.
5. Every secret has a named owner and a documented use.
6. The inventory (name, owner, use, last rotation) stays out of the public repo, in `/private/`. Only this process is public.

## Consequences

- Enforcement that already exists:
  - `.claude/hooks/protect-files.mjs` blocks agents writing real `.env*` files.
  - The `Secret Scan` workflow (`.github/workflows/secret-scan.yml`) runs gitleaks on the commits a PR or `dev` push adds.
  - FastAPI rejects weak or default secrets outside local environments (`apps/api/fastapi/src/config.py`, per `docs/security.md`).
- Rotation is manual and not yet scheduled. Some secrets cannot rotate silently: rotating `EMAIL_HASH_PEPPER` makes stored hashes unmatchable (`docs/env.md`), so its runbook must say so.
- The `/private/` inventory does not exist in git by design; the owner creates and keeps it.
