# ADR-0001: Use A Pnpm And Turborepo Monorepo

## Status

Accepted

## Context

GrenMet contains multiple Next.js apps, one FastAPI backend, shared TypeScript packages, a generated API client, and shared design-system primitives.

## Decision

Use a single repository with pnpm workspaces and Turborepo for TypeScript apps and packages. Keep the FastAPI app in the same repo but outside pnpm workspace management.

## Consequences

- Shared packages can be changed and tested with consuming apps in one branch.
- `catalog:` dependency versions keep shared frontend dependencies aligned.
- Root commands can run broad quality checks across apps.
- Python API tooling remains separate through `uv`, Docker Compose, and API-specific scripts.
- The repo needs strong documentation to prevent cross-app drift.

