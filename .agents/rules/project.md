---
trigger: always_on
alwaysApply: true
---

# Project instructions

This repository's canonical agent instructions are in `AGENTS.md` (repo root)
and in nested `AGENTS.md` files, one per app, package, and FastAPI domain.
Read the root file first, then the nested `AGENTS.md` for any directory you
edit.

- Backend (Python/FastAPI): `apps/api/fastapi/AGENTS.md` (follows
  zhanymkanov/fastapi-best-practices, with repo-specific rules) and
  `apps/api/fastapi/src/<domain>/AGENTS.md`.
- Frontend (TypeScript/React): `.agents/rules/ultracite.mdc` for code style,
  plus `apps/web/<app>/AGENTS.md` and `packages/<pkg>/AGENTS.md`.
- End-to-end feature path: `docs/playbooks/full-stack-feature.md`.
