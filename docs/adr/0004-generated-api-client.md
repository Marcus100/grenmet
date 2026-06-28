# ADR-0004: Generate The TypeScript API Client From FastAPI OpenAPI

## Status

Accepted

## Context

The web apps need typed access to FastAPI endpoints without duplicating schemas by hand.

## Decision

Generate `@grenmet/api-client` with Kubb from `apps/api/fastapi/openapi.json`. Commit generated files under `packages/api-client/src/gen`.

## Consequences

- FastAPI route changes must update OpenAPI and regenerate the client.
- Web apps should consume generated client types and hooks instead of writing raw endpoint contracts.
- CI regenerates the client and fails when committed generated output is stale.
- Generated files must not be edited manually.

